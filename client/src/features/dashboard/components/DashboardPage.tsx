import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '@/store'
import { getLowStockCount } from '@/store/selectors/dashboard'
import { FileUpload, InfoTip } from '@/shared/components'
import { useToast } from '@/shared/components'
import { parseCSVStock } from '@/features/inventory/lib/csvStock'
import { findProductMatch, matchKey } from '@/shared/lib/matching'

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
  const settings = useStore((s) => s.settings)
  const lowStockCount = useStore(getLowStockCount)
  const commitStockImport = useStore((s) => s.commitStockImport)
  const bulkCreateProductsFromSnapshot = useStore((s) => s.bulkCreateProductsFromSnapshot)
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

      // Match existing products
      const currentProducts = useStore.getState().products
      const currentMatches = useStore.getState().matches
      const newMatches: Record<string, string> = {}
      const productPatches: Record<string, { stockQty?: number; unitCost?: number; unitPrice?: number; category?: string }> = {}

      rows.forEach((row) => {
        const productId = findProductMatch(row.rawName, row.rawBrand, currentProducts, currentMatches, row.rawSku)
        if (productId) {
          row.matchedProductId = productId
          newMatches[matchKey(row.rawName, row.rawBrand)] = productId
          const existing = productPatches[productId]
          if (existing) {
            existing.stockQty = (existing.stockQty ?? 0) + row.stockQty
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
        sourceFileName: file.name,
        sourceType: 'csv',
        rows,
        newMatches,
        productPatches,
      })

      // Auto-create products for unmatched rows (with SKU, cost, vendor)
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

      const matchedCount = rows.filter((r) => r.matchedProductId).length
      addActivity('stock_uploaded', `Stock snapshot uploaded: ${file.name} (${rows.length} items, ${matchedCount} matched)`)
      toast.show(`${rows.length} products imported from CSV`)
    }
    reader.onerror = () => {
      toast.show('Failed to read file.', 'error')
    }
    reader.readAsText(file)
  }, [commitStockImport, bulkCreateProductsFromSnapshot, settings, addActivity, toast])

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <section className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-lg md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-primary-foreground/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-24 size-48 rounded-full bg-primary-foreground/10 blur-2xl" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium">
              {lowStockCount > 0 ? 'Action needed' : 'All caught up'}
            </span>
            <h1 className="mt-4 text-balance text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
              {lowStockCount > 0
                ? `You have ${lowStockCount} item${lowStockCount === 1 ? '' : 's'} running low on stock`
                : 'Your inventory is in good shape'}
            </h1>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-primary-foreground/80">
              {lowStockCount > 0
                ? 'Review the items below their minimum and generate reorder lists to send to your vendors.'
                : 'Nothing needs reordering right now. Upload a fresh CSV to keep your counts up to date.'}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/inventory"
                className="inline-flex items-center gap-2 rounded-xl bg-primary-foreground px-4 py-2.5 text-sm font-semibold text-primary transition-transform hover:-translate-y-0.5"
              >
                <BoxIcon />
                View inventory
              </Link>
              <Link
                to="/catalog"
                className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/30 px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              >
                Open catalog
              </Link>
            </div>
          </div>

          <div className="hidden shrink-0 md:block">
            <div className="flex size-32 items-center justify-center rounded-3xl bg-primary-foreground/15 backdrop-blur-sm">
              <PackageIcon />
            </div>
          </div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={<BoxIcon />} tone="default" label="Total products" value={pad(products.length)} tip="All the products registered in your store catalog." />
        <KpiCard icon={<PeopleIcon />} tone="default" label="Total vendors" value={pad(vendors.length)} tip="Companies or people you buy products from." />
        <KpiCard icon={<CartAlertIcon />} tone="warning" label="Low stock items" value={pad(lowStockCount)} tip="Products running low that you need to reorder soon." />
        <KpiCard icon={<OrderIcon />} tone="success" label="Total orders" value={pad(orders.length)} tip="Purchase orders you created to send to your vendors." />
      </section>

      {/* Two-column: Notifications + Upload */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(320px,400px)]">
        {/* Notifications */}
        <section className="flex flex-col rounded-2xl border border-surface-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BellSmIcon />
              <h2 className="text-base font-semibold text-fg">Notifications</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowAllNotifs(!showAllNotifs)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showAllNotifs ? 'Show less' : `See all (${allNotifications.length})`}
            </button>
          </div>
          <ul className="mt-4 flex flex-col gap-1">
            {notifications.map((n, i) => (
              <li key={i}>
                <div className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface-hover">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <BellSmIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{n.vendor}</p>
                    <p className="truncate text-xs text-fg-secondary mt-0.5">{n.message}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{n.time}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Upload */}
        <section className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UploadSmIcon />
            <h2 className="text-base font-semibold text-fg">Import inventory</h2>
          </div>
          <p className="mt-0.5 text-sm text-fg-secondary">Upload a CSV to bulk update stock counts</p>
          <div className="mt-4">
            <FileUpload
              accept=".csv"
              onFile={handleCsvUpload}
              label="Upload your CSV file here"
            />
          </div>
        </section>
      </div>

      {/* Recent Activity - full width */}
      <section className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-fg">Recent activity</h2>
            <p className="mt-0.5 text-sm text-fg-secondary">Latest events across inventory and orders</p>
          </div>
          <div className="flex items-center gap-3">
            {(activity ?? []).length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllActivity(!showAllActivity)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {showAllActivity ? 'Show less' : `See all (${(activity ?? []).length})`}
              </button>
            )}
            <Link to="/history" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all
              <ArrowRightIcon />
            </Link>
          </div>
        </div>

        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted text-center py-10">No recent activity</p>
        ) : (
          <ul className="mt-4 flex flex-col">
            {recentActivity.map((act, i) => (
              <li
                key={i}
                className={`flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-4 ${i !== 0 ? 'border-t border-surface-border' : ''}`}
              >
                <span className="inline-flex w-fit items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground whitespace-nowrap">
                  {act.type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{act.description}</p>
                </div>
                <span className="shrink-0 text-xs text-muted whitespace-nowrap">{act.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const KPI_TONES: Record<string, string> = {
  default: 'bg-accent text-accent-foreground',
  warning: 'bg-warning-bg text-warning-foreground',
  success: 'bg-success-bg text-success',
}

function KpiCard({ icon, tone, label, value, tip }: { icon: React.ReactNode; tone: 'default' | 'warning' | 'success'; label: string; value: string; tip?: string }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <span className={`flex size-10 items-center justify-center rounded-xl ${KPI_TONES[tone]}`}>
        {icon}
      </span>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <p className="text-sm text-fg-secondary">{label}</p>
        {tip && <InfoTip text={tip} />}
      </div>
    </div>
  )
}

/* ── Icons (inherit color from parent via currentColor) ── */

function BoxIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function PackageIcon() {
  return (
    <svg className="size-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function CartAlertIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
    </svg>
  )
}

function OrderIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  )
}

function BellSmIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}

function UploadSmIcon() {
  return (
    <svg className="size-[18px] text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}
