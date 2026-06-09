import { useState } from 'react'
import { useStore } from '@/store'
import { EmptyState } from '@/shared/components'
import { OrderDetailModal } from './OrderDetailModal'

export function HistoryPage() {
  const orders = useStore((s) => s.orders)
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-fg">Order History</h2>
            <p className="text-xs text-fg-secondary">Every purchase order you've created</p>
          </div>
        </div>

        {orders.length === 0 ? (
          <EmptyState message="No orders in history" />
        ) : (
          <div className="border border-surface-border rounded-xl overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Date', 'Items', 'Vendors', 'Total', ''].map((h, i) => (
                    <th key={i} className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider px-4 py-3 bg-surface-hover/40 border-b border-surface-border">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const date = new Date(order.createdAt)
                  const vendorCount = new Set(
                    order.lines.map((l) => l.vendorId)
                  ).size
                  return (
                    <tr
                      key={order.id}
                      className="border-t border-surface-border hover:bg-surface-hover transition-colors"
                    >
                      <td className="px-4 py-3.5 text-[13px] text-fg">
                        {date.toLocaleDateString('pt-BR')}{' '}
                        {date.toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-fg-secondary tabular-nums">
                        {order.lines.length}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-fg-secondary tabular-nums">
                        {vendorCount}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] font-medium text-fg tabular-nums">
                        $ {order.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailOrderId(order.id)}
                          className="px-3 py-1.5 rounded-lg border border-surface-border bg-surface text-[12px] font-medium text-fg hover:bg-surface-hover hover:border-primary/40 transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderDetailModal
        open={detailOrderId !== null}
        onClose={() => setDetailOrderId(null)}
        orderId={detailOrderId}
      />
    </div>
  )
}
