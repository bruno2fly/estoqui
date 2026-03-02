import type { PersistedState } from '@/types'

const MAX_SNAPSHOTS = 5

/**
 * Ensures data integrity after rehydration:
 * - Remove match cache entries pointing to deleted products
 * - Remove vendorPrices for deleted vendors or products
 * - Clean reorderDraft.lines to only reference existing products
 * - Trim old stock snapshots to prevent localStorage bloat
 */
export function sanitizeState(state: PersistedState): PersistedState {
  const productIds = new Set(state.products.map((p) => p.id))
  const vendorIds = new Set(state.vendors.map((v) => v.id))

  const matches = { ...state.matches }
  for (const key of Object.keys(matches)) {
    if (!productIds.has(matches[key])) {
      delete matches[key]
    }
  }

  const vendorPrices = state.vendorPrices.filter(
    (vp) => vendorIds.has(vp.vendorId) && productIds.has(vp.productId)
  )

  const reorderDraft = {
    ...state.reorderDraft,
    lines: (state.reorderDraft?.lines ?? []).filter((l) => productIds.has(l.productId)),
  }

  const vendorPriceUploads = (state.vendorPriceUploads ?? []).filter(
    (u) => vendorIds.has(u.vendorId)
  )

  const stockSnapshots = (state.stockSnapshots ?? []).slice(-MAX_SNAPSHOTS)

  return {
    ...state,
    matches,
    vendorPrices,
    vendorPriceUploads,
    reorderDraft,
    stockSnapshots,
  }
}
