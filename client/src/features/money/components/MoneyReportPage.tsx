import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '@/store'
import { getVendorPricesForProduct } from '@/store/selectors/vendorPrices'
import { stripPackFromName } from '@/lib/pack/parsePack'
import type { Product } from '@/types'

// ---------------------------------------------------------------------------
// Money Report — the page that answers one question in plain words:
// "Where is my money?"  Three answers:
//   1. Buy cheaper   — another vendor sells the same item for less
//   2. Fix a price   — you're selling with too little margin
//   3. Wake up stock — cash frozen in products that aren't moving
//
// Written for owners, not analysts: every row is a sentence with a dollar
// number, and every section says what to do next.
// ---------------------------------------------------------------------------

const LOW_MARGIN = 0.25 // below this we flag the price
const TARGET_MARGIN = 0.35 // suggested prices aim here

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** Suggested shelf price for the target margin, rounded up to a .x9 ending. */
function suggestPrice(unitCost: number): number {
  const raw = unitCost / (1 - TARGET_MARGIN)
  const rounded = Math.ceil(raw * 10) / 10 - 0.01
  return rounded > raw ? rounded : rounded + 0.1
}

interface CheaperRow {
  product: Product
  bestVendor: string
  bestUnit: number
  otherVendor: string
  otherUnit: number
  refillQty: number
  savePerUnit: number
  saveOnRestock: number
}

interface MarginRow {
  product: Product
  unitCost: number
  salePrice: number
  margin: number
  suggested: number
}

interface FrozenRow {
  product: Product
  qty: number
  value: number
}

