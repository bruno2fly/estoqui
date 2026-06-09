import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { computeBestVendor } from '@/store/selectors/vendorPrices'
import { Badge, SearchInput, ConfirmDialog, InfoTip } from '@/shared/components'
import { useToast } from '@/shared/components'
import { normalize } from '@/shared/lib/matching'
import { AddProductModal } from './AddProductModal'
import { ProductDetailModal } from './ProductDetailModal'
import type { Product } from '@/types'
import {
  getStockStatus,
  getPriceStatus,
  computeMargin,
  type StockStatus,
  type PriceStatus,
} from '@/lib/inventory/status'

type StatusFilter = 'all' | 'LOW' | 'CRITICAL' | 'matched' | 'unmatched'

interface EnrichedProduct {
  product: Product
  stockQty: number | undefined
  minStock: number
  status: StockStatus
  unitCost: number | undefined
  unitPrice: number | undefined
  marginPercent: number | null
  bestVendorName: string
  bestPrice: number | undefined
  bestUpdatedAt: string | undefined
  priceStatus: PriceStatus
  priceCount: number
  hasVendorMatch: boolean
}

const PRICE_STATUS_BADGE: Record<PriceStatus, { label: string; variant: 'fresh' | 'stale' | 'neutral' }> = {
  FRESH: { label: 'FRESH', variant: 'fresh' },
  STALE: { label: 'STALE', variant: 'stale' },
  OLD: { label: 'OLD', variant: 'stale' },
  UNKNOWN: { label: 'UNKNOWN', variant: 'neutral' },
}

const STATUS_PILL_CLS: Record<StockStatus, string> = {
  OK: 'bg-success-bg text-success',
  LOW: 'bg-warning-bg text-warning',
  CRITICAL: 'bg-danger-bg text-danger',
  NO_DATA: 'bg-surface-hover text-muted',
}

