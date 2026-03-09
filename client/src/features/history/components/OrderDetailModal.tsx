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
      <div className="space-y-6">
        {Object.values(byVendor).map((group) => (
          <div
            key={group.vendor.id}
            className="p-4 bg-surface rounded-lg border border-surface-border"
          >
            <h4 className="text-fg font-semibold mb-3">{group.vendor.name}</h4>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left text-muted font-semibold py-2">Product</th>
                  <th className="text-left text-muted font-semibold py-2">Qty</th>
                  <th className="text-left text-muted font-semibold py-2">Unit</th>
                  <th className="text-left text-muted font-semibold py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((l, i) => (
                  <tr key={i} className="border-b border-surface-border">
                    <td className="py-2">{l.productName ?? 'Product removed'}</td>
                    <td className="py-2">{l.qty}</td>
                    <td className="py-2">$ {l.unitPrice.toFixed(2)}</td>
                    <td className="py-2">$ {l.lineTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right font-semibold mt-2">
              Subtotal: $ {(order.totalsByVendor[group.vendor.id] ?? 0).toFixed(2)}
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button onClick={() => copyWhatsApp(group.vendor.id)}>
                📱 Copy WhatsApp
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadCSV(group.vendor.id)}
              >
                📥 Download CSV
              </Button>
              <Button
                variant="secondary"
                onClick={() => copyEmail(group.vendor.id)}
              >
                📧 Copy Email
              </Button>
            </div>
          </div>
        ))}
        <div className="pt-4 border-t-2 border-surface-border text-right">
          <p className="text-lg font-semibold">
            Total: $ {order.total.toFixed(2)}
          </p>
        </div>
      </div>
    </Modal>
  )
}
