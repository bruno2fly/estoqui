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

function groupOrderByVendor(order: Order, vendors: { id: string; name: string }[]) {
  const byVendor: Record<
    string,
    { vendor: { id: string; name: string }; lines: typeof order.lines }
  > = {}
  order.lines.forEach((line) => {
    const vendorId = line.vendorId
    if (!byVendor[vendorId]) {
      byVendor[vendorId] = {
        vendor: vendors.find((v) => v.id === vendorId) ?? {
          id: vendorId,
          name: 'Unknown',
        },
        lines: [],
      }
    }
    byVendor[vendorId].lines.push(line)
  })
  return byVendor
}

export function OrderDetailModal({
  open,
  onClose,
  orderId,
}: {
  open: boolean
  onClose: () => void
  orderId: string | null
}) {
  const toast = useToast()
  const order = useStore((s) =>
    orderId ? s.orders.find((o) => o.id === orderId) : null
  )
  const vendors = useStore((s) => s.vendors)
  const storeName = useStore((s) => s.settings?.storeName ?? DEFAULT_SETTINGS.storeName)

  if (!order) return null

  const byVendor = groupOrderByVendor(order, vendors)

  const copyWhatsApp = (vendorId: string) => {
    const group = byVendor[vendorId]
    if (!group) return
    const items = group.lines.map((l) => ({
      qty: l.qty,
      name: l.productName ?? 'Product',
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    }))
    const subtotal =
      order.totalsByVendor[vendorId] ??
      items.reduce((s, i) => s + i.lineTotal, 0)
    const text = formatWhatsAppMessage(
      storeName,
      group.vendor.name,
      items,
      subtotal
    )
    navigator.clipboard.writeText(text).then(() =>
      toast.show('WhatsApp text copied to clipboard!')
    )
  }

  const downloadCSV = (vendorId: string) => {
    const group = byVendor[vendorId]
    if (!group) return
    const total = order.totalsByVendor[vendorId] ?? 0
    const csv = formatOrderCSV(group.lines, total)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pedido_${group.vendor.name}_${order.createdAt.slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.show('CSV downloaded!')
  }

  const copyEmail = (vendorId: string) => {
    const group = byVendor[vendorId]
    if (!group) return
    const total = order.totalsByVendor[vendorId] ?? 0
    const text = formatOrderEmail(group.vendor.name, group.lines, total, storeName)
    navigator.clipboard.writeText(text).then(() =>
      toast.show('Email text copied!')
    )
  }

  const title = `Order from ${new Date(order.createdAt).toLocaleDateString('pt-BR')}`

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="800px">
      <div className="space-y-5">
        {Object.values(byVendor).map((group) => (
          <div
            key={group.vendor.id}
            className="rounded-2xl border border-surface-border bg-background/40 overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-surface-border bg-surface-hover/40">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
              </span>
              <h4 className="text-fg font-semibold text-sm">{group.vendor.name}</h4>
            </div>
            <div className="px-4 pt-3">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider py-2">Product</th>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider py-2">Qty</th>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider py-2">Unit</th>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((l, i) => (
                  <tr key={i} className="border-b border-surface-border last:border-0">
                    <td className="py-2.5 text-fg">{l.productName ?? 'Product removed'}</td>
                    <td className="py-2.5 text-fg-secondary tabular-nums">{l.qty}</td>
                    <td className="py-2.5 text-fg-secondary tabular-nums">$ {l.unitPrice.toFixed(2)}</td>
                    <td className="py-2.5 text-fg tabular-nums">$ {l.lineTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right font-semibold text-sm text-fg mt-3 tabular-nums">
              Subtotal: $ {(order.totalsByVendor[group.vendor.id] ?? 0).toFixed(2)}
            </p>
            </div>
            <div className="flex gap-2 px-4 py-3 flex-wrap border-t border-surface-border mt-3 bg-surface-hover/30">
              <Button onClick={() => copyWhatsApp(group.vendor.id)}>
                <WhatsAppIcon /> Copy WhatsApp
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadCSV(group.vendor.id)}
              >
                <DownloadIcon /> Download CSV
              </Button>
              <Button
                variant="secondary"
                onClick={() => copyEmail(group.vendor.id)}
              >
                <MailIcon /> Copy Email
              </Button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
          <span className="text-sm text-fg-secondary">Order total</span>
          <p className="text-lg font-semibold text-fg tabular-nums">
            $ {order.total.toFixed(2)}
          </p>
        </div>
      </div>
    </Modal>
  )
}

function WhatsAppIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}