export function CatalogPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const state = useStore((s) => s)
  const products = state.products
  const updateProduct = useStore((s) => s.updateProduct)
  const removeProduct = useStore((s) => s.deleteProduct)
  const addActivity = useStore((s) => s.addActivity)

  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [detailProductId, setDetailProductId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    product: Product
    priceCount: number
  } | null>(null)

  const enriched: EnrichedProduct[] = useMemo(() => {
    return products.map((product) => {
      const best = computeBestVendor(state, product.id)
      const bestVendorName = best
        ? state.vendors.find((v) => v.id === best.vendorId)?.name ?? '—'
        : '—'
      const priceCount = state.vendorPrices.filter(
        (vp) => vp.productId === product.id
      ).length

      const stockQty = product.stockQty
      const minStock = product.minStock ?? 10
      const status = getStockStatus(stockQty, minStock)

      const unitCost = product.unitCost ?? (best ? best.unitPrice : undefined)
      const unitPrice = product.unitPrice
      const marginPercent = computeMargin(unitCost, unitPrice)

      const priceStatus = getPriceStatus(best?.updatedAt)

      return {
        product,
        stockQty,
        minStock,
        status,
        unitCost,
        unitPrice,
        marginPercent,
        bestVendorName,
        bestPrice: best?.unitPrice,
        bestUpdatedAt: best?.updatedAt,
        priceStatus,
        priceCount,
        hasVendorMatch: Boolean(best),
      }
    })
  }, [products, state])

  const summary = useMemo(() => {
    let low = 0, critical = 0, matched = 0
    for (const e of enriched) {
      if (e.status === 'LOW') low++
      else if (e.status === 'CRITICAL') critical++
      if (e.hasVendorMatch) matched++
    }
    return {
      total: enriched.length,
      low,
      critical,
      matched,
      unmatched: enriched.length - matched,
    }
  }, [enriched])

  const filtered = useMemo(() => {
    let rows = enriched
    if (statusFilter === 'LOW') rows = rows.filter((e) => e.status === 'LOW')
    else if (statusFilter === 'CRITICAL') rows = rows.filter((e) => e.status === 'CRITICAL')
    else if (statusFilter === 'matched') rows = rows.filter((e) => e.hasVendorMatch)
    else if (statusFilter === 'unmatched') rows = rows.filter((e) => !e.hasVendorMatch)

    if (filter.trim()) {
      const n = normalize(filter)
      rows = rows.filter(
        (e) =>
          normalize(e.product.name).includes(n) ||
          normalize(e.product.brand).includes(n) ||
          normalize(e.product.sku ?? '').includes(n) ||
          normalize(e.product.category ?? '').includes(n)
      )
    }
    return rows
  }, [enriched, filter, statusFilter])

  const handleMinStockChange = useCallback((productId: string, value: string) => {
    const num = Math.max(0, parseInt(value, 10) || 10)
    updateProduct(productId, { minStock: num })
  }, [updateProduct])

  const handleCategoryChange = useCallback((productId: string, value: string) => {
    updateProduct(productId, { category: value })
  }, [updateProduct])

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    const { product } = deleteTarget
    removeProduct(product.id)
    addActivity('system', `Product deleted: ${product.name} ${product.brand}`)
    toast.show('Product deleted')
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-5">
      {/* ── Summary Bar ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard
          label="Products"
          value={summary.total}
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          tip="Total number of products in your catalog. This includes everything you sell in your store."
        />
        <SummaryCard
          label="Low Stock"
          value={summary.low}
          color="text-warning"
          active={statusFilter === 'LOW'}
          onClick={() => setStatusFilter(statusFilter === 'LOW' ? 'all' : 'LOW')}
          tip="Products that are running low. You still have some left, but you should order more soon."
        />
        <SummaryCard
          label="Critical"
          value={summary.critical}
          color="text-danger"
          active={statusFilter === 'CRITICAL'}
          onClick={() => setStatusFilter(statusFilter === 'CRITICAL' ? 'all' : 'CRITICAL')}
          tip="Products that are almost out of stock or already gone. Order these right away!"
        />
        <SummaryCard
          label="Matched"
          value={summary.matched}
          color="text-success"
          active={statusFilter === 'matched'}
          onClick={() => setStatusFilter(statusFilter === 'matched' ? 'all' : 'matched')}
          tip="Products that have at least one vendor with a price. These are ready to order."
        />
        <SummaryCard
          label="Unmatched"
          value={summary.unmatched}
          color="text-fg-secondary"
          active={statusFilter === 'unmatched'}
          onClick={() => setStatusFilter(statusFilter === 'unmatched' ? 'all' : 'unmatched')}
          tip="Products that don't have any vendor price yet. You need to add a vendor and price to order these."
        />
      </div>

      {/* ── Main Card ────────────────────────────────────────────────── */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-semibold text-fg">Product Catalog</h2>
              <p className="text-xs text-fg-secondary">Everything you stock, with prices and stock status</p>
            </div>
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="ml-1 text-[11px] text-primary hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SearchInput
              value={filter}
              onChange={setFilter}
              placeholder="Filter by name, brand, SKU or category..."
              debounceMs={0}
            />
            <button
              type="button"
              onClick={() => navigate('/catalog/needs-sku')}
              className="px-3.5 py-2 rounded-xl border border-surface-border bg-surface text-fg text-[12px] font-medium hover:bg-surface-hover hover:border-primary/40 transition-colors"
            >
              Needs SKU
            </button>
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[12px] font-medium shadow-sm hover:bg-primary-hover transition-colors"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Product
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            No products found
          </p>
        ) : (
          <div className="border border-surface-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {[
                      'Product', 'Brand', 'SKU', 'Category', 'Size',
                      'Stock', 'Status', 'Min Stock',
                      'Unit Cost', 'Sale Price', 'Margin',
                      'Best Vendor', 'Best Price', 'Price Status', 'Actions',
                    ].map((h) => (
                      <th key={h} className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider px-3 py-3 whitespace-nowrap bg-surface-hover/40 border-b border-surface-border">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const p = row.product
                    const badge = PRICE_STATUS_BADGE[row.priceStatus]
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-surface-border hover:bg-surface-hover transition-colors"
                      >
                        <td className="px-3 py-2.5 text-[13px] text-fg font-medium max-w-[180px] truncate" title={p.name}>
                          {p.name}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-fg">
                          {p.brand || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-fg-secondary tabular-nums">
                          {p.sku || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            className="w-24 bg-input-bg border border-input-border text-fg px-1.5 py-1 rounded-md text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            value={p.category ?? ''}
                            onChange={(e) => handleCategoryChange(p.id, e.target.value)}
                            placeholder="—"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-fg-secondary">
                          {p.unitSize || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-fg tabular-nums font-medium">
                          {row.stockQty !== undefined ? row.stockQty : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_PILL_CLS[row.status]}`}>
                            {row.status === 'NO_DATA' ? '—' : row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            className="w-14 bg-input-bg border border-input-border text-fg px-1.5 py-1 rounded-md text-[12px] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            value={p.minStock ?? 10}
                            onChange={(e) => handleMinStockChange(p.id, e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-fg tabular-nums">
                          {row.unitCost != null ? `$ ${row.unitCost.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-fg tabular-nums">
                          {row.unitPrice != null ? `$ ${row.unitPrice.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] tabular-nums">
                          {row.marginPercent !== null ? (
                            <span className={row.marginPercent >= 0 ? 'text-success' : 'text-danger'}>
                              {row.marginPercent.toFixed(0)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-fg-secondary">
                          {row.bestVendorName}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-fg tabular-nums">
                          {row.bestPrice != null ? `$ ${row.bestPrice.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.hasVendorMatch ? (
                            <Badge variant={badge.variant}>
                              {badge.label}
                            </Badge>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailProductId(p.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-surface border border-surface-border text-fg text-[11px] font-medium hover:bg-surface-hover hover:border-primary/40 transition-colors"
                            >
                              Prices
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  product: p,
                                  priceCount: row.priceCount,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-danger-bg text-danger text-[11px] font-medium hover:bg-danger/15 transition-colors"
                            >
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AddProductModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdded={() => {}}
      />

      <ProductDetailModal
        open={detailProductId !== null}
        onClose={() => setDetailProductId(null)}
        productId={detailProductId}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete product?"
        message={
          deleteTarget ? (
            <>
              Delete product &quot;{deleteTarget.product.name}{' '}
              {deleteTarget.product.brand}&quot;?
              {deleteTarget.priceCount > 0 && (
                <>
                  <br />
                  <br />
                  This will also remove {deleteTarget.priceCount} vendor price
                  entries.
                </>
              )}
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}

/* ── Summary Card ────────────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  color,
  active,
  onClick,
  tip,
}: {
  label: string
  value: number
  color?: string
  active?: boolean
  onClick?: () => void
  tip?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-surface border rounded-2xl p-4 text-left shadow-sm transition-all hover:shadow-md ${
        active
          ? 'border-primary ring-1 ring-primary/30'
          : 'border-surface-border hover:bg-surface-hover'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-fg-secondary leading-tight">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      <p className={`text-[22px] font-bold leading-none tabular-nums mt-0.5 ${color ?? 'text-fg'}`}>
        {String(value).padStart(2, '0')}
      </p>
    </button>
  )
}
