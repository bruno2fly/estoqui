import { useState } from 'react'
import { useStore } from '@/store'
import { EmptyState } from '@/shared/components'
import { OrderDetailModal } from './OrderDetailModal'

export function HistoryPage() {
  const orders = useStore((s) => s.orders)
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-[13px] font-semibold text-fg">Order History</span>
        </div>

        {orders.length === 0 ? (
          <EmptyState message="No orders in history" />
        ) : (
          <div className="border border-surface-border rounded-xl overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Date', 'Items', 'Vendors', 'Total', ''].map((h, i) => (
                    <th key={i} className="text-left text-fg font-semibold text-[13px] px-4 py-3">
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
                      <td className="px-4 py-3 text-[13px] text-fg">
                        {date.toLocaleDateString('pt-BR')}{' '}
                        {date.toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-fg">
                        {order.lines.length}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-fg">
                        {vendorCount}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-fg">
                        R$ {order.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailOrderId(order.id)}
                          className="px-3 py-1.5 rounded-md bg-fg text-background text-[11px] font-medium hover:opacity-80 transition-opacity"
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
