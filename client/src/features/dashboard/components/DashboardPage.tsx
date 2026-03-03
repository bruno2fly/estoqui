import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '@/store'
import { getLowStockCount } from '@/store/selectors/dashboard'
import { FileUpload } from '@/shared/components'
import { useToast } from '@/shared/components'
import { parseCSVStock } from '@/features/inventory/lib/csvStock'

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  stock_uploaded: 'Stock Upload',
  reorder_generated: 'Reorder List',
  order_created: 'Order Created',
  vendor_price_updated: 'Price Updated',
  product_created: 'Product Created',
  system: 'System',
}

export function DashboardPage() {
  const products = useStore((s) => s.products)
  const vendors = useStore((s) => s.vendors)
  const orders = useStore((s) => s.orders)
  const activity = useStore((s) => s.activity)
  const lowStockCount = useStore(getLowStockCount)
  const addStockSnapshot = useStore((s) => s.addStockSnapshot)
  const addActivity = useStore((s) => s.addActivity)
  const toast = useToast()

  const [showAllNotifs, setShowAllNotifs] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)

  const allNotifications = [
    { vendor: 'TRIUNFO FOODS', message: 'O pedido de 10kg de Feijão carioca...', time: 'Há 1h' },
    { vendor: 'TRIUNFO FOODS', message: 'Seu pedido foi entregue!', time: 'Há 4h' },
    { vendor: 'SYSTEM', message: 'Low stock alert: 3 products below minimum', time: 'Há 1d' },
    { vendor: 'SYSTEM', message: 'Welcome to Estoqui! Upload your first CSV to get started.', time: 'Há 2d' },
  ]

  const notifications = showAllNotifs ? allNotifications : allNotifications.slice(0, 2)

  const recentActivity = useMemo(() => {
    const items = showAllActivity ? (activity ?? []) : (activity ?? []).slice(0, 5)
    return items.map((act) => {
      const date = new Date(act.date)
      return {
        type: ACTIVITY_TYPE_LABELS[act.type] ?? act.type,
        description: act.description,
        date: `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
      }
    })
  }, [activity, showAllActivity])

  const handleCsvUpload = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const rows = parseCSVStock(text)
      if (rows.length === 0) {
        toast.show('No products found in CSV.', 'error')
        return
      }
      addStockSnapshot({
        uploadedAt: new Date().toISOString(),
        sourceFileName: file.name,
        sourceType: 'csv',
        rows,
      })
      addActivity('stock_uploaded', `Stock snapshot uploaded: ${file.name} (${rows.length} items)`)
      toast.show(`${rows.length} products imported from CSV`)
    }
    reader.onerror = () => {
      toast.show('Failed to read file.', 'error')
    }
    reader.readAsText(file)
  }, [addStockSnapshot, addActivity, toast])

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="space-y-5">
      {/* Top row: Overview + Right column */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">

        {/* Overview card - single card wrapping all stats */}
        <div className="bg-surface border border-surface-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <OverviewIcon />
            <span className="text-[13px] font-semibold text-fg">Overview</span>
          </div>
          <div className="space-y-3">
            <StatRow icon={<BoxIcon />} label="Total products" value={pad(products.length)} />
            <StatRow icon={<PeopleIcon />} label="Total vendors" value={pad(vendors.length)} />
            <StatRow icon={<CartAlertIcon />} label="Low stock items" value={pad(lowStockCount)} />
            <StatRow icon={<OrderIcon />} label="Total orders" value={pad(orders.length)} />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Notifications */}
          <div className="bg-surface border border-surface-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BellSmIcon />
                <span className="text-[13px] font-semibold text-fg">Notifications</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAllNotifs(!showAllNotifs)}
                className="text-[11px] text-muted hover:text-primary transition-colors"
              >
                {showAllNotifs ? 'Show less' : `See all (${allNotifications.length})`}
              </button>
            </div>
            <div className="border border-surface-border rounded-xl p-4 space-y-3">
              {notifications.map((n, i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-fg">{n.vendor}</p>
                    <p className="text-[12px] text-fg-secondary mt-0.5 truncate">{n.message}</p>
                  </div>
                  <span className="text-[10px] text-muted whitespace-nowrap pt-0.5">{n.time}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full py-2.5 border border-surface-border rounded-xl text-[12px] text-fg-secondary hover:bg-surface-hover transition-colors flex items-center justify-center gap-1.5"
            >
              <AddNotifIcon />
              Add notification
            </button>
          </div>

          {/* Upload */}
          <div className="bg-surface border border-surface-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <UploadSmIcon />
              <span className="text-[13px] font-semibold text-fg">Upload</span>
            </div>
            <FileUpload
              accept=".csv"
              onFile={handleCsvUpload}
              label="Upload your CSV file here"
            />
          </div>
        </div>
      </div>

      {/* Recent Activity - full width */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ActivitySmIcon />
            <span className="text-[13px] font-semibold text-fg">Recent Activity</span>
          </div>
          <div className="flex items-center gap-3">
            {(activity ?? []).length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllActivity(!showAllActivity)}
                className="text-[11px] text-muted hover:text-primary transition-colors"
              >
                {showAllActivity ? 'Show less' : `See all (${(activity ?? []).length})`}
              </button>
            )}
            <Link to="/history" className="text-[11px] text-muted hover:text-primary transition-colors">Full history</Link>
          </div>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-[12px] text-muted text-center py-6">No recent activity</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left text-[11px] font-semibold text-fg-secondary pb-2.5 pr-4 w-[120px]">Type</th>
                <th className="text-left text-[11px] font-semibold text-fg-secondary pb-2.5 pr-4">Description</th>
                <th className="text-left text-[11px] font-semibold text-fg-secondary pb-2.5 w-[140px]">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((act, i) => (
                <tr key={i} className="border-b border-surface-border last:border-0">
                  <td className="py-2.5 pr-4 text-[12px] text-fg whitespace-nowrap">{act.type}</td>
                  <td className="py-2.5 pr-4 text-[12px] text-fg-secondary">{act.description}</td>
                  <td className="py-2.5 text-[12px] text-muted whitespace-nowrap">{act.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border border-surface-border rounded-xl p-3.5 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-surface-hover flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-fg-secondary leading-tight">{label}</p>
        <p className="text-[26px] font-bold text-fg leading-none tabular-nums mt-0.5">{value}</p>
      </div>
    </div>
  )
}

/* ── Icons ── */

function OverviewIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg className="w-5 h-5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg className="w-5 h-5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function CartAlertIcon() {
  return (
    <svg className="w-5 h-5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
    </svg>
  )
}

function OrderIcon() {
  return (
    <svg className="w-5 h-5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  )
}

function BellSmIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}

function UploadSmIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function AddNotifIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function ActivitySmIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}
