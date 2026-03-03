import React, { useMemo } from 'react'
import { useStore } from '@/store'
import { getVendorPricesForProduct } from '@/store/selectors/vendorPrices'
import { getStalenessThreshold } from '@/store/selectors/settings'
import { Badge } from '@/shared/components'
import { useToast } from '@/shared/components'
import type { Order } from '@/types'
import type { OrderGroup } from '@/store/actions/inventoryActions'

interface LastOrderInfo {
  qty: number
  vendorName: string
  unitPrice: number
  lineTotal: number
  date: string
}

export function ReorderSection({
  onOrderCreated,
}: {
  onOrderCreated?: (order: Order, byVendor: Record<string, OrderGroup>) => void
}) {
  const toast = useToast()
  const state = useStore((s) => s)
  const reorderDraft = state.reorderDraft
  const products = state.products
  const orders = state.orders
  const vendors = state.vendors
  const toggleReorderLineSelected = useStore((s) => s.toggleReorderLineSelected)
  const updateReorderLine = useStore((s) => s.updateReorderLine)
  const createOrderFromDraft = useStore((s) => s.createOrderFromDraft)
  const stalenessThreshold = getStalenessThreshold(state)

  const lastOrderByProduct = useMemo(() => {
    const map: Record<string, LastOrderInfo> = {}
    const sorted = [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    for (const order of sorted) {
      for (const line of order.lines) {
        if (map[line.productId]) continue
        const vendor = vendors.find((v) => v.id === line.vendorId)
        map[line.productId] = {
          qty: line.qty,
          vendorName: vendor?.name ?? 'Unknown',
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          date: order.createdAt,
        }
      }
    }
    return map
  }, [orders, vendors])

  const lines = reorderDraft?.lines ?? []

  const grandTotal = lines.reduce((sum, line) => {
    if (line.selected) sum += line.unitPrice * line.suggestedQty
    return sum
  }, 0)

  const handleRecalcQty = (idx: number) => {
    const line = lines[idx]
    if (!line) return
    updateReorderLine(idx, 'suggestedQty', Math.max(0, line.minStock - line.currentStock))
  }

  const handleCreateOrder = () => {
    const result = createOrderFromDraft()
    if (!result.success) {
      toast.show(result.error ?? 'Failed to create order', 'error')
      return
    }
    if (result.order && result.byVendor) {
      toast.show('Order created!')
      onOrderCreated?.(result.order, result.byVendor)
    }
  }

  if (lines.length === 0) {
    return (
      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span className="text-[13px] font-semibold text-fg">Reorder List</span>
        </div>
        <p className="text-muted text-[12px]">No items to reorder.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-surface-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span className="text-[13px] font-semibold text-fg">Reorder List</span>
        </div>
        <button
          type="button"
          onClick={handleCreateOrder}
          className="px-3.5 py-1.5 rounded-lg bg-fg text-background text-[12px] font-medium hover:opacity-80 transition-opacity"
        >
          Create Order
        </button>
      </div>
      <div className="border border-surface-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['', 'Product', 'SKU', 'Current', 'Min', 'Qty', 'Vendor', 'Unit', 'Total', 'Status'].map((h, i) => (
                  <th key={i} className="text-left text-fg font-semibold text-[13px] px-3 py-3">
                    {i === 0 ? '\u2713' : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const product = products.find((p) => p.id === line.productId)
                const vendorPricesForProduct = getVendorPricesForProduct(
                  state,
                  line.productId
                )
                const priceAge = line.priceUpdatedAt
                  ? (Date.now() - new Date(line.priceUpdatedAt).getTime()) /
                    (1000 * 60 * 60 * 24)
                  : null
                const isFresh =
                  priceAge !== null && priceAge <= stalenessThreshold
                const lineTotal = line.unitPrice * line.suggestedQty
                const lastOrder = lastOrderByProduct[line.productId]
                const isCase = line.packType === 'CASE'
                const unitsPerCase = line.unitsPerCase ?? 1

                return (
                  <React.Fragment key={idx}>
                    <tr className="border-t border-surface-border hover:bg-surface-hover transition-colors">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={line.selected}
                          onChange={() => toggleReorderLineSelected(idx)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg">
                        {product ? `${product.name} ${product.brand}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-muted">
                        {product?.sku ?? '-'}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg">{line.currentStock}</td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          value={line.minStock}
                          onChange={(e) =>
                            updateReorderLine(idx, 'minStock', e.target.value)
                          }
                          className="w-14 bg-input-bg border border-input-border text-fg px-1.5 py-1 rounded-lg text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRecalcQty(idx)}
                          className="ml-1 text-xs px-1.5 py-0.5 rounded-lg bg-surface-border hover:bg-input-border transition-colors"
                          title="Recalculate Qty"
                        >
                          ↻
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          value={line.suggestedQty}
                          onChange={(e) =>
                            updateReorderLine(idx, 'suggestedQty', e.target.value)
                          }
                          className="w-14 bg-input-bg border border-input-border text-fg px-1.5 py-1 rounded-lg text-[12px]"
                        />
                        {isCase && (
                          <span className="block text-[10px] text-muted mt-0.5">
                            = {line.suggestedQty * unitsPerCase} units
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          className="min-w-[180px] bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-[12px]"
                          value={line.chosenVendorId ?? ''}
                          onChange={(e) =>
                            updateReorderLine(
                              idx,
                              'chosenVendorId',
                              e.target.value
                            )
                          }
                        >
                          <option value="">Select...</option>
                          {vendorPricesForProduct.map((vp) => {
                            const vpIsCase = vp.packType === 'CASE'
                            const vpUnits = vp.unitsPerCase ?? 1
                            return (
                              <option
                                key={vp.vendorId}
                                value={vp.vendorId}
                              >
                                {vp.vendor?.name} - R$ {vp.unitPrice.toFixed(2)}{vpIsCase ? `/case (${vpUnits}u)` : ''} · R$ {vp.effectiveUnitCost.toFixed(2)}/ea
                              </option>
                            )
                          })}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg">
                        R$ {line.unitPrice.toFixed(2)}
                        {isCase && (
                          <span className="block text-[10px] text-muted">/case</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg">
                        R$ {lineTotal.toFixed(2)}
                      </td>
                      <td className="px-3 py-3">
                        {line.priceUpdatedAt ? (
                          <Badge variant={isFresh ? 'fresh' : 'stale'}>
                            {isFresh ? 'FRESH' : 'STALE'}
                          </Badge>
                        ) : line.chosenVendorId ? (
                          '—'
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                    <tr className="border-t border-surface-border bg-surface-hover">
                      <td className="px-3 py-1.5" />
                      <td className="px-3 py-1.5 text-[11px] text-muted italic" colSpan={2}>
                        {lastOrder ? 'Last order' : 'No previous order'}
                      </td>
                      <td className="px-3 py-1.5" />
                      <td className="px-3 py-1.5" />
                      {lastOrder ? (
                        <>
                          <td className="px-3 py-1.5 text-[11px] text-muted">
                            {lastOrder.qty}
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">
                            {lastOrder.vendorName}
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">
                            R$ {lastOrder.unitPrice.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">
                            R$ {lastOrder.lineTotal.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">
                            {new Date(lastOrder.date).toLocaleDateString('pt-BR')}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5 text-[11px] text-muted">-</td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">-</td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">-</td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">-</td>
                          <td className="px-3 py-1.5 text-[11px] text-muted">-</td>
                        </>
                      )}
                    </tr>
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-5 pt-5 border-t border-surface-border text-right">
        <p className="text-[15px] font-semibold text-fg">Total: R$ {grandTotal.toFixed(2)}</p>
      </div>
    </div>
  )
}
