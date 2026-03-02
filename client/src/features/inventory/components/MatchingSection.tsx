import { useState } from 'react'
import { useStore } from '@/store'
import { useToast } from '@/shared/components'
import { matchKey } from '../lib/matching'
import type { StockSnapshotRow } from '@/types'

interface UnmatchedRow {
  row: StockSnapshotRow
  snapshotRowIndex: number
}

const PAGE_SIZE = 50

export function MatchingSection({
  snapshotId,
  onAllMatched,
}: {
  snapshotId: string
  onAllMatched: () => void
}) {
  const toast = useToast()
  const snapshot = useStore((s) =>
    s.stockSnapshots.find((snap) => snap.id === snapshotId)
  )
  const products = useStore((s) => s.products)
  const setMatchOnRow = useStore((s) => s.setMatchOnRow)
  const addProduct = useStore((s) => s.addProduct)
  const setMatch = useStore((s) => s.setMatch)
  const settings = useStore((s) => s.settings)
  const addActivity = useStore((s) => s.addActivity)
  const bulkCreateProductsFromSnapshot = useStore((s) => s.bulkCreateProductsFromSnapshot)

  const [page, setPage] = useState(0)
  const [bulkCreating, setBulkCreating] = useState(false)

  if (!snapshot) return null

  const unmatched: UnmatchedRow[] = snapshot.rows
    .map((row, index) => ({ row, snapshotRowIndex: index }))
    .filter(({ row }) => !row.matchedProductId)

  if (unmatched.length === 0) {
    onAllMatched()
    return null
  }

  const totalPages = Math.ceil(unmatched.length / PAGE_SIZE)
  const pageItems = unmatched.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const productOptions: { value: string; label: string }[] = [
    { value: '', label: 'Select product...' },
    ...products.map((p) => ({
      value: p.id,
      label: `${p.sku ? `[${p.sku}] ` : ''}${p.name} ${p.brand}`,
    })),
  ]

  const handleMapToProduct = (snapshotRowIndex: number, productId: string) => {
    if (!productId) return
    const row = snapshot.rows[snapshotRowIndex]
    const key = matchKey(row.rawName, row.rawBrand)
    setMatch(key, productId)
    setMatchOnRow(snapshotId, snapshotRowIndex, productId)
    toast.show('Product mapped!')
  }

  const handleCreateProduct = (snapshotRowIndex: number) => {
    const row = snapshot.rows[snapshotRowIndex]
    const productId = addProduct({
      name: row.rawName,
      brand: row.rawBrand,
      sku: row.rawSku || '',
      category: row.category || '',
      unitSize: '',
      minStock: settings?.defaultMinStock ?? 10,
      unitCost: row.unitCost,
      unitPrice: row.unitPrice,
    })
    const key = matchKey(row.rawName, row.rawBrand)
    setMatch(key, productId)
    setMatchOnRow(snapshotId, snapshotRowIndex, productId)
    addActivity('product_created', `Product created: ${row.rawName} ${row.rawBrand}`)
    toast.show('Product created and mapped!')
  }

  const handleCreateAll = () => {
    setBulkCreating(true)
    const defaultMin = settings?.defaultMinStock ?? 10

    const items = unmatched.map(({ row, snapshotRowIndex }) => ({
      snapshotRowIndex,
      product: {
        name: row.rawName,
        brand: row.rawBrand,
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
    toast.show(`${items.length} products created and mapped!`)
    setBulkCreating(false)
  }

  return (
    <div className="bg-surface border border-surface-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span className="text-[13px] font-semibold text-fg">Map Products</span>
      </div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-muted text-[12px]">
          Unmatched items ({unmatched.length}). Map to existing products or create new ones.
        </p>
        <button
          type="button"
          disabled={bulkCreating}
          onClick={handleCreateAll}
          className="px-4 py-2 rounded-lg bg-primary text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {bulkCreating
            ? 'Creating…'
            : `Create All ${unmatched.length} as New Products`}
        </button>
      </div>
      <div className="border border-surface-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['SKU (CSV)', 'Name (CSV)', 'Brand (CSV)', 'Stock', 'Category', 'Action'].map((h) => (
                  <th key={h} className="text-left text-fg font-semibold text-[13px] px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map(({ row, snapshotRowIndex }) => (
                <tr key={snapshotRowIndex} className="border-t border-surface-border hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 text-[13px] text-fg font-mono">{row.rawSku || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-fg">{row.rawName}</td>
                  <td className="px-4 py-3 text-[13px] text-fg">{row.rawBrand || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-fg">{row.stockQty}</td>
                  <td className="px-4 py-3 text-[13px] text-muted">{row.category || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        className="bg-input-bg border border-input-border text-fg px-2 py-1.5 rounded-lg text-[12px] min-w-[180px]"
                        value=""
                        onChange={(e) =>
                          handleMapToProduct(snapshotRowIndex, e.target.value)
                        }
                      >
                        {productOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleCreateProduct(snapshotRowIndex)}
                        className="px-3 py-1.5 rounded-md bg-fg text-background text-[11px] font-medium hover:opacity-80 transition-opacity"
                      >
                        Create Product
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <p className="text-[11px] text-muted">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, unmatched.length)} of {unmatched.length}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-surface-border hover:bg-surface-hover disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-surface-border hover:bg-surface-hover disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
