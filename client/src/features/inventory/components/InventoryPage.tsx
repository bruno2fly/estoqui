import { useState } from 'react'
import { useStore } from '@/store'
import { matchKey } from '../lib/matching'
import { FileUpload, ConfirmDialog } from '@/shared/components'
import { useToast } from '@/shared/components'
import { parseCSVStock } from '../lib/csvStock'
import { parseStockWithOpenAI } from '../lib/aiStockParse'
import { findProductMatch } from '../lib/matching'
import { ReorderSection } from './ReorderSection'
import { OrderSplitModal } from './OrderSplitModal'
import type { Order, StockSnapshotRow } from '@/types'
import type { OrderGroup } from '@/store/actions/inventoryActions'

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

  const [uploadMode, setUploadMode] = useState<UploadMode>('ai')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [uploadMessage, setUploadMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const bulkCreateProductsFromSnapshot = useStore((s) => s.bulkCreateProductsFromSnapshot)
  const addVendor = useStore((s) => s.addVendor)
  const setVendorPrice = useStore((s) => s.setVendorPrice)
  const [confirmReset, setConfirmReset] = useState(false)
  const [orderSplit, setOrderSplit] = useState<{
    order: Order
    byVendor: Record<string, OrderGroup>
  } | null>(null)

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
    // (bulkCreateProductsFromSnapshot sets matchedProductId on new products)
    const updatedSnapshot = useStore.getState().stockSnapshots.find((s) => s.id === snapshotId)
    const updatedRows = updatedSnapshot?.rows ?? rows

    // Auto-create vendors and vendor prices from CSV vendor/cost columns
    // Use updatedRows which has matchedProductId set for ALL rows (existing + newly created)
    const vendorRows = updatedRows
      .map((r, i) => ({ ...r, rawVendor: rows[i]?.rawVendor, unitCost: rows[i]?.unitCost }))
      .filter((r) => r.rawVendor && r.matchedProductId && r.unitCost)

    if (vendorRows.length > 0) {
      // Build vendor name → id map (find existing or create new)
      const currentVendors = useStore.getState().vendors
      const vendorNameMap: Record<string, string> = {}
      for (const v of currentVendors) {
        vendorNameMap[v.name.toLowerCase().trim()] = v.id
      }

      let newVendorCount = 0
      for (const row of vendorRows) {
        const vendorName = row.rawVendor!.trim()
        const vendorKey = vendorName.toLowerCase()

        // Create vendor if it doesn't exist
        if (!vendorNameMap[vendorKey]) {
          const vendorId = addVendor({ name: vendorName, phone: '', notes: '', status: 'active' })
          vendorNameMap[vendorKey] = vendorId
          newVendorCount++
        }

        const vendorId = vendorNameMap[vendorKey]
        const productId = row.matchedProductId!

        // Create vendor price for this product
        setVendorPrice({
          vendorId,
          productId,
          unitPrice: row.unitCost!,
          updatedAt: new Date().toISOString(),
        })
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
    buildReorderDraftFromSnapshot(snapshotId)
  }

  const handleCsvFile = (file: File) => {
    setUploadStatus('idle')
    setUploadMessage('')

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

  const handleResetInventory = () => {
    clearReorderDraft()
    setUploadStatus('idle')
    setUploadMessage('')
    setOrderSplit(null)
    addActivity('stock_reset', 'Inventory import reset — starting fresh')
    toast.show('Inventory reset. You can upload a new file.')
  }

  const hasActiveSession = Boolean(reorderDraft?.lines?.length)
  const showReorder = Boolean(reorderDraft?.lines?.length)

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
          {tabBtn('AI (any file)', 'ai')}
          {tabBtn('CSV only', 'csv')}
        </div>

        {uploadMode === 'ai' ? (
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
        ) : (
          <FileUpload
            accept=".csv"
            onFile={handleCsvFile}
            label="Upload your CSV file here"
          />
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

      {showReorder && (
        <ReorderSection
          onOrderCreated={(order, byVendor) =>
            setOrderSplit({ order, byVendor })
          }
        />
      )}

      <OrderSplitModal
        open={orderSplit !== null}
        onClose={() => setOrderSplit(null)}
        order={orderSplit?.order ?? null}
        byVendor={orderSplit?.byVendor ?? null}
      />

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
