import { useState } from 'react'
import { useStore } from '@/store'
import { matchKey } from '../lib/matching'
import { FileUpload, ConfirmDialog } from '@/shared/components'
import { useToast } from '@/shared/components'
import { parseCSVStock } from '../lib/csvStock'
import { parseStockWithOpenAI } from '../lib/aiStockParse'
import { findProductMatch } from '../lib/matching'
import { ReorderSection } from './ReorderSection'
import { OrderVendorCards } from './OrderSplitModal'
import type { StockSnapshotRow } from '@/types'

type UploadMode = 'csv' | 'ai'

export function InventoryPage() {
  const toast = useToast()
  const commitStockImport = useStore((s) => s.commitStockImport)
  const products = useStore((s) => s.products)
  const matches = useStore((s) => s.matches)
  const settings = useStore((s) => s.settings)
  const buildReorderDraftFromSnapshot = useStore(
    (s) => s.buildReorderDraftFromSnapshot
  )
  const reorderDraft = useStore((s) => s.reorderDraft)
  const clearReorderDraft = useStore((s) => s.clearReorderDraft)
  const addActivity = useStore((s) => s.addActivity)

  const [uploadMode, setUploadMode] = useState<UploadMode>('csv')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [uploadMessage, setUploadMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const bulkCreateProductsFromSnapshot = useStore((s) => s.bulkCreateProductsFromSnapshot)
  const addVendor = useStore((s) => s.addVendor)
  const setVendorPricesBatch = useStore((s) => s.setVendorPricesBatch)
  const [confirmReset, setConfirmReset] = useState(false)

  // Order state — persisted in Zustand store so it survives navigation
  const orderData = useStore((s) => s.activeOrderView)
  const setActiveOrderView = useStore((s) => s.setActiveOrderView)
  const clearActiveOrderView = useStore((s) => s.clearActiveOrderView)

  const processStockRows = (rows: StockSnapshotRow[], fileName: string, sourceType: string) => {
    if (import.meta.env.DEV) {
      const skuRows = rows.filter((r) => r.rawSku)
      console.debug(`[SKU pipeline] ${skuRows.length}/${rows.length} rows have rawSku`)
    }

    const newMatches: Record<string, string> = {}
    const productPatches: Record<string, { stockQty?: number; unitCost?: number; unitPrice?: number; category?: string }> = {}

    rows.forEach((row) => {
      const productId = findProductMatch(
        row.rawName,
        row.rawBrand,
        products,
        matches,
        row.rawSku
      )
      if (productId) {
        row.matchedProductId = productId
        newMatches[matchKey(row.rawName, row.rawBrand)] = productId

        const existing = productPatches[productId]
        if (existing) {
          existing.stockQty = (existing.stockQty ?? 0) + row.stockQty
          if (row.unitCost && (!existing.unitCost || row.unitCost < existing.unitCost)) {
            existing.unitCost = row.unitCost
          }
          if (row.unitPrice && !existing.unitPrice) {
            existing.unitPrice = row.unitPrice
          }
        } else {
          productPatches[productId] = {
            stockQty: row.stockQty,
            unitCost: row.unitCost,
            unitPrice: row.unitPrice,
            category: row.category,
          }
        }
      }
    })

    const snapshotId = commitStockImport({
      uploadedAt: new Date().toISOString(),
      sourceFileName: fileName,
      sourceType,
      rows,
      newMatches,
      productPatches,
    })

    const matchedCount = rows.filter((r) => r.matchedProductId).length

    // Auto-create products for any unmatched rows
    const unmatched = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !row.matchedProductId)

    if (unmatched.length > 0) {
      const defaultMin = settings?.defaultMinStock ?? 10
      const items = unmatched.map(({ row, index }) => ({
        snapshotRowIndex: index,
        product: {
          name: row.rawName,
          brand: row.rawBrand || '',
          sku: row.rawSku || '',
          category: row.category || '',
          unitSize: '',
          minStock: defaultMin,
          unitCost: row.unitCost,
          unitPrice: row.unitPrice,
        },
        matchKey: matchKey(row.rawName, row.rawBrand),
      }))
      bulkCreateProductsFromSnapshot({ snapshotId, items })
    }

    // Re-read snapshot rows from store to get updated matchedProductIds
    const updatedSnapshot = useStore.getState().stockSnapshots.find((s) => s.id === snapshotId)
    const updatedRows = updatedSnapshot?.rows ?? rows

    // Debug: show what's in the first few rows to diagnose vendor linking
    if (rows.length > 0) {
      const s = rows[0]
      console.log('[Inventory] Sample orig row[0]:', { rawName: s.rawName, rawBrand: s.rawBrand, rawVendor: s.rawVendor, unitCost: s.unitCost, unitPrice: s.unitPrice, matchedProductId: s.matchedProductId })
    }
    if (updatedRows.length > 0) {
      const s = updatedRows[0]
      console.log('[Inventory] Sample updated row[0]:', { rawName: s.rawName, rawBrand: s.rawBrand, rawVendor: s.rawVendor, unitCost: s.unitCost, unitPrice: s.unitPrice, matchedProductId: s.matchedProductId })
    }

    // Auto-create vendors and vendor prices from CSV vendor/cost/price/brand columns
    // Strategy: use rawVendor if present, fallback to rawBrand as vendor name
    //           use unitCost if present, fallback to unitPrice as cost
    const vendorRows = updatedRows
      .map((r, i) => {
        const orig = rows[i]
        const vendor = orig?.rawVendor || orig?.rawBrand || r.rawVendor || r.rawBrand || ''
        const cost = orig?.unitCost ?? orig?.unitPrice ?? r.unitCost ?? r.unitPrice ?? 0
        return { ...r, rawVendor: vendor, unitCost: cost }
      })
      .filter((r) => r.rawVendor && r.matchedProductId && r.unitCost && r.unitCost > 0)

    console.log(`[Inventory] Vendor linking: ${vendorRows.length} rows with vendor+product+cost out of ${updatedRows.length} total`, vendorRows.length > 0 ? { sampleVendor: vendorRows[0].rawVendor, sampleCost: vendorRows[0].unitCost } : 'NO VENDOR ROWS')

    if (vendorRows.length > 0) {
      const currentVendors = useStore.getState().vendors
      const vendorNameMap: Record<string, string> = {}
      const vendorList: { name: string; nameLower: string; id: string }[] = []
      for (const v of currentVendors) {
        const key = v.name.toLowerCase().trim()
        vendorNameMap[key] = v.id
        vendorList.push({ name: v.name, nameLower: key, id: v.id })
      }

      const findVendorId = (csvName: string): string | null => {
        const csvLower = csvName.toLowerCase().trim()
        if (vendorNameMap[csvLower]) return vendorNameMap[csvLower]
        for (const v of vendorList) {
          if (csvLower.includes(v.nameLower) || v.nameLower.includes(csvLower)) return v.id
        }
        const csvFirst = csvLower.split(/\s+/)[0]
        if (csvFirst.length >= 3) {
          for (const v of vendorList) {
            const vFirst = v.nameLower.split(/\s+/)[0]
            if (csvFirst === vFirst) return v.id
          }
        }
        return null
      }

      let newVendorCount = 0
      const resolvedVendors: Record<string, string> = {}
      const batchPrices: { vendorId: string; productId: string; unitPrice: number; updatedAt: string }[] = []

      for (const row of vendorRows) {
        const vendorName = row.rawVendor!.trim()
        const vendorKey = vendorName.toLowerCase()

        if (!resolvedVendors[vendorKey]) {
          const existingId = findVendorId(vendorName)
          if (existingId) {
            resolvedVendors[vendorKey] = existingId
          } else {
            const vendorId = addVendor({ name: vendorName, phone: '', notes: '', status: 'active' })
            resolvedVendors[vendorKey] = vendorId
            vendorNameMap[vendorKey] = vendorId
            vendorList.push({ name: vendorName, nameLower: vendorKey, id: vendorId })
            newVendorCount++
          }
        }

        batchPrices.push({
          vendorId: resolvedVendors[vendorKey],
          productId: row.matchedProductId!,
          unitPrice: row.unitCost!,
          updatedAt: new Date().toISOString(),
        })
      }

      // Single batch update instead of individual calls — prevents UI freeze
      if (batchPrices.length > 0) {
        setVendorPricesBatch(batchPrices as any)
      }

      if (newVendorCount > 0) {
        addActivity('vendor_created', `Auto-created ${newVendorCount} vendors from inventory import`)
      }
    }

    const vendorPriceCount = vendorRows.length
    setUploadStatus('success')
    setUploadMessage(
      `${rows.length} products imported (${matchedCount} matched, ${unmatched.length} new created)` +
      (vendorPriceCount > 0 ? ` · ${vendorPriceCount} vendor prices linked` : '')
    )
    toast.show(`${rows.length} products imported`)

    // Always build reorder draft immediately
    const vpCount = useStore.getState().vendorPrices.length
    console.log(`[Inventory] Building reorder draft. vendorPrices in store: ${vpCount}, vendors: ${useStore.getState().vendors.length}`)
    buildReorderDraftFromSnapshot(snapshotId)
  }

  const handleCsvFile = (file: File) => {
    setUploadStatus('idle')
    setUploadMessage('')
    clearActiveOrderView()

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const rows = parseCSVStock(text)
      if (rows.length === 0) {
        toast.show('No products found in CSV. Check the format.', 'error')
        setUploadStatus('error')
        setUploadMessage('No products found in CSV.')
        return
      }
      processStockRows(rows, file.name, 'csv')
    }
    reader.readAsText(file)
  }

  const handleAiFile = async (file: File) => {
    const apiKey = settings?.openaiApiKey ?? ''
    if (!apiKey) {
      toast.show('OpenAI API key required. Add it in Settings → AI / Image Import.', 'error')
      return
    }

    setUploadStatus('idle')
    setUploadMessage('')
    clearActiveOrderView()
    setAiLoading(true)

    try {
      const result = await parseStockWithOpenAI(file, apiKey)
      if ('error' in result) {
        toast.show(result.error, 'error')
        setUploadStatus('error')
        setUploadMessage(result.error)
        setAiLoading(false)
        return
      }
      processStockRows(result.rows, file.name, 'ai')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to process file'
      toast.show(msg, 'error')
      setUploadStatus('error')
      setUploadMessage(msg)
    }
    setAiLoading(false)
  }

  const handleArchiveOrder = () => {
    clearReorderDraft()
    clearActiveOrderView()
    setUploadStatus('idle')
    setUploadMessage('')
    addActivity('order_archived', 'Order archived — ready for new inventory upload')
    toast.show('Order archived! You can start a new inventory upload.')
  }

  const handleResetInventory = () => {
    clearReorderDraft()
    setUploadStatus('idle')
    setUploadMessage('')
    clearActiveOrderView()
    addActivity('stock_reset', 'Inventory import reset — starting fresh')
    toast.show('Inventory reset. You can upload a new file.')
  }

  const hasActiveSession = Boolean(reorderDraft?.lines?.length) || orderData !== null
  const showReorder = Boolean(reorderDraft?.lines?.length) && orderData === null
  const showOrderCards = orderData !== null

  const tabBtn = (label: string, tabMode: UploadMode) => (
    <button
      type="button"
      onClick={() => { setUploadMode(tabMode); setUploadStatus('idle') }}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        uploadMode === tabMode
          ? 'bg-primary text-white'
          : 'text-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Upload section — hide when order cards are showing */}
      {!showOrderCards && (
        <div className="bg-surface border border-surface-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-[13px] font-semibold text-fg">Upload POS Report</span>
            </div>
            {hasActiveSession && (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-danger border border-danger/30 hover:bg-danger/10 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 105.64-12.36L1 10" />
                </svg>
                Reset &amp; Start New
              </button>
            )}
          </div>

          <div className="flex gap-2 border-b border-surface-border pb-2 mb-4">
            {tabBtn('CSV', 'csv')}
            {tabBtn('AI (any file)', 'ai')}
          </div>

          {uploadMode === 'csv' ? (
            <FileUpload
              accept=".csv"
              onFile={handleCsvFile}
              label="Upload your CSV file here"
              hint="Use the CSV file exported from your POS system"
            />
          ) : (
            <>
              {!settings?.openaiApiKey && (
                <div className="bg-amber-50 dark:bg-yellow-900/30 border border-amber-200 dark:border-yellow-700/50 rounded-lg px-3 py-2 text-sm text-amber-700 dark:text-yellow-200 mb-3">
                  OpenAI API key required. Go to <strong>Settings → AI / Image Import</strong> to add your key.
                </div>
              )}
              <FileUpload
                accept=".csv,.tsv,.txt,.xls,.xlsx,.html,.htm,.pdf,image/png,image/jpeg,image/webp"
                onFile={handleAiFile}
                label="Drag any POS report file or screenshot here"
                hint="Supports CSV, TXT, TSV, HTML, Excel (text), images, and more"
              />
              {aiLoading && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-muted">Analyzing file with AI… This may take 5–20 seconds.</p>
                  <div className="h-1 bg-surface-border rounded overflow-hidden">
                    <div className="h-full bg-primary animate-pulse rounded" style={{ width: '100%' }} />
                  </div>
                </div>
              )}
            </>
          )}

          {uploadStatus === 'success' && (
            <p className="mt-3 text-success text-sm bg-success-bg px-3 py-2 rounded-lg">
              {uploadMessage}
            </p>
          )}
          {uploadStatus === 'error' && (
            <p className="mt-3 text-danger text-sm bg-danger-bg px-3 py-2 rounded-lg">
              {uploadMessage}
            </p>
          )}
        </div>
      )}

      {/* Reorder list — shown after upload, before order creation */}
      {showReorder && (
        <ReorderSection
          onOrderCreated={(order, byVendor) => setActiveOrderView({ order, byVendor })}
        />
      )}

      {/* Order vendor cards — shown inline after Create Order */}
      {showOrderCards && (
        <OrderVendorCards
          order={orderData!.order}
          byVendor={orderData!.byVendor}
          onArchive={handleArchiveOrder}
          onReset={handleResetInventory}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleResetInventory}
        title="Reset Inventory Import"
        message="This will discard the current import snapshot, unmatched items, and the reorder draft. Products already created will remain in your catalog. Are you sure?"
        confirmLabel="Reset & Start New"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  )
}
