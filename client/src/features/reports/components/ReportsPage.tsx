import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'
import { getVendorPricesForProduct } from '@/store/selectors/vendorPrices'
import { fetchAllStoreRows, resolveAppStoreId } from '@/lib/appSync'

/**
 * Business Reports (Enterprise — the Software itself is entitlement-gated, so
 * everything here is Enterprise-only by construction).
 *
 * Positioning: "App tells you WHAT to buy; Software tells you what it COSTS
 * and WHO to buy it from."
 *
 * Sections (data read live from the App's tables via the owner's session/RLS,
 * except Price Intelligence which uses the Software's own vendor_prices —
 * data that never syncs to the App by design):
 *   1. Account snapshot        5. Vendor breakdown (count/volume only)
 *   2. Weekly revenue/spend    6. Missed-sale log (client suggestions)
 *   3. Reorder rhythm          7. Vendor price intelligence (cheapest per SKU)
 *   4. Top reordered + team
 */

interface DayRevenue {
  date: string
  total: number
}

interface Mover {
  name: string
  qty: number
  unit: string
  count: number
}

interface TeamRow {
  name: string
  count: number
  qty: number
  first: string
  last: string
}

interface WeekRow {
  label: string
  count: number
}

interface VendorRow {
  name: string
  productsLinked: number
  reorderQty: number
  reorderCount: number
}

interface MissedSale {
  name: string
  note: string | null
  by: string
  date: string
}

interface ReportData {
  // snapshot
  totalProducts: number
  totalRequests: number
  totalVendors: number
  totalMembers: number
  daysActive: number | null
  // revenue (daily closings)
  revThisWeek: number
  revPrevWeek: number
  days: DayRevenue[]
  // replenishment (last 7d)
  spendEst: number
  retailEst: number
  orderedLines: number
  pendingCount: number
  // rhythm
  weeks: WeekRow[]
  dayOfWeek: number[] // Sun..Sat counts (all time)
  // demand + team
  movers: Mover[]
  team: TeamRow[]
  // vendors
  vendorRows: VendorRow[]
  unlinkedProducts: number
  // missed sales
  missedSales: MissedSale[]
}

const DAY = 86_400_000

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

const shortDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<ReportData | null>(null)

  // Software-side state for Price Intelligence (vendor_prices never syncs to
  // the App — this is the Enterprise-only cost layer).
  const swState = useStore((s) => s)

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

        const [sales, requests, products, vendors, members, storeRow] = await Promise.all([
          fetchAllStoreRows('app_daily_sales', storeId, 'sale_date, total'),
          fetchAllStoreRows(
            'app_requests',
            storeId,
            'product_id, qty, unit, status, ordered_at, created_at, requested_by_name',
          ),
          fetchAllStoreRows(
            'app_products',
            storeId,
            'id, name, vendor_id, source, note, created_by_name, created_at, purchase_price, sale_price',
          ),
          fetchAllStoreRows('app_vendors', storeId, 'id, name'),
          fetchAllStoreRows('app_members', storeId, 'user_id, role, display_name, created_at'),
          supabase.from('app_stores').select('created_at').eq('id', storeId).maybeSingle(),
        ])

        const productById = new Map(
          products.map((p) => [
            p.id as string,
            {
              name: (p.name as string) ?? '—',
              vendorId: (p.vendor_id as string | null) ?? null,
              purchase: Number(p.purchase_price) || 0,
              sale: Number(p.sale_price) || 0,
            },
          ]),
        )
        const vendorNameById = new Map(vendors.map((v) => [v.id as string, (v.name as string) ?? '—']))

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

        // ---- Requests: replenishment, rhythm, demand, team ----------------
        let spendEst = 0
        let retailEst = 0
        let orderedLines = 0
        let pendingCount = 0
        const moverMap = new Map<string, Mover>()
        const teamMap = new Map<string, TeamRow>()
        const weekMap = new Map<string, number>()
        const dayOfWeek = [0, 0, 0, 0, 0, 0, 0]
        const vendorAgg = new Map<string | null, { qty: number; count: number }>()

        for (const r of requests) {
          const createdAt = (r.created_at as string) ?? ''
          const qty = Number(r.qty) || 0
          const product = productById.get(r.product_id as string)

          // Rhythm (all time)
          const cd = new Date(createdAt)
          if (!Number.isNaN(cd.getTime())) {
            dayOfWeek[cd.getDay()]++
            // ISO-ish week label: the Monday of that week
            const monday = new Date(cd)
            monday.setDate(cd.getDate() - ((cd.getDay() + 6) % 7))
            const label = shortDate(monday.toISOString())
            weekMap.set(label, (weekMap.get(label) ?? 0) + 1)
          }

          // Team (all time)
          const who = ((r.requested_by_name as string) ?? '').trim() || '—'
          const t = teamMap.get(who) ?? { name: who, count: 0, qty: 0, first: createdAt, last: createdAt }
          t.count++
          t.qty += qty
          if (createdAt < t.first) t.first = createdAt
          if (createdAt > t.last) t.last = createdAt
          teamMap.set(who, t)

          // Demand (all time)
          if (product) {
            const m = moverMap.get(r.product_id as string) ?? {
              name: product.name,
              qty: 0,
              unit: (r.unit as string) === 'case' ? 'case' : 'un',
              count: 0,
            }
            m.qty += qty
            m.count++
            moverMap.set(r.product_id as string, m)

            const vKey = product.vendorId
            const va = vendorAgg.get(vKey) ?? { qty: 0, count: 0 }
            va.qty += qty
            va.count++
            vendorAgg.set(vKey, va)
          }

          // Replenishment window (last 7 days, ordered only)
          if (r.status === 'pending') {
            pendingCount++
          } else {
            const orderedAt = r.ordered_at ? new Date(r.ordered_at as string).getTime() : NaN
            if (Number.isFinite(orderedAt) && orderedAt >= weekStart && product) {
              orderedLines++
              spendEst += qty * product.purchase
              retailEst += qty * product.sale
            }
          }
        }

        // Last 8 week buckets, most recent first
        const weeks: WeekRow[] = [...weekMap.entries()]
          .map(([label, count]) => ({ label, count }))
          .slice(-8)
          .reverse()

        const movers = [...moverMap.values()].sort((a, b) => b.count - a.count).slice(0, 10)
        const team = [...teamMap.values()].sort((a, b) => b.count - a.count)

        // Vendor breakdown (count/volume only — costs live in Price Intelligence)
        const linkCount = new Map<string | null, number>()
        let unlinkedProducts = 0
        for (const p of productById.values()) {
          linkCount.set(p.vendorId, (linkCount.get(p.vendorId) ?? 0) + 1)
          if (!p.vendorId) unlinkedProducts++
        }
        const vendorKeys = new Set<string | null>([...linkCount.keys(), ...vendorAgg.keys()])
        const vendorRows: VendorRow[] = [...vendorKeys]
          .map((key) => ({
            name: key ? vendorNameById.get(key) ?? '—' : 'No vendor linked',
            productsLinked: linkCount.get(key) ?? 0,
            reorderQty: vendorAgg.get(key)?.qty ?? 0,
            reorderCount: vendorAgg.get(key)?.count ?? 0,
          }))
          .sort((a, b) => b.reorderCount - a.reorderCount)

        // Missed sales — customer suggestions staff logged
        const missedSales: MissedSale[] = products
          .filter((p) => p.source === 'client_suggestion')
          .map((p) => ({
            name: (p.name as string) ?? '—',
            note: (p.note as string | null) ?? null,
            by: (p.created_by_name as string) ?? '—',
            date: (p.created_at as string) ?? '',
          }))
          .sort((a, b) => b.date.localeCompare(a.date))

        const storeCreated = storeRow.data?.created_at as string | undefined
        const daysActive = storeCreated
          ? Math.max(1, Math.floor((now - new Date(storeCreated).getTime()) / DAY))
          : null

        if (!cancelled) {
          setData({
            totalProducts: products.length,
            totalRequests: requests.length,
            totalVendors: vendors.length,
            totalMembers: members.length,
            daysActive,
            revThisWeek,
            revPrevWeek,
            days,
            spendEst,
            retailEst,
            orderedLines,
            pendingCount,
            weeks,
            dayOfWeek,
            movers,
            team,
            vendorRows,
            unlinkedProducts,
            missedSales,
          })
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

  // ---- Price Intelligence (Software-only data) ----------------------------
  const priceIntel = useMemo(() => {
    const rows: Array<{
      product: string
      bestVendor: string
      bestCost: number
      worstCost: number
      savePct: number
    }> = []
    let comparable = 0
    let singleSource = 0
    for (const p of swState.products) {
      const prices = getVendorPricesForProduct(swState, p.id).filter((vp) => vp.effectiveUnitCost > 0)
      if (prices.length === 0) continue
      if (prices.length === 1) {
        singleSource++
        continue
      }
      comparable++
      const sorted = [...prices].sort((a, b) => a.effectiveUnitCost - b.effectiveUnitCost)
      const best = sorted[0]
      const worst = sorted[sorted.length - 1]
      if (worst.effectiveUnitCost <= best.effectiveUnitCost) continue
      rows.push({
        product: p.name,
        bestVendor: best.vendor?.name ?? '—',
        bestCost: best.effectiveUnitCost,
        worstCost: worst.effectiveUnitCost,
        savePct: ((worst.effectiveUnitCost - best.effectiveUnitCost) / worst.effectiveUnitCost) * 100,
      })
    }
    rows.sort((a, b) => b.savePct - a.savePct)
    return { rows: rows.slice(0, 10), comparable, singleSource }
  }, [swState])

  if (loading) {
    return <p className="text-sm text-muted py-12 text-center">Building your report…</p>
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
  const maxDow = Math.max(1, ...data.dayOfWeek)
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.count))

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-secondary">
        Live from your store&apos;s data. The App runs your floor — this page shows what it all
        means.
      </p>

      {/* ---- 1. Account snapshot ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="Products" value={String(data.totalProducts)} />
        <SummaryCard label="Reorder requests" value={String(data.totalRequests)} />
        <SummaryCard label="Vendors" value={String(data.totalVendors)} />
        <SummaryCard label="Team members" value={String(data.totalMembers)} />
        <SummaryCard
          label="Days active"
          value={data.daysActive != null ? String(data.daysActive) : '—'}
        />
      </div>

      {/* ---- 2. Week in money ---- */}
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
          hint={data.pendingCount > 0 ? `${data.pendingCount} item(s) pending order` : 'All caught up'}
        />
      </div>

      {/* ---- 7. Vendor Price Intelligence ---- */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-fg mb-1">Vendor price intelligence</h2>
        <p className="text-xs text-fg-secondary mb-4">
          Cheapest vendor per product from your price lists ({priceIntel.comparable} product(s)
          comparable across 2+ vendors · {priceIntel.singleSource} single-source).
        </p>
        {priceIntel.rows.length === 0 ? (
          <p className="text-sm text-muted">
            Import at least two vendors&apos; price lists (Vendors → bulk import) and the savings
            table appears here automatically.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium">Best vendor</th>
                <th className="pb-2 font-medium text-right">Best cost</th>
                <th className="pb-2 font-medium text-right">Worst cost</th>
                <th className="pb-2 font-medium text-right">You save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {priceIntel.rows.map((r) => (
                <tr key={r.product}>
                  <td className="py-2.5 text-fg">{r.product}</td>
                  <td className="py-2.5 text-fg">{r.bestVendor}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{money(r.bestCost)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{money(r.worstCost)}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-success">
                    {r.savePct.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- 3. Reorder rhythm ---- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-fg mb-4">Requests per week</h2>
          {data.weeks.length === 0 ? (
            <p className="text-sm text-muted">No requests yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.weeks.map((w) => (
                <li key={w.label} className="flex items-center gap-3">
                  <span className="w-14 text-xs text-fg-secondary shrink-0">{w.label}</span>
                  <div className="flex-1 h-3 rounded-full bg-surface-hover overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(w.count / maxWeek) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-fg">{w.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-fg mb-1">Busiest days</h2>
          <p className="text-xs text-fg-secondary mb-4">
            When your team reorders — plan vendor deliveries around the peaks.
          </p>
          <ul className="space-y-2">
            {DOW_LABELS.map((label, i) => (
              <li key={label} className="flex items-center gap-3">
                <span className="w-10 text-xs text-fg-secondary shrink-0">{label}</span>
                <div className="flex-1 h-3 rounded-full bg-surface-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(data.dayOfWeek[i] / maxDow) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs tabular-nums text-fg">
                  {data.dayOfWeek[i]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---- 4. Demand + team ---- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-fg mb-4">Top reordered products</h2>
          {data.movers.length === 0 ? (
            <p className="text-sm text-muted">No requests yet.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {data.movers.map((m, i) => (
                <li key={m.name} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 text-xs font-bold text-fg-secondary">{i + 1}</span>
                  <span className="flex-1 text-sm text-fg truncate">{m.name}</span>
                  <span className="text-xs text-fg-secondary tabular-nums">
                    {m.count}× · {m.qty} {m.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-fg mb-1">Team engagement</h2>
          <p className="text-xs text-fg-secondary mb-4">Reorder requests logged per person.</p>
          {data.team.length === 0 ? (
            <p className="text-sm text-muted">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {data.team.map((t) => (
                <li key={t.name} className="py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-fg">{t.name}</span>
                    <span className="text-xs tabular-nums text-fg">
                      {t.count} request(s) · {t.qty} items
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    Active {shortDate(t.first)} → {shortDate(t.last)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- 5. Vendor breakdown ---- */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-fg mb-1">Vendor breakdown</h2>
        <p className="text-xs text-fg-secondary mb-4">
          Where your reorders go. Watch concentration risk — and the &ldquo;No vendor linked&rdquo;
          bucket is catalog cleanup waiting to happen
          {data.unlinkedProducts > 0 ? ` (${data.unlinkedProducts} product(s) unlinked)` : ''}.
        </p>
        {data.vendorRows.length === 0 ? (
          <p className="text-sm text-muted">No vendors yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase">
                <th className="pb-2 font-medium">Vendor</th>
                <th className="pb-2 font-medium text-right">Products linked</th>
                <th className="pb-2 font-medium text-right">Reorder lines</th>
                <th className="pb-2 font-medium text-right">Units requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.vendorRows.map((v) => (
                <tr key={v.name}>
                  <td className="py-2.5 text-fg">{v.name}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{v.productsLinked}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{v.reorderCount}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{v.reorderQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- 6. Missed sales ---- */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-fg mb-1">
          Customer requests you didn&apos;t stock
        </h2>
        <p className="text-xs text-fg-secondary mb-4">
          Products your team logged as customer suggestions — demand you&apos;re not capturing yet.
        </p>
        {data.missedSales.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing logged. Staff can register customer requests from the App&apos;s scan screen.
          </p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {data.missedSales.map((m, i) => (
              <li key={`${m.name}-${i}`} className="py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-fg">{m.name}</span>
                  <span className="text-xs text-muted">{shortDate(m.date)}</span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Logged by {m.by}
                  {m.note ? ` — “${m.note}”` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Daily closings detail ---- */}
      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-fg mb-4">Daily closings</h2>
        {data.days.length === 0 ? (
          <p className="text-sm text-muted">
            No closings this week. In the App&apos;s home screen, type &ldquo;Fechamento do
            dia&rdquo; each evening — it takes 10 seconds and turns revenue tracking on.
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

      <p className="text-xs text-muted">
        Purchase/retail figures are estimates from order quantities × product prices. Exact
        per-product sales arrive with the POS upload (planned).
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
