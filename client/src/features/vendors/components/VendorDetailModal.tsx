import { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { Modal, Button, FileUpload, InfoTip, UploadOverlay } from '@/shared/components'
import { useToast } from '@/shared/components'
import { findProductByNameAndBrand, matchKey } from '@/shared/lib/matching'
import { parseVendorPriceCSV, parseVendorPriceExcel, type VendorPriceRow } from '../lib/vendorCsv'
import { parseVendorPriceImageWithOpenAI } from '../lib/vendorImageParse'
import { downloadVendorCsvTemplate } from '../lib/vendorCsvTemplate'
import {
  computeVendorScore,
  computeVendorStatus,
  daysSinceUpdate,
  getScoreColor,
  getStatusBadge,
  isUpdatedThisWeek,
} from '../lib/vendorScore'
import { stripPackFromName } from '@/lib/pack/parsePack'
import { AddProductToVendorModal } from './AddProductToVendorModal'
import { BulkScreenshotImport } from './BulkScreenshotImport'
import type { BulkExtractedRow } from '../lib/vendorBulkParse'

type ImportMode = 'upload' | 'bulk'

interface ReviewRow extends VendorPriceRow {
  selected: boolean
  matchedProductName?: string
}

export function VendorDetailModal({
  open,
  onClose,
  vendorId,
  onEdit,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  vendorId: string | null
  onEdit?: (vendor: { id: string; name: string; phone: string; notes: string }) => void
  onDelete?: (vendor: { id: string; name: string; phone: string; notes: string }) => void
}) {
  const toast = useToast()
  const state = useStore((s) => s)
  const vendor = useStore((s) =>
    vendorId ? s.vendors.find((v) => v.id === vendorId) : null
  )
  const setVendorPrice = useStore((s) => s.setVendorPrice)
  const removeVendorPrice = useStore((s) => s.removeVendorPrice)
  const clearVendorPrices = useStore((s) => s.clearVendorPrices)
  const addProduct = useStore((s) => s.addProduct)
  const setMatch = useStore((s) => s.setMatch)
  const addActivity = useStore((s) => s.addActivity)
  const updateVendor = useStore((s) => s.updateVendor)
  const addVendorPriceUpload = useStore((s) => s.addVendorPriceUpload)
  const settings = useStore((s) => s.settings)

  const [addProductOpen, setAddProductOpen] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode | null>(null)
  const [bulkFiles, setBulkFiles] = useState<File[] | null>(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null)
  const [csvStatus, setCsvStatus] = useState<{
    type: 'success' | 'error'
    message: string
    errors?: { row: number; message: string }[]
    notFound?: string[]
  } | null>(null)
  const [showUploadHistory, setShowUploadHistory] = useState(false)
  const [showRenewConfirm, setShowRenewConfirm] = useState(false)
  const [overlayStatus, setOverlayStatus] = useState<'loading' | 'success' | 'error' | null>(null)
  const [overlayMessage, setOverlayMessage] = useState('')
  // Vendor items that didn't match any catalog product — offered for explicit
  // adding, never auto-created (the catalog is what the STORE carries).
  const [unmatchedOffers, setUnmatchedOffers] = useState<VendorPriceRow[] | null>(null)
  const [offerSel, setOfferSel] = useState<Set<number>>(new Set())

  const vendorUploads = useMemo(() => {
    if (!vendor) return []
    return (state.vendorPriceUploads ?? [])
      .filter((u) => u.vendorId === vendor.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [vendor, state.vendorPriceUploads])

  if (!vendor) return null

  const prices = state.vendorPrices
    .filter((vp) => vp.vendorId === vendor.id)
    .map((vp) => ({
      ...vp,
      product: state.products.find((p) => p.id === vp.productId),
    }))
    .filter((p) => p.product)

  const latestUpload = vendorUploads[0] ?? null
  const status = computeVendorStatus(vendor)
  const score = computeVendorScore(vendor, latestUpload ?? undefined)
  const days = daysSinceUpdate(vendor)
  const badge = getStatusBadge(status)
  const isStale = (vendor.staleAfterDays ?? 7) < (days ?? 9999)

  const handlePriceChange = (productId: string, value: string) => {
    const num = parseFloat(value)
    if (Number.isNaN(num) || num < 0) return
    setVendorPrice({
      vendorId: vendor.id,
      productId,
      unitPrice: num,
      updatedAt: new Date().toISOString(),
    })
    addActivity('vendor_price_updated', `Vendor prices updated: ${vendor.name}`)
    toast.show('Price updated!')
  }

  const handleRenewList = () => {
    const oldCount = state.vendorPrices.filter((vp) => vp.vendorId === vendor.id).length
    clearVendorPrices(vendor.id)
    setShowRenewConfirm(false)
    setCsvStatus(null)
    setImportMode('upload')
    addActivity('vendor_price_updated', `Vendor list renewed: ${vendor.name} — ${oldCount} old prices removed`)
    toast.show(`Removed ${oldCount} prices. Now upload the new list.`)
  }

  const handleRemovePrice = (productId: string) => {
    if (!window.confirm('Remove this product from price list?')) return
    removeVendorPrice(vendor.id, productId)
    toast.show('Product removed!')
  }

  /** Vendor item codes (e.g. "B0010:0011") are NOT store barcodes — only
   *  digit strings that look like real barcodes may become a product SKU. */
  const isLikelyBarcode = (sVal: string) => /^\d{8,14}$/.test(sVal.trim())

  const saveVendorPrice = (row: VendorPriceRow, productId: string) => {
    const now = new Date().toISOString()
    const effectiveUnitCost =
      row.packType === 'CASE' && row.priceBasis === 'PER_CASE' && (row.unitsPerCase ?? 1) > 0
        ? row.price / (row.unitsPerCase ?? 1)
        : row.price
    setVendorPrice({
      vendorId: vendor.id,
      productId,
      unitPrice: row.price,
      updatedAt: now,
      packType: row.packType ?? 'UNIT',
      unitsPerCase: row.unitsPerCase ?? 1,
      unitDescriptor: row.unitDescriptor ?? '',
      priceBasis: row.priceBasis ?? 'PER_UNIT',
      parseVersion: 1,
      unitCost: effectiveUnitCost,
    })
  }

  /** Explicit user choice: create the product in the catalog + attach price. */
  const addOfferToCatalog = (row: VendorPriceRow) => {
    const effectiveUnitCost =
      row.packType === 'CASE' && row.priceBasis === 'PER_CASE' && (row.unitsPerCase ?? 1) > 0
        ? row.price / (row.unitsPerCase ?? 1)
        : row.price
    const productId = addProduct({
      name: row.name,
      brand: row.brand,
      sku: isLikelyBarcode(row.sku) ? row.sku : '',
      category: '',
      unitSize: row.unitSize || '',
      minStock: settings?.defaultMinStock ?? 10,
      unitCost: effectiveUnitCost,
    })
    setMatch(matchKey(row.name, row.brand), productId)
    if (row.sku) setMatch(`vsku|${vendor.id}|${row.sku}`, productId)
    saveVendorPrice(row, productId)
  }

  const handleAddSelectedOffers = () => {
    if (!unmatchedOffers) return
    const chosen = [...offerSel].map((i) => unmatchedOffers[i]).filter(Boolean)
    if (chosen.length === 0) {
      toast.show('Select at least one item first', 'error')
      return
    }
    chosen.forEach(addOfferToCatalog)
    const remaining = unmatchedOffers.filter((_, i) => !offerSel.has(i))
    setUnmatchedOffers(remaining.length ? remaining : null)
    setOfferSel(new Set())
    addActivity(
      'vendor_price_updated',
      `Added ${chosen.length} vendor item(s) to catalog: ${vendor.name}`
    )
    toast.show(`${chosen.length} product(s) added to your catalog with this vendor's price`)
  }

  const applyPriceRows = (rows: VendorPriceRow[], source: 'csv_upload' | 'whatsapp_parse', fileName: string, parseStats?: { rowCount: number; validRowCount: number; invalidRowCount: number; hasSkuPercent: number; errors: { row: number; message: string }[] }) => {
    let priceAdded = 0
    let priceUpdated = 0
    const unmatched: VendorPriceRow[] = []

    rows.forEach((row) => {
      // Vendor-code memory: once a vendor's own item code has been matched to
      // one of our products, every future list from that vendor resolves it
      // instantly — codes are stable week to week even when names drift.
      const vskuKey = row.sku ? `vsku|${vendor.id}|${row.sku}` : null
      let product = vskuKey && state.matches[vskuKey]
        ? state.products.find((p) => p.id === state.matches[vskuKey]) ?? null
        : null

      if (!product) {
        product = findProductByNameAndBrand(
          row.name,
          row.brand,
          state.products,
          state.matches,
          row.sku
        )
      }

      // The catalog is what the STORE carries, not what the vendor sells.
      // Unmatched vendor items are offered for explicit adding below — never
      // auto-created into the client's catalog.
      if (!product) {
        unmatched.push(row)
        return
      }

      // Remember this vendor's item code → product for next week's list.
      if (vskuKey) setMatch(vskuKey, product.id)

      const existing = state.vendorPrices.find(
        (vp) => vp.vendorId === vendor.id && vp.productId === product!.id
      )
      saveVendorPrice(row, product.id)
      if (existing) priceUpdated++
      else priceAdded++
    })

    setUnmatchedOffers(unmatched.length > 0 ? unmatched : null)
    setOfferSel(new Set())

    const now = new Date().toISOString()
    updateVendor(vendor.id, { lastPriceListAt: now, updatedAt: now })

    const coveragePercent = parseStats
      ? parseStats.validRowCount > 0
        ? Math.round(((priceAdded + priceUpdated) / parseStats.validRowCount) * 100)
        : 0
      : Math.round(((priceAdded + priceUpdated) / rows.length) * 100)

    addVendorPriceUpload({
      vendorId: vendor.id,
      source,
      fileName,
      parsedAt: now,
      rowCount: parseStats?.rowCount ?? rows.length,
      validRowCount: parseStats?.validRowCount ?? rows.length,
      invalidRowCount: parseStats?.invalidRowCount ?? 0,
      coveragePercent,
      hasSkuPercent: parseStats?.hasSkuPercent ?? Math.round((rows.filter((r) => r.sku).length / rows.length) * 100),
      createdAt: now,
    })

    const updatedLatest = {
      coveragePercent,
      hasSkuPercent: parseStats?.hasSkuPercent ?? Math.round((rows.filter((r) => r.sku).length / rows.length) * 100),
    }
    const newScore = computeVendorScore({ ...vendor, lastPriceListAt: now }, updatedLatest)
    const newStatus = computeVendorStatus({ ...vendor, lastPriceListAt: now })
    updateVendor(vendor.id, { score: newScore, status: newStatus })

    const parts = []
    if (priceAdded) parts.push(`${priceAdded} prices added`)
    if (priceUpdated) parts.push(`${priceUpdated} prices updated`)
    if (unmatched.length) parts.push(`${unmatched.length} items not in your catalog`)

    addActivity(
      'vendor_price_updated',
      `Vendor import: ${vendor.name} — ${parts.join(', ')}`
    )
    const resultText = `Imported! Prices added: ${priceAdded} | Updated: ${priceUpdated}${unmatched.length ? ` | Not in your catalog: ${unmatched.length} (review below)` : ''}`
    setCsvStatus({
      type: 'success',
      message: resultText,
      errors: parseStats?.errors,
    })
    setOverlayStatus('success')
    setOverlayMessage(resultText)
    setImportMode(null)
    setReviewRows(null)
  }

  const handleCsvFile = (file: File) => {
    setCsvLoading(true)
    setCsvStatus(null)
    setOverlayStatus('loading')
    setOverlayMessage('')

    const isExcel = /\.(xlsx?|xlsm|numbers)$/i.test(file.name) ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel'

    if (isExcel) {
      const reader = new FileReader()
      reader.onload = () => {
        const data = reader.result as ArrayBuffer
        const result = parseVendorPriceExcel(data)
        if ('error' in result) {
          setCsvStatus({ type: 'error', message: result.error })
          setOverlayStatus('error')
          setOverlayMessage(result.error)
          setCsvLoading(false)
          return
        }
        applyPriceRows(result.prices, 'csv_upload', file.name, {
          rowCount: result.rowCount,
          validRowCount: result.validRowCount,
          invalidRowCount: result.invalidRowCount,
          hasSkuPercent: result.hasSkuPercent,
          errors: result.errors,
        })
        setCsvLoading(false)
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => {
        const text = (reader.result as string) ?? ''
        const result = parseVendorPriceCSV(text)
        if ('error' in result) {
          setCsvStatus({ type: 'error', message: result.error })
          setOverlayStatus('error')
          setOverlayMessage(result.error)
          setCsvLoading(false)
          return
        }
        applyPriceRows(result.prices, 'csv_upload', file.name, {
          rowCount: result.rowCount,
          validRowCount: result.validRowCount,
          invalidRowCount: result.invalidRowCount,
          hasSkuPercent: result.hasSkuPercent,
          errors: result.errors,
        })
        setCsvLoading(false)
      }
      reader.readAsText(file, 'UTF-8')
    }
  }

  /**
   * One door for any price-list file. Spreadsheet-like files go through the
   * fast deterministic parser (free, instant); PDFs, photos and everything
   * else go through AI extraction with the review step.
   */
  const handleAnyFile = (file: File) => {
    const isSpreadsheet =
      /\.(csv|tsv|txt|xlsx?|xlsm|numbers)$/i.test(file.name) ||
      file.type === 'text/csv' ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel'
    if (isSpreadsheet) handleCsvFile(file)
    else void handleImageFile(file)
  }

  /**
   * The dropzone accepts several files at once (important on phones, where
   * the gallery picker multi-selects). One file keeps the normal flow;
   * two or more photos jump straight into the bulk photo importer with the
   * photos already loaded.
   */
  const handleAnyFiles = (files: File[]) => {
    if (files.length === 0) return
    if (files.length === 1) {
      handleAnyFile(files[0])
      return
    }
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length >= 2) {
      setBulkFiles(images)
      setImportMode('bulk')
      setCsvStatus(null)
      if (images.length < files.length) {
        toast.show('Loaded the photos. Other file types must be uploaded one at a time.')
      }
      return
    }
    // Mixed or multiple non-photo files: process the first, tell the user.
    toast.show('Multiple files at once only works with photos. Processing the first file.')
    handleAnyFile(files[0])
  }

  const handleImageFile = async (file: File) => {
    // AI extraction is included in the plan — runs via Estoqui's server.
    const apiKey = ''

    setImageLoading(true)
    setCsvStatus(null)
    setOverlayStatus('loading')
    setOverlayMessage('')
    try {
      const result = await parseVendorPriceImageWithOpenAI(file, apiKey)
      if ('error' in result) {
        toast.show(result.error, 'error')
        setOverlayStatus('error')
        setOverlayMessage(result.error)
        setImageLoading(false)
        return
      }
      const rows: ReviewRow[] = result.prices.map((r) => {
        const product = findProductByNameAndBrand(r.name, r.brand, state.products, state.matches, r.sku)
        return {
          ...r,
          unitSize: '',
          unitType: '',
          available: true,
          selected: true,
          matchedProductName: product ? `${product.name} ${product.brand}` : undefined,
        }
      })
      setReviewRows(rows)
      setOverlayStatus(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to process image'
      toast.show(msg, 'error')
      setOverlayStatus('error')
      setOverlayMessage(msg)
    }
    setImageLoading(false)
  }

  const handleReviewRowChange = (index: number, field: keyof VendorPriceRow, value: string) => {
    setReviewRows((prev) => {
      if (!prev) return prev
      const copy = [...prev]
      copy[index] = {
        ...copy[index],
        [field]: field === 'price' ? parseFloat(value) || 0 : value,
      }
      return copy
    })
  }

  const handleReviewToggle = (index: number) => {
    setReviewRows((prev) => {
      if (!prev) return prev
      const copy = [...prev]
      copy[index] = { ...copy[index], selected: !copy[index].selected }
      return copy
    })
  }

  const handleRemoveRow = (index: number) => {
    setReviewRows((prev) => prev ? prev.filter((_, i) => i !== index) : prev)
  }

  const handleReviewImport = () => {
    if (!reviewRows) return
    const selected = reviewRows.filter((r) => r.selected && r.name.trim())
    if (selected.length === 0) {
      toast.show('No valid rows selected', 'error')
      return
    }
    applyPriceRows(selected, 'whatsapp_parse', 'AI import')
  }

  const handleBulkImport = (rows: BulkExtractedRow[]) => {
    const priceRows: VendorPriceRow[] = rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      brand: r.brand,
      unitSize: r.unitSize,
      unitType: r.unitType,
      price: r.price,
      available: r.available,
      packType: r.packType,
      unitsPerCase: r.unitsPerCase,
      unitDescriptor: r.unitDescriptor,
      priceBasis: r.priceBasis,
    }))
    applyPriceRows(priceRows, 'whatsapp_parse', `Bulk import (${rows.length} products)`)
    setImportMode(null)
  }

  const selectedCount = reviewRows?.filter((r) => r.selected).length ?? 0

  return (
    <>
      <Modal open={open} onClose={onClose} title={vendor.name} maxWidth="900px">
        <div className="flex flex-col gap-5">
          {/* Compliance Summary Cards (on phones these drop below the upload flow) */}
          <div className="order-last sm:order-none grid grid-cols-2 sm:grid-cols-5 gap-3">
            <ComplianceCard
              label="Score"
              value={<span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>}
              tip="Quality score for this vendor. Based on how fresh their prices are and how complete their product list is. Higher is better."
            />
            <ComplianceCard
              label="Status"
              value={
                <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase ${badge.className}`}>
                  {badge.label}
                </span>
              }
              tip="Active = prices are up to date. Probation = getting old. Inactive = very outdated, needs a new price list."
            />
            <ComplianceCard
              label="Last Update"
              value={
                <span className={`text-sm font-medium tabular-nums ${isStale ? 'text-danger' : 'text-fg'}`}>
                  {days !== null ? (days === 0 ? 'Today' : `${days}d ago`) : 'Never'}
                  {isStale && <span className="block text-[10px] text-danger font-semibold">STALE</span>}
                </span>
              }
              tip="How long ago this vendor sent their last price list. If it says 'STALE', the prices may no longer be accurate."
            />
            <ComplianceCard
              label="Coverage"
              value={<span className="text-lg font-semibold text-fg">{latestUpload ? `${latestUpload.coveragePercent}%` : '-'}</span>}
              tip="How many products from this vendor's list matched your catalog. 100% means everything matched."
            />
            <ComplianceCard
              label="SKU %"
              value={<span className="text-lg font-semibold text-fg">{latestUpload ? `${latestUpload.hasSkuPercent}%` : '-'}</span>}
              tip="How many of this vendor's products have a barcode (SKU). Barcodes help match products correctly."
            />
          </div>

          {isStale && (
            <div className="bg-danger-bg border border-danger/30 rounded-lg px-3 py-2 text-sm text-danger flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-[240px]">
                Data is stale — last price list is {days}+ days old (threshold: {vendor.staleAfterDays ?? 7} days).
              </span>
              <button
                type="button"
                onClick={() => { setImportMode('upload'); setCsvStatus(null) }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-danger text-white hover:opacity-90 transition-opacity shrink-0"
              >
                Upload new list
              </button>
            </div>
          )}

          {/* Weekly update notification */}
          {isUpdatedThisWeek(vendor) ? (
            <div className="bg-success-bg border border-success/30 rounded-lg px-3 py-2 text-sm text-success flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Updated this week — list is current.
            </div>
          ) : (
            <div className="bg-warning-bg border border-warning/30 rounded-lg px-3 py-2 text-sm text-warning flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Not updated this week — upload a new price list to replace the current one.
            </div>
          )}

          {/* Vendor Info (on phones this drops below the upload flow) */}
          <div className="order-last sm:order-none flex items-start justify-between gap-4 flex-wrap">
            <div className="text-sm text-fg space-y-0.5">
              {vendor.contactName && <p><strong>Contact:</strong> {vendor.contactName}</p>}
              <p><strong>Phone:</strong> {vendor.phone || '-'}</p>
              {vendor.contactEmail && <p><strong>Email:</strong> {vendor.contactEmail}</p>}
              {vendor.preferredChannel && <p><strong>Channel:</strong> <span className="capitalize">{vendor.preferredChannel}</span></p>}
              {vendor.updateCadence && <p><strong>Cadence:</strong> <span className="capitalize">{vendor.updateCadence}</span></p>}
              {vendor.notes && <p><strong>Notes:</strong> {vendor.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(vendor)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-surface-border text-fg hover:bg-surface-hover transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(vendor)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-danger/30 text-danger hover:bg-danger-bg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 items-center">
            {prices.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => setShowRenewConfirm(true)}
                className="!border-warning/40 !text-warning hover:!bg-warning-bg"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  Renew List
                </span>
              </Button>
            )}
            <Button onClick={() => { setImportMode(importMode === 'upload' ? null : 'upload'); setCsvStatus(null) }}>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload Price List
              </span>
            </Button>
            <Button variant="secondary" onClick={() => setAddProductOpen(true)}>+ Add Product</Button>
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={downloadVendorCsvTemplate}
                className="text-[12px] text-muted hover:text-fg underline underline-offset-2 transition-colors"
              >
                CSV template
              </button>
              {vendorUploads.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowUploadHistory(!showUploadHistory)}
                  className="text-[12px] text-muted hover:text-fg underline underline-offset-2 transition-colors"
                >
                  History ({vendorUploads.length})
                </button>
              )}
            </div>
          </div>

          {/* Upload History */}
          {showUploadHistory && vendorUploads.length > 0 && (
            <div className="border border-surface-border rounded-xl p-3 space-y-2">
              <h4 className="text-xs font-semibold text-fg-secondary uppercase tracking-wide">Upload History</h4>
              <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                {vendorUploads.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-xs bg-surface-hover rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-fg font-medium">{u.fileName}</span>
                      <span className="text-muted capitalize">{u.source.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center gap-4 text-muted">
                      <span>{u.validRowCount}/{u.rowCount} rows</span>
                      <span>Cov: {u.coveragePercent}%</span>
                      <span>SKU: {u.hasSkuPercent}%</span>
                      <span>{new Date(u.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* One upload door — the file type picks the parser, not the user */}
          {importMode === 'upload' && !reviewRows && (
            <div className="border border-surface-border rounded-xl p-4 space-y-3">
              <FileUpload
                accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.numbers,.pdf,.html,.htm,image/png,image/jpeg,image/webp"
                multiple
                onFiles={handleAnyFiles}
                label="Drop the vendor's price list here — Excel, Numbers, CSV, PDF, or photos"
                hint="The format is detected automatically. Spreadsheets import instantly; photos and PDFs are read by AI with a review step. On a phone, you can select several photos at once."
              />
              {(csvLoading || imageLoading) && (
                <div className="space-y-2">
                  <p className="text-sm text-muted">{imageLoading ? 'Analyzing file with AI...' : 'Processing file...'}</p>
                  <div className="h-1 bg-surface-border rounded overflow-hidden">
                    <div className="h-full bg-primary animate-pulse rounded" style={{ width: '100%' }} />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setImportMode('bulk'); setCsvStatus(null) }}
                  className="text-[12px] text-primary hover:underline underline-offset-2"
                >
                  Have many photos of the list? Import them all at once →
                </button>
                <Button type="button" variant="secondary" className="!text-xs" onClick={() => { setImportMode(null); setCsvStatus(null) }}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* Bulk screenshot import */}
          {importMode === 'bulk' && !reviewRows && (
            <BulkScreenshotImport
              apiKey=""
              initialFiles={bulkFiles ?? undefined}
              onImport={(rows) => { setBulkFiles(null); handleBulkImport(rows) }}
              onCancel={() => { setBulkFiles(null); setImportMode(null) }}
            />
          )}

          {/* Review rows */}
          {reviewRows && (
            <div className="border border-surface-border rounded-xl p-4 space-y-3">
              <p className="text-sm text-fg-secondary">
                {reviewRows.length} product{reviewRows.length !== 1 ? 's' : ''} found. Review and edit before importing.
              </p>
              <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1">
                {reviewRows.map((row, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      row.selected ? 'border-surface-border bg-surface' : 'border-surface-border bg-surface-hover opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <input type="checkbox" checked={row.selected} onChange={() => handleReviewToggle(i)} className="accent-primary" />
                      <span className="text-xs text-muted">#{i + 1}</span>
                      {row.matchedProductName ? (
                        <span className="text-xs text-success">Matched: {row.matchedProductName}</span>
                      ) : (
                        <span className="text-xs text-warning">Not in your catalog</span>
                      )}
                      <button type="button" onClick={() => handleRemoveRow(i)} className="ml-auto text-xs text-danger hover:opacity-80">Remove</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <input className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="Product Name" value={row.name} onChange={(e) => handleReviewRowChange(i, 'name', e.target.value)} />
                      <input className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="Brand" value={row.brand} onChange={(e) => handleReviewRowChange(i, 'brand', e.target.value)} />
                      <input className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="SKU" value={row.sku} onChange={(e) => handleReviewRowChange(i, 'sku', e.target.value)} />
                      <input className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="Price" type="number" step="0.01" value={row.price || ''} onChange={(e) => handleReviewRowChange(i, 'price', e.target.value)} />
                    </div>
                    {row.packType === 'CASE' && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-accent text-accent-foreground">CASE</span>
                        <span className="text-[11px] text-muted">{row.unitsPerCase} units/case{row.unitDescriptor ? ` · ${row.unitDescriptor}` : ''}</span>
                        <span className="text-[11px] text-fg-secondary">Unit cost: $ {((row.priceBasis === 'PER_CASE' && (row.unitsPerCase ?? 1) > 0) ? row.price / (row.unitsPerCase ?? 1) : row.price).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleReviewImport}>Import {selectedCount} price{selectedCount !== 1 ? 's' : ''}</Button>
                <Button type="button" variant="secondary" onClick={() => setReviewRows(null)}>Back</Button>
              </div>
            </div>
          )}

          {/* Vendor items not in the client's catalog — explicit opt-in only */}
          {unmatchedOffers && unmatchedOffers.length > 0 && (
            <div className="border border-warning/30 bg-warning-bg/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="text-sm font-semibold text-fg">
                    {unmatchedOffers.length} vendor item{unmatchedOffers.length !== 1 ? 's' : ''} not in your catalog
                  </h4>
                  <p className="text-xs text-fg-secondary">
                    Your catalog only holds what your store carries. Check anything you actually
                    stock and add it — the vendor&apos;s price comes with it. This list shows up
                    again whenever this vendor&apos;s file is uploaded.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setOfferSel(
                        offerSel.size === unmatchedOffers.length
                          ? new Set()
                          : new Set(unmatchedOffers.map((_, i) => i))
                      )
                    }
                    className="text-[12px] text-fg-secondary hover:text-fg underline underline-offset-2"
                  >
                    {offerSel.size === unmatchedOffers.length ? 'Unselect all' : 'Select all'}
                  </button>
                  <Button onClick={handleAddSelectedOffers} className="!text-xs">
                    Add {offerSel.size > 0 ? offerSel.size : ''} to catalog
                  </Button>
                  <Button variant="secondary" className="!text-xs" onClick={() => { setUnmatchedOffers(null); setOfferSel(new Set()) }}>
                    Dismiss
                  </Button>
                </div>
              </div>
              <div className="max-h-[280px] overflow-y-auto divide-y divide-surface-border rounded-lg border border-surface-border bg-surface">
                {unmatchedOffers.map((row, i) => {
                  const unit =
                    row.packType === 'CASE' && row.priceBasis === 'PER_CASE' && (row.unitsPerCase ?? 1) > 0
                      ? row.price / (row.unitsPerCase ?? 1)
                      : row.price
                  return (
                    <label key={`${row.sku}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-surface-hover">
                      <input
                        type="checkbox"
                        className="accent-primary shrink-0"
                        checked={offerSel.has(i)}
                        onChange={() => {
                          setOfferSel((prev) => {
                            const next = new Set(prev)
                            if (next.has(i)) next.delete(i)
                            else next.add(i)
                            return next
                          })
                        }}
                      />
                      <span className="flex-1 min-w-0 truncate text-fg">{row.name}</span>
                      {row.sku && <span className="text-[11px] text-muted shrink-0">{row.sku}</span>}
                      <span className="text-[12px] text-fg-secondary tabular-nums shrink-0">
                        $ {row.price.toFixed(2)}{row.packType === 'CASE' ? `/cs · $ ${unit.toFixed(2)}/ea` : ''}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Status message */}
          {csvStatus && (
            <div className={`text-sm p-3 rounded-lg ${csvStatus.type === 'error' ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}`}>
              <p>{csvStatus.message}</p>
              {csvStatus.errors && csvStatus.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-warning">
                    {csvStatus.errors.length} row error(s)
                  </summary>
                  <ul className="list-disc pl-5 mt-1 text-xs">
                    {csvStatus.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>Row {e.row}: {e.message}</li>
                    ))}
                    {csvStatus.errors.length > 20 && <li>...and {csvStatus.errors.length - 20} more</li>}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Price list table */}
          <div className="border border-surface-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Product', 'Case Qty', 'Unit Size', 'Type', 'Brand', 'SKU', 'Price', 'Unit Cost', 'Updated', ''].map((h) => (
                    <th key={h} className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider py-2.5 px-3 bg-surface-hover/40 border-b border-surface-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-muted text-sm">
                      No prices registered yet — click Upload Price List and drop the vendor's file.
                    </td>
                  </tr>
                ) : (
                  prices.map((vp) => {
                    const product = vp.product!
                    const daysAgo = Math.floor(
                      (Date.now() - new Date(vp.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
                    )
                    const isCase = vp.packType === 'CASE'
                    const effectiveCost = vp.unitCost ?? (isCase && (vp.unitsPerCase ?? 1) > 0 ? vp.unitPrice / (vp.unitsPerCase ?? 1) : vp.unitPrice)
                    const cleanName = stripPackFromName(product.name) || product.name
                    const unitSize = vp.unitDescriptor || product.unitSize || '-'
                    return (
                      <tr key={`${vp.vendorId}-${vp.productId}`} className="border-t border-surface-border hover:bg-surface-hover transition-colors">
                        {/* Product — clean name without pack notation */}
                        <td className="py-2.5 px-3 text-fg font-medium max-w-[220px]">
                          <span className="line-clamp-2">{cleanName}</span>
                        </td>
                        {/* Case Qty */}
                        <td className="py-2.5 px-3 text-center text-fg tabular-nums">
                          {isCase ? (
                            <span className="font-semibold">{vp.unitsPerCase ?? '-'}</span>
                          ) : (
                            <span className="text-muted">1</span>
                          )}
                        </td>
                        {/* Unit Size */}
                        <td className="py-2.5 px-3 text-fg text-[13px]">{unitSize}</td>
                        {/* Sell Type */}
                        <td className="py-2.5 px-3">
                          {isCase ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-accent text-accent-foreground">CASE</span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-hover text-muted">UNIT</span>
                          )}
                        </td>
                        {/* Brand */}
                        <td className="py-2.5 px-3 text-fg text-[13px]">{product.brand || '-'}</td>
                        {/* SKU */}
                        <td className="py-2.5 px-3 text-muted text-[12px]">{product.sku || '-'}</td>
                        {/* Price */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              className="w-20 bg-input-bg border border-input-border text-fg px-1.5 py-1 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                              value={vp.unitPrice}
                              onChange={(e) => handlePriceChange(vp.productId, e.target.value)}
                            />
                            {isCase && <span className="text-[10px] text-muted">/cs</span>}
                          </div>
                        </td>
                        {/* Unit Cost */}
                        <td className="py-2.5 px-3 text-[13px] text-fg-secondary whitespace-nowrap tabular-nums">
                          $ {effectiveCost.toFixed(2)}
                          {isCase && <span className="text-[10px] text-muted ml-0.5">/ea</span>}
                        </td>
                        {/* Updated */}
                        <td className="py-2.5 px-3 text-[12px] text-fg-secondary whitespace-nowrap tabular-nums">{daysAgo === 0 ? 'Today' : `${daysAgo}d`}</td>
                        {/* Actions */}
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => handleRemovePrice(vp.productId)}
                            className="text-danger hover:text-danger/80 transition-colors"
                            title="Remove product"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </Modal>

      <AddProductToVendorModal
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        vendor={vendor}
        onAdded={() => setAddProductOpen(false)}
      />

      {/* Renew List confirmation popup */}
      {showRenewConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="bg-surface border border-surface-border rounded-2xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-fg mb-2">Renew vendor list?</h3>
            <p className="text-sm text-fg-secondary mb-1">
              This will <strong>remove all {prices.length} products</strong> from {vendor.name}'s current list.
            </p>
            <p className="text-sm text-fg-secondary mb-4">
              After clearing, you can upload the new weekly list via CSV or AI import.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowRenewConfirm(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRenewList}
                className="!bg-warning hover:!opacity-90 !text-warning-foreground"
              >
                Remove all & upload new
              </Button>
            </div>
          </div>
        </div>
      )}

      <UploadOverlay
        status={overlayStatus}
        loadingMessage="Processing vendor file..."
        resultMessage={overlayMessage}
        onClose={() => setOverlayStatus(null)}
      />
    </>
  )
}

function ComplianceCard({ label, value, tip }: { label: string; value: React.ReactNode; tip?: string }) {
  return (
    <div className="bg-surface border border-surface-border rounded-xl p-3 text-center">
      <div className="mb-1">{value}</div>
      <div className="flex items-center justify-center gap-1">
        <span className="text-[10px] text-muted uppercase tracking-wide">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
    </div>
  )
}

