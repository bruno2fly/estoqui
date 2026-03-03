import type { PersistedState } from '@/types'
import { parsePackFromText, computeUnitCost } from '@/lib/pack/parsePack'

const MAX_SNAPSHOTS = 5

/**
 * Ensures data integrity after rehydration:
 * - Remove match cache entries pointing to deleted products
 * - Remove vendorPrices for deleted vendors or products
 * - Migrate vendorPrices missing pack fields (parseVersion)
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

  // Filter orphaned vendor prices + migrate missing pack fields
  const vendorPrices = state.vendorPrices
    .filter((vp) => vendorIds.has(vp.vendorId) && productIds.has(vp.productId))
    .map((vp) => {
      // Already migrated — skip
      if (vp.parseVersion !== undefined && vp.parseVersion >= 1) return vp

      // Infer pack info from associated product name
      const product = state.products.find((p) => p.id === vp.productId)
      const text = product
        ? [product.name, product.unitSize ?? ''].filter(Boolean).join(' ')
        : ''
      const pack = parsePackFromText(text)
      const uc = computeUnitCost(
        vp.unitPrice,
        pack.packType,
        pack.unitsPerCase,
        pack.priceBasis
      )

      return {
        ...vp,
        packType: vp.packType ?? pack.packType,
        unitsPerCase: vp.unitsPerCase ?? pack.unitsPerCase,
        unitDescriptor: vp.unitDescriptor ?? pack.unitDescriptor,
        priceBasis: vp.priceBasis ?? pack.priceBasis,
        unitCost: vp.unitCost ?? uc,
        parseVersion: 1,
      }
    })

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
