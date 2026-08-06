import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllStoreRows, resolveAppStoreId } from '@/lib/appSync'

/**
 * Weekly Business Report (Enterprise — the Software itself is entitlement-gated).
 *
 * Data tiers, all read live from the App's tables via the owner's session/RLS:
 *  1. REVENUE  — app_daily_sales ("Fechamento do dia" typed in the App).
 *  2. SPEND    — app_requests marked ordered (replenishment ≈ consumption),
 *                priced from app_products purchase/sale prices (estimates).
 *  3. (later)  — POS upload for exact per-product sales.
 */

interface DayRevenue {
  date: string
  total: number
}

interface Mover {
  name: string
  qty: number
  unit: string
  spendEst: number
  retailEst: number
}

interface ReportData {
  revThisWeek: number
  revPrevWeek: number
  days: DayRevenue[]
  orderedLines: number
  spendEst: number
  retailEst: number
  movers: Mover[]
  pendingCount: number
}

const DAY = 86_400_000

function isoDay(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<ReportData | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const uid = auth.user?.id
        if (!uid) throw new Error('Not signed in')
        const storeId = await resolveAppStoreId(uid)
        if (!storeId) throw new Error('No App store found for this account')

        const now = Date.now()
        const weekStart = now - 7 * DAY
        const prevStart = now - 14 * DAY

        const [sales, requests, products] = await Promise.all([
          fetchAllStoreRows('app_daily_sales', storeId, 'sale_date, total'),
          fetchAllStoreRows('app_requests', storeId, 'product_id, qty, unit, status, ordered_at, created_at'),
          fetchAllStoreRows('app_products', storeId, 'id, name, purchase_price, sale_price'),
        ])

        const priceById = new Map(
          products.map((p) => [
            p.id as string,
            {
              name: (p.name as string) ?? '—',
              purchase: Number(p.purchase_price) || 0,
              sale: Number(p.sale_price) || 0,
            },
          ]),
        )

        // ---- Revenue from daily closings ---------------------------------
        let revThisWeek = 0
        let revPrevWeek = 0
        const days: DayRevenue[] = []
        for (const s of sales) {
          const date = s.sale_date as string
          const total = Number(s.total) || 0
          const ts = new Date(`${date}T12:00:00`).getTime()
          if (ts >= weekStart) {
            revThisWeek += total
            days.push({ date, total })
          } else if (ts >= prevStart) {
            revPrevWeek += total
          }
        }
        days.sort((a, b) => b.date.localeCompare(a.date))

        // ---- Replenishment (ordered in the last 7 days) -------------------
        const byProduct = new Map<string, Mover>()
        let orderedLines = 0
        let spendEst = 0
        let retailEst = 0
        let pendingCount = 0
        for (const r of requests) {
          if (r.status === 'pending') {
            pendingCount++
            continue
          }
          const orderedAt = r.ordered_at ? new Date(r.ordered_at as string).getTime() : NaN
          if (!Number.isFinite(orderedAt) || orderedAt < weekStart) continue
          const qty = Number(r.qty) || 0
          const price = priceById.get(r.product_id as string)
          if (!price) continue
          orderedLines++
          const lineSpend = qty * price.purchase
          const lineRetail = qty * price.sale
          spendEst += lineSpend
          retailEst += lineRetail
          const cur = byProduct.get(r.product_id as string) ?? {
            name: price.name,
            qty: 0,
            unit: (r.unit as string) === 'case' ? 'case' : 'un',
            spendEst: 0,
            retailEst: 0,
          }
          cur.qty += qty
          cur.spendEst += lineSpend
          cur.retailEst += lineRetail
          byProduct.set(r.product_id as string, cur)
        }
        const movers = [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 8)

        if (!cancelled) {
          setData({ revThisWeek, revPrevWeek, days, orderedLines, spendEst, retailEst, movers, pendingCount })
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load report')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p className="text-sm text-muted py-12 text-center">Building your weekly report…</p>
  }
  if (error || !data) {
    return (
      <p className="text-sm text-danger bg-danger-bg rounded-xl px-4 py-3">
        {error || 'Failed to load report'}
      </p>
    )
  }

  const delta =
    data.revPrevWeek > 0 ? ((data.revThisWeek - data.revPrevWeek) / data.revPrevWeek) * 100 : null
  const marginEst =
    data.spendEst > 0 ? ((data.retailEst - data.spendEst) / data.spendEst) * 100 : null

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-secondary">
        Last 7 days · revenue from daily closings typed in the App · purchase figures estimated
        from your orders.
      </p>

      {/* ---- Summary cards ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Revenue (7 days)"
          value={data.revThisWeek > 0 ? money(data.revThisWeek) : '—'}
          hint={
            delta != null
              ? `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}% vs previous week`
              : 'Type daily closings in the App to track revenue'
          }
        />
        <SummaryCard
          label="Est. spend on orders"
          value={data.spendEst > 0 ? money(data.spendEst) : '—'}
          hint={`${data.orderedLines} order line(s) this week`}
        />
        <SummaryCard
          label="Est. retail value ordered"
          value={data.retailEst > 0 ? money(data.retailEst) : '—'}
          hint="qty × sale price of replenished items"
        />
        <SummaryCard
          label="Est. margin on replenishment"
          value={marginEst != null ? `${marginEst.toFixed(0)}%` : '—'}
          hint={data.pendingCount > 0 ? `${data.pendingCount} item(s) still pending order` : 'All caught up'}
        />
      </div>

      {/* ---- Daily closings ---- */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-fg mb-4">Daily closings</h2>
        {data.days.length === 0 ? (
          <p className="text-sm text-muted">
            No closings this week. In the App&apos;s home screen, type &ldquo;Fechamento do
            dia&rdquo; each evening — it takes 10 seconds and turns this report on.
          </p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {data.days.map((d) => (
              <li key={d.date} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-fg">{d.date}</span>
                <span className="text-sm font-semibold text-fg tabular-nums">{money(d.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Top movers (replenishment proxy) ---- */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-fg mb-1">Top replenished products</h2>
        <p className="text-xs text-fg-secondary mb-4">
          What your team reordered most this week — a proxy for what sold.
        </p>
        {data.movers.length === 0 ? (
          <p className="text-sm text-muted">
            No orders marked as sent in the last 7 days. Orders sent from the App&apos;s Pedidos
            screen appear here automatically.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium text-right">Qty</th>
                <th className="pb-2 font-medium text-right">Est. spend</th>
                <th className="pb-2 font-medium text-right">Est. retail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.movers.map((m) => (
                <tr key={m.name}>
                  <td className="py-2.5 text-fg">{m.name}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">
                    {m.qty} {m.unit}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-fg">
                    {m.spendEst > 0 ? money(m.spendEst) : '—'}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-fg">
                    {m.retailEst > 0 ? money(m.retailEst) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted">
        Estimates are computed from order quantities × product prices. Upload your POS export for
        exact per-product sales (coming next). Reference day: {isoDay(Date.now())}.
      </p>
    </div>
  )
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface border border-surface-border rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-fg-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold text-fg tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}
