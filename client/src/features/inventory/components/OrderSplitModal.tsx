import { useState } from 'react'
import { useStore } from '@/store'
import { DEFAULT_SETTINGS } from '@/store'
import { Modal, Button } from '@/shared/components'
import { useToast } from '@/shared/components'
import {
  formatWhatsAppMessage,
  formatOrderCSV,
  formatOrderEmail,
} from '@/shared/lib/orderExport'
import type { Order } from '@/types'
import type { OrderGroup } from '@/store/actions/inventoryActions'

export function OrderSplitModal({
  open,
  onClose,
  order,
  byVendor,
}: {
  open: boolean
  onClose: () => void
  order: Order | null
  byVendor: Record<string, OrderGroup> | null
}) {
  const toast = useToast()
  const storeName = useStore((s) => s.settings?.storeName ?? DEFAULT_SETTINGS.storeName)
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null)

  if (!order || !byVendor) return null

  const groups = Object.values(byVendor).sort((a, b) => b.lines.length - a.lines.length)
  const totalVendors = groups.length
  const totalItems = groups.reduce((sum, g) => sum + g.lines.length, 0)

  const toggleExpand = (vendorId: string) => {
    setExpandedVendor((prev) => (prev === vendorId ? null : vendorId))
  }

  const copyWhatsApp = (vendorId: string) => {
    const group = byVendor[vendorId]
    if (!group) return
    const items = group.lines.map((l) => ({
      qty: l.qty,
      name: l.productName ?? 'Product',
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    }))
    const subtotal = order.totalsByVendor[vendorId] ?? items.reduce((s, i) => s + i.lineTotal, 0)
    const text = formatWhatsAppMessage(storeName, group.vendor.name, items, subtotal)
    navigator.clipboard.writeText(text).then(() => toast.show('WhatsApp message copied!'))
  }

  const downloadCSV = (vendorId: string) => {
    const group = byVendor[vendorId]
    if (!group) return
    const lines = group.lines
    const total = order.totalsByVendor[vendorId] ?? 0
    const csv = formatOrderCSV(lines, total)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `order_${group.vendor.name}_${order.createdAt.slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.show('CSV downloaded!')
  }

  const copyEmail = (vendorId: string) => {
    const group = byVendor[vendorId]
    if (!group) return
    const lines = group.lines
    const total = order.totalsByVendor[vendorId] ?? 0
    const text = formatOrderEmail(group.vendor.name, lines, total, storeName)
    navigator.clipboard.writeText(text).then(() => toast.show('Email text copied!'))
  }

  const copyAllWhatsApp = () => {
    let count = 0
    const allMessages: string[] = []
    for (const group of groups) {
      const items = group.lines.map((l) => ({
        qty: l.qty,
        name: l.productName ?? 'Product',
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      }))
      const subtotal = order.totalsByVendor[group.vendorId] ?? group.subtotal
      allMessages.push(formatWhatsAppMessage(storeName, group.vendor.name, items, subtotal))
      count++
    }
    navigator.clipboard.writeText(allMessages.join('\n\n---\n\n')).then(() =>
      toast.show(`All ${count} vendor orders copied!`)
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Order Summary"
      maxWidth="1000px"
    >
      <div className="space-y-5">
        {/* Summary bar */}
        <div className="flex items-center gap-6 bg-primary/5 border border-primary/20 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">{totalVendors}</span>
            <span className="text-sm text-muted">vendors</span>
          </div>
          <div className="w-px h-8 bg-surface-border" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-fg">{totalItems}</span>
            <span className="text-sm text-muted">items</span>
          </div>
          <div className="w-px h-8 bg-surface-border" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-success">R$ {order.total.toFixed(2)}</span>
            <span className="text-sm text-muted">total</span>
          </div>
          <div className="ml-auto">
            <button
              type="button"
              onClick={copyAllWhatsApp}
              className="text-xs font-medium text-primary hover:text-primary-hover transition-colors px-3 py-1.5 rounded-lg border border-primary/30 hover:bg-primary/10"
            >
              Copy All for WhatsApp
            </button>
          </div>
        </div>

        {/* Vendor cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groups.map((group) => {
            const isExpanded = expandedVendor === group.vendorId
            const subtotal = order.totalsByVendor[group.vendorId] ?? group.subtotal

            return (
              <div
                key={group.vendorId}
                className={`rounded-xl border transition-all ${
                  isExpanded
                    ? 'border-primary/40 bg-primary/5 col-span-1 sm:col-span-2'
                    : 'border-surface-border bg-surface hover:border-primary/30 hover:shadow-sm'
                }`}
              >
                {/* Card header */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-fg truncate">
                        {group.vendor.name}
                      </h4>
                      <p className="text-xs text-muted mt-0.5">
                        {group.lines.length} {group.lines.length === 1 ? 'product' : 'products'} · R$ {subtotal.toFixed(2)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.vendorId)}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors px-2 py-1 rounded-lg hover:bg-primary/10 shrink-0"
                    >
                      {isExpanded ? (
                        <>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                          Hide
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                          See list
                        </>
                      )}
                    </button>
                  </div>

                  {/* Action buttons row */}
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => copyWhatsApp(group.vendorId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700/50 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.96 7.96 0 01-4.108-1.138l-.292-.174-3.033.795.81-2.957-.192-.306A7.963 7.963 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/>
                      </svg>
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => copyEmail(group.vendorId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
                      </svg>
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadCSV(group.vendorId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface border border-surface-border text-fg hover:bg-surface-hover transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      CSV
                    </button>
                  </div>
                </div>

                {/* Expandable product list */}
                {isExpanded && (
                  <div className="border-t border-surface-border">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-surface">
                          <tr className="border-b border-surface-border">
                            <th className="text-left text-muted font-semibold px-4 py-2">Product</th>
                            <th className="text-right text-muted font-semibold px-3 py-2 w-16">Qty</th>
                            <th className="text-right text-muted font-semibold px-3 py-2 w-24">Unit</th>
                            <th className="text-right text-muted font-semibold px-4 py-2 w-24">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((l, i) => (
                            <tr key={i} className="border-b border-surface-border/50 hover:bg-surface-hover/50">
                              <td className="px-4 py-1.5 text-fg">{l.productName}</td>
                              <td className="px-3 py-1.5 text-right text-fg">{l.qty}</td>
                              <td className="px-3 py-1.5 text-right text-muted">R$ {l.unitPrice.toFixed(2)}</td>
                              <td className="px-4 py-1.5 text-right font-medium text-fg">R$ {l.lineTotal.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2 text-right border-t border-surface-border bg-surface">
                      <span className="text-sm font-semibold text-fg">
                        Subtotal: R$ {subtotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Grand total footer */}
        <div className="pt-4 border-t-2 border-surface-border flex items-center justify-between">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <p className="text-lg font-bold text-fg">
            Grand Total: R$ {order.total.toFixed(2)}
          </p>
        </div>
      </div>
    </Modal>
  )
}
