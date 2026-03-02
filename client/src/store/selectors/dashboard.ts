import type { PersistedState } from '@/types'
import { getStockStatus, isLowOrCritical } from '@/lib/inventory/status'

/**
 * Low stock count: products where status is LOW or CRITICAL.
 * Products without stockQty (NO_DATA) are NOT counted as low stock.
 */
export function getLowStockCount(state: PersistedState): number {
  return state.products.filter((p) => {
    const status = getStockStatus(p.stockQty, p.minStock ?? 10)
    return isLowOrCritical(status)
  }).length
}