export function MoneyReportPage() {
  const state = useStore((s) => s)
  const products = state.products

  const { cheaper, cheaperTotal } = useMemo(() => {
    const rows: CheaperRow[] = []
    for (const product of products) {
      const prices = getVendorPricesForProduct(state, product.id).filter(
        (p) => p.effectiveUnitCost > 0
      )
      if (prices.length < 2) continue
      const sorted = [...prices].sort((a, b) => a.effectiveUnitCost - b.effectiveUnitCost)
      const best = sorted[0]
      const other = sorted[sorted.length - 1] // the most expensive option they might be paying
      const savePerUnit = other.effectiveUnitCost - best.effectiveUnitCost
      if (savePerUnit < 0.01) continue
      const stock = product.stockQty ?? 0
      const refillQty = Math.max((product.minStock ?? 10) - stock, 0)
      rows.push({
        product,
        bestVendor: best.vendor?.name ?? 'Best vendor',
        bestUnit: best.effectiveUnitCost,
        otherVendor: other.vendor?.name ?? 'other vendor',
        otherUnit: other.effectiveUnitCost,
        refillQty,
        savePerUnit,
        saveOnRestock: savePerUnit * refillQty,
      })
    }
    rows.sort((a, b) => b.saveOnRestock - a.saveOnRestock || b.savePerUnit - a.savePerUnit)
    const cheaperTotal = rows.reduce((sum, r) => sum + r.saveOnRestock, 0)
    return { cheaper: rows, cheaperTotal }
  }, [products, state])

  const margins = useMemo(() => {
    const rows: MarginRow[] = []
    for (const product of products) {
      const salePrice = product.unitPrice
      if (!salePrice || salePrice <= 0) continue
      // Cheapest CURRENT vendor cost wins; fall back to the product's own cost.
      const prices = getVendorPricesForProduct(state, product.id).filter(
        (p) => p.effectiveUnitCost > 0
      )
      const vendorCost = prices.length
        ? Math.min(...prices.map((p) => p.effectiveUnitCost))
        : undefined
      const unitCost = vendorCost ?? product.unitCost
      if (!unitCost || unitCost <= 0) continue
      const margin = (salePrice - unitCost) / salePrice
      if (margin >= LOW_MARGIN) continue
      rows.push({ product, unitCost, salePrice, margin, suggested: suggestPrice(unitCost) })
    }
    rows.sort((a, b) => a.margin - b.margin)
    return rows
  }, [products, state])

  const { frozen, frozenTotal, hasTwoSnapshots } = useMemo(() => {
    const snaps = state.stockSnapshots
    if (!snaps || snaps.length < 2) {
      return { frozen: [] as FrozenRow[], frozenTotal: 0, hasTwoSnapshots: false }
    }
    const latest = snaps[0]
    const previous = snaps[1]
    const prevQty = new Map<string, number>()
    for (const row of previous.rows) {
      if (row.matchedProductId) prevQty.set(row.matchedProductId, row.stockQty)
    }
    const rows: FrozenRow[] = []
    for (const row of latest.rows) {
      const id = row.matchedProductId
      if (!id) continue
      const before = prevQty.get(id)
      if (before === undefined) continue
      if (row.stockQty <= 0 || row.stockQty !== before) continue
      const product = products.find((p) => p.id === id)
      if (!product) continue
      const cost = product.unitCost ?? row.unitCost ?? 0
      if (cost <= 0) continue
      rows.push({ product, qty: row.stockQty, value: row.stockQty * cost })
    }
    rows.sort((a, b) => b.value - a.value)
    const frozenTotal = rows.reduce((sum, r) => sum + r.value, 0)
    return { frozen: rows, frozenTotal, hasTwoSnapshots: true }
  }, [products, state.stockSnapshots])

  const name = (p: Product) => stripPackFromName(p.name) || p.name

  return (
    <div className="space-y-6">
      {/* ---- Headline tiles ---- */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile
          tone="success"
          label="You can save on your next restock"
          value={usd(cheaperTotal)}
          hint={cheaper.length > 0 ? `${cheaper.length} products have a cheaper vendor` : 'No cheaper vendor found right now'}
        />
        <Tile
          tone={margins.length > 0 ? 'warning' : 'success'}
          label="Prices making too little money"
          value={String(margins.length)}
          hint={margins.length > 0 ? 'Products selling below a healthy margin' : 'All your margins look healthy'}
        />
        <Tile
          tone={frozen.length > 0 ? 'danger' : 'success'}
          label="Money sitting on the shelf"
          value={hasTwoSnapshots ? usd(frozenTotal) : '—'}
          hint={
            hasTwoSnapshots
              ? `${frozen.length} products didn't move since your last report`
              : 'Upload next week’s POS report to unlock'
          }
        />
      </div>

      {/* ---- 1. Buy cheaper ---- */}
      <Section
        title="Buy cheaper"
        subtitle="Another vendor sells the same product for less. Use them on your next order."
        action={
          <Link
            to="/inventory"
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition"
          >
            Build my order
          </Link>
        }
      >
        {cheaper.length === 0 ? (
          <Empty text="Nothing here yet. Upload price lists from at least two vendors and I'll compare every product for you." />
        ) : (
          <ul className="divide-y divide-surface-border">
            {cheaper.slice(0, 15).map((r) => (
              <li key={r.product.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="flex-1 min-w-[180px] text-sm font-medium text-fg truncate">{name(r.product)}</span>
                <span className="text-[13px] text-fg-secondary">
                  <span className="font-semibold text-success">{usd(r.bestUnit)}/ea</span> at {r.bestVendor}
                  {' '}instead of {usd(r.otherUnit)}/ea at {r.otherVendor}
                </span>
                <span className="ml-auto text-sm font-semibold text-success tabular-nums whitespace-nowrap">
                  {r.saveOnRestock >= 0.01
                    ? `save ${usd(r.saveOnRestock)} restocking ${r.refillQty}`
                    : `save ${usd(r.savePerUnit)}/ea`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---- 2. Fix a price ---- */}
      <Section
        title="Fix a price"
        subtitle={`These products make less than ${Math.round(LOW_MARGIN * 100)}% — the suggested price brings them to a healthy ${Math.round(TARGET_MARGIN * 100)}%.`}
      >
        {margins.length === 0 ? (
          <Empty text="All good — no products selling below a healthy margin." />
        ) : (
          <ul className="divide-y divide-surface-border">
            {margins.slice(0, 15).map((r) => (
              <li key={r.product.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="flex-1 min-w-[180px] text-sm font-medium text-fg truncate">{name(r.product)}</span>
                <span className="text-[13px] text-fg-secondary">
                  costs {usd(r.unitCost)} · sells for {usd(r.salePrice)} ·{' '}
                  <span className={`font-semibold ${r.margin < 0 ? 'text-danger' : 'text-warning'}`}>
                    {Math.round(r.margin * 100)}% margin
                  </span>
                </span>
                <span className="ml-auto text-sm font-semibold text-fg tabular-nums whitespace-nowrap">
                  suggested: <span className="text-primary">{usd(r.suggested)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---- 3. Wake up stock ---- */}
      <Section
        title="Money sitting on the shelf"
        subtitle="Products with stock that didn't sell a single unit between your last two POS reports. Promote them, move them, or stop reordering them."
      >
        {!hasTwoSnapshots ? (
          <Empty text="This unlocks with your second POS report — upload one each week and I'll show you exactly which products are frozen cash." />
        ) : frozen.length === 0 ? (
          <Empty text="Everything moved since your last report. Nice." />
        ) : (
          <ul className="divide-y divide-surface-border">
            {frozen.slice(0, 15).map((r) => (
              <li key={r.product.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="flex-1 min-w-[180px] text-sm font-medium text-fg truncate">{name(r.product)}</span>
                <span className="text-[13px] text-fg-secondary">{r.qty} in stock · zero sold</span>
                <span className="ml-auto text-sm font-semibold text-danger tabular-nums whitespace-nowrap">
                  {usd(r.value)} frozen
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-[12px] text-muted px-1">
        How this is calculated: vendor prices are always compared per unit (case packs are
        divided automatically). &quot;Save on restock&quot; = the price difference × how many
        units you need to get back to your minimum stock.
      </p>
    </div>
  )
}

/* ---------- little building blocks ---------- */

function Tile({
  tone,
  label,
  value,
  hint,
}: {
  tone: 'success' | 'warning' | 'danger'
  label: string
  value: string
  hint: string
}) {
  const toneText = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tone]
  return (
    <div className="bg-surface border border-surface-border rounded-2xl p-5 shadow-sm">
      <p className="text-[12px] font-medium text-fg-secondary">{label}</p>
      <p className={`mt-2 text-[28px] font-bold leading-none tabular-nums ${toneText}`}>{value}</p>
      <p className="mt-2 text-[12px] text-muted">{hint}</p>
    </div>
  )
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="bg-surface border border-surface-border rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <p className="text-xs text-fg-secondary">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 pb-5 pt-1 text-sm text-muted">{text}</p>
}
