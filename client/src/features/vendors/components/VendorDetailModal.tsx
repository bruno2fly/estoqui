import { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { Modal, Button, FileUpload, InfoTip } from '@/shared/components'
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

type ImportMode = 'csv' | 'image' | 'bulk'

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
    setImportMode('csv')
    addActivity('vendor_price_updated', `Vendor list renewed: ${vendor.name} — ${oldCount} old prices removed`)
    toast.show(`Removed ${oldCount} prices. Now upload the new list.`)
  }

  const handleRemovePrice = (productId: string) => {
    if (!window.confirm('Remove this product from price list?')) return
    removeVendorPrice(vendor.id, productId)
    toast.show('Product removed!')
  }

  const applyPriceRows = (rows: VendorPriceRow[], source: 'csv_upload' | 'whatsapp_parse', fileName: string, parseStats?: { rowCount: number; validRowCount: number; invalidRowCount: number; hasSkuPercent: number; errors: { row: number; message: string }[] }) => {
    let priceAdded = 0
    let priceUpdated = 0
    let productsCreated = 0

    rows.forEach((row) => {
      let product = findProductByNameAndBrand(
        row.name,
        row.brand,
        state.products,
        state.matches,
        row.sku
      )

      if (!product) {
        const productId = addProduct({
          name: row.name,
          brand: row.brand,
          sku: row.sku || '',
          category: '',
          unitSize: row.unitSize || '',
          minStock: settings?.defaultMinStock ?? 10,
          unitCost: row.price,
        })
        const key = matchKey(row.name, row.brand)
        setMatch(key, productId)
        product = { id: productId, name: row.name, brand: row.brand, sku: row.sku, minStock: settings?.defaultMinStock ?? 10 }
        productsCreated++
      }

      const existing = state.vendorPrices.find(
        (vp) => vp.vendorId === vendor.id && vp.productId === product!.id
      )
      const now = new Date().toISOString()
      const effectiveUnitCost = row.packType === 'CASE' && row.priceBasis === 'PER_CASE' && (row.unitsPerCase ?? 1) > 0
        ? row.price / (row.unitsPerCase ?? 1)
        : row.price
      setVendorPrice({
        vendorId: vendor.id,
        productId: product.id,
        unitPrice: row.price,
        updatedAt: now,
        packType: row.packType ?? 'UNIT',
        unitsPerCase: row.unitsPerCase ?? 1,
        unitDescriptor: row.unitDescriptor ?? '',
        priceBasis: row.priceBasis ?? 'PER_UNIT',
        parseVersion: 1,
        unitCost: effectiveUnitCost,
      })
      if (existing) priceUpdated++
      else priceAdded++
    })

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
    if (productsCreated) parts.push(`${productsCreated} new products created`)

    addActivity(
      'vendor_price_updated',
      `Vendor import: ${vendor.name} — ${parts.join(', ')}`
    )
    setCsvStatus({
      type: 'success',
      message: `Imported! Prices added: ${priceAdded} | Updated: ${priceUpdated}${productsCreated ? ` | New products: ${productsCreated}` : ''}`,
      errors: parseStats?.errors,
    })
    setImportMode(null)
    setReviewRows(null)
  }

  const handleCsvFile = (file: File) => {
    setCsvLoading(true)
    setCsvStatus(null)

    const isExcel = /\.(xlsx?|xlsm)$/i.test(file.name) ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel'

    if (isExcel) {
      const reader = new FileReader()
      reader.onload = () => {
        const data = reader.result as ArrayBuffer
        const result = parseVendorPriceExcel(data)
        if ('error' in result) {
          setCsvStatus({ type: 'error', message: result.error })
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

  const handleImageFile = async (file: File) => {
    const apiKey = state.settings?.openaiApiKey ?? ''
    if (!apiKey) {
      toast.show('OpenAI API key required. Add it in Settings.', 'error')
      return
    }

    setImageLoading(true)
    setCsvStatus(null)
    try {
      const result = await parseVendorPriceImageWithOpenAI(file, apiKey)
      if ('error' in result) {
        toast.show(result.error, 'error')
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
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Failed to process image', 'error')
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
    const selected = reviewRows.filter((r) => r.selected && r.name.trim() && r.price > 0)
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
        <div className="space-y-5">
          {/* Compliance Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                <span className={`text-sm font-medium ${isStale ? 'text-red-500' : 'text-fg'}`}>
                  {days !== null ? (days === 0 ? 'Today' : `${days}d ago`) : 'Never'}
                  {isStale && <span className="block text-[10px] text-red-500 font-semibold">STALE</span>}
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
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-300">
              Data is stale — last price list is {days}+ days old (threshold: {vendor.staleAfterDays ?? 7} days). Upload a fresh price list to restore Active status.
            </div>
          )}

          {/* Weekly update notification */}
          {isUpdatedThisWeek(vendor) ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg px-3 py-2 text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Updated this week — list is current.
            </div>
          ) : (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 rounded-lg px-3 py-2 text-sm text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Not updated this week — upload a new price list to replace the current one.
            </div>
          )}

          {/* Vendor Info */}
          <div className="flex items-start justify-between gap-4">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
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
                className="!border-orange-400 !text-orange-600 dark:!text-orange-400 hover:!bg-orange-50 dark:hover:!bg-orange-900/20"
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
            <Button onClick={() => setAddProductOpen(true)}>+ Add Product</Button>
            <Button variant="secondary" onClick={() => setImportMode(importMode === 'csv' ? null : 'csv')}>
              Import CSV / Excel
            </Button>
            <Button variant="secondary" onClick={() => setImportMode(importMode === 'image' ? null : 'image')}>
              Import from File (AI)
            </Button>
            <Button
              variant="secondary"
              onClick={() => setImportMode(importMode === 'bulk' ? null : 'bulk')}
              className="!border-purple-400 !text-purple-600 dark:!text-purple-400 hover:!bg-purple-50 dark:hover:!bg-purple-900/20"
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                Bulk Screenshots (AI)
              </span>
            </Button>
            <Button variant="secondary" onClick={downloadVendorCsvTemplate}>
              Download CSV Template
            </Button>
            {vendorUploads.length > 0 && (
              <Button variant="secondary" onClick={() => setShowUploadHistory(!showUploadHistory)}>
                {showUploadHistory ? 'Hide' : 'Show'} Upload History ({vendorUploads.length})
              </Button>
            )}
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

          {/* Import section (CSV / single file AI) */}
          {importMode && importMode !== 'bulk' && !reviewRows && (
            <div className="border border-surface-border rounded-xl p-4 space-y-3">
              <div className="flex gap-2 border-b border-surface-border pb-2">
                <TabBtn label="CSV / Excel" mode="csv" active={importMode} onClick={(m) => { setImportMode(m); setReviewRows(null); setCsvStatus(null) }} />
                <TabBtn label="File (AI)" mode="image" active={importMode} onClick={(m) => { setImportMode(m); setReviewRows(null); setCsvStatus(null) }} />
              </div>

              {importMode === 'csv' ? (
                <>
                  <FileUpload
                    accept=".csv,.xlsx,.xls,.xlsm"
                    onFile={handleCsvFile}
                    label="Drag a CSV or Excel file or click to select"
                    hint="Supports .csv, .xlsx, .xls — Columns: product_name, price (required). Optional: sku, brand, unit_size, unit_type, available"
                  />
                  {csvLoading && <p className="text-sm text-muted">Processing CSV...</p>}
                </>
              ) : (
                <>
                  {!state.settings?.openaiApiKey && (
                    <div className="bg-amber-50 dark:bg-yellow-900/30 border border-amber-200 dark:border-yellow-700/50 rounded-lg px-3 py-2 text-sm text-amber-700 dark:text-yellow-200">
                      OpenAI API key required. Go to <strong>Settings</strong> to add your key.
                    </div>
                  )}
                  <FileUpload
                    accept="image/png,image/jpeg,image/webp,.pdf,.txt,.html,.htm,.csv,.tsv,.xls,.xlsx"
                    onFile={handleImageFile}
                    label="Drag a price list file here (image, PDF, or any document)"
                    hint="Supports images, PDFs, TXT, HTML, CSV. AI extracts products + prices."
                  />
                  {imageLoading && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted">Analyzing file with AI...</p>
                      <div className="h-1 bg-surface-border rounded overflow-hidden">
                        <div className="h-full bg-primary animate-pulse rounded" style={{ width: '100%' }} />
                      </div>
                    </div>
                  )}
                </>
              )}
              <Button type="button" variant="secondary" className="!text-xs" onClick={() => { setImportMode(null); setCsvStatus(null) }}>
                Close
              </Button>
            </div>
          )}

          {/* Bulk screenshot import */}
          {importMode === 'bulk' && !reviewRows && (
            <BulkScreenshotImport
              apiKey={settings?.openaiApiKey ?? ''}
              onImport={handleBulkImport}
              onCancel={() => setImportMode(null)}
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
                        <span className="text-xs text-green-600 dark:text-green-400">Matched: {row.matchedProductName}</span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400">New product (will be created)</span>
                      )}
                      <button type="button" onClick={() => handleRemoveRow(i)} className="ml-auto text-xs text-red-500 hover:text-red-600">Remove</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <input className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full" placeholder="Product Name" value={row.name} onChange={(e) => handleReviewRowChange(i, 'name', e.target.value)} />
                      <input className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full" placeholder="Brand" value={row.brand} onChange={(e) => handleReviewRowChange(i, 'brand', e.target.value)} />
                      <input className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full" placeholder="SKU" value={row.sku} onChange={(e) => handleReviewRowChange(i, 'sku', e.target.value)} />
                      <input className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full" placeholder="Price" type="number" step="0.01" value={row.price || ''} onChange={(e) => handleReviewRowChange(i, 'price', e.target.value)} />
                    </div>
                    {row.packType === 'CASE' && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">CASE</span>
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

          {/* Status message */}
          {csvStatus && (
            <div className={`text-sm p-3 rounded-lg ${csvStatus.type === 'error' ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}`}>
              <p>{csvStatus.message}</p>
              {csvStatus.errors && csvStatus.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-amber-600 dark:text-amber-500">
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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  {['Product', 'Case Qty', 'Unit Size', 'Type', 'Brand', 'SKU', 'Price', 'Unit Cost', 'Updated', ''].map((h) => (
                    <th key={h} className="text-left text-fg-secondary font-semibold text-xs uppercase py-2 px-1.5 first:pl-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-4 text-center text-muted text-sm">
                      No prices registered. Add products or import CSV / image.
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
                      <tr key={`${vp.vendorId}-${vp.productId}`} className="border-b border-surface-border">
                        {/* Product — clean name without pack notation */}
                        <td className="py-2 px-1.5 pl-0 text-fg font-medium max-w-[220px]">
                          <span className="line-clamp-2">{cleanName}</span>
                        </td>
                        {/* Case Qty */}
                        <td className="py-2 px-1.5 text-center text-fg">
                          {isCase ? (
                            <span className="font-semibold">{vp.unitsPerCase ?? '-'}</span>
                          ) : (
                            <span className="text-muted">1</span>
                          )}
                        </td>
                        {/* Unit Size */}
                        <td className="py-2 px-1.5 text-fg text-[13px]">{unitSize}</td>
                        {/* Sell Type */}
                        <td className="py-2 px-1.5">
                          {isCase ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">CASE</span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">UNIT</span>
                          )}
                        </td>
                        {/* Brand */}
                        <td className="py-2 px-1.5 text-fg text-[13px]">{product.brand || '-'}</td>
                        {/* SKU */}
                        <td className="py-2 px-1.5 text-muted text-[12px]">{product.sku || '-'}</td>
                        {/* Price */}
                        <td className="py-2 px-1.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              className="w-20 bg-input-bg border border-input-border text-fg px-1.5 py-1 rounded-lg text-sm"
                              value={vp.unitPrice}
                              onChange={(e) => handlePriceChange(vp.productId, e.target.value)}
                            />
                            {isCase && <span className="text-[10px] text-muted">/cs</span>}
                          </div>
                        </td>
                        {/* Unit Cost */}
                        <td className="py-2 px-1.5 text-[13px] text-fg-secondary whitespace-nowrap">
                          $ {effectiveCost.toFixed(2)}
                          {isCase && <span className="text-[10px] text-muted ml-0.5">/ea</span>}
                        </td>
                        {/* Updated */}
                        <td className="py-2 px-1.5 text-[12px] text-fg-secondary whitespace-nowrap">{daysAgo === 0 ? 'Today' : `${daysAgo}d`}</td>
                        {/* Actions */}
                        <td className="py-2 px-1.5">
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
                className="!bg-orange-500 hover:!bg-orange-600 !text-white"
              >
                Remove all & upload new
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ComplianceCard({ label, value, tip }: { label: string; value: React.ReactNode; tip?: string }) {
  return (
    <div className="bg-surface-hover rounded-lg p-3 text-center">
      <div className="mb-1">{value}</div>
      <div className="flex items-center justify-center gap-1">
        <span className="text-[10px] text-muted uppercase tracking-wide">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
    </div>
  )
}

function TabBtn({ label, mode, active, onClick }: { label: string; mode: ImportMode; active: ImportMode | null; onClick: (m: ImportMode) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(mode)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active === mode ? 'bg-primary text-white' : 'text-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
}
