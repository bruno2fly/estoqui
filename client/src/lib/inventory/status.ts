/**
 * Single source of truth for stock status and price freshness.
 *
 * All UI components (catalog table, summary cards, dashboard, filters)
 * must use these functions — never inline the thresholds.
 */

/* ── Stock Status ────────────────────────────────────────────────────────── */

export type StockStatus = 'OK' | 'LOW' | 'CRITICAL' | 'NO_DATA'

/**
 * Determine stock status for a product.
 *
 * @param stockQty  Current stock quantity (undefined = no POS data imported yet)
 * @param minStock  Minimum stock threshold (defaults to 10)
 */
export function getStockStatus(
  stockQty: number | undefined,
  minStock: number
): StockStatus {
  if (stockQty === undefined || stockQty === null) return 'NO_DATA'
  if (isNaN(stockQty)) return 'NO_DATA'
  if (stockQty <= 0) return 'CRITICAL'
  if (stockQty < minStock) return 'LOW'
  return 'OK'
}

export function isLowOrCritical(status: StockStatus): boolean {
  return status === 'LOW' || status === 'CRITICAL'
}

/* ── Price Freshness ─────────────────────────────────────────────────────── */

export type PriceStatus = 'FRESH' | 'STALE' | 'OLD' | 'UNKNOWN'

/**
 * Determine price freshness from the vendor price's updatedAt timestamp.
 *
 * @param updatedAt  ISO date string of the last price update, or undefined
 */
export function getPriceStatus(updatedAt: string | undefined | null): PriceStatus {
  if (!updatedAt) return 'UNKNOWN'
  const ageDays = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (isNaN(ageDays) || ageDays < 0) return 'UNKNOWN'
  if (ageDays <= 7) return 'FRESH'
  if (ageDays <= 30) return 'STALE'
  return 'OLD'
}

/* ── Margin ──────────────────────────────────────────────────────────────── */

/**
 * Compute margin percentage.
 * Returns null if either price is missing or sale price is zero.
 */
export function computeMargin(
  unitCost: number | undefined,
  unitPrice: number | undefined
): number | null {
  if (unitCost == null || unitPrice == null) return null
  if (unitPrice <= 0) return null
  return ((unitPrice - unitCost) / unitPrice) * 100
}
