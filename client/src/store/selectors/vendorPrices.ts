import type { PersistedState } from '@/types'
import type { VendorPrice } from '@/types'
import { computeUnitCost } from '@/lib/pack/parsePack'

export interface VendorPriceWithVendor extends VendorPrice {
  vendor: { id: string; name: string } | undefined
  effectiveUnitCost: number
}

/** Get effective unit cost for a vendor price, handling case-pack pricing. */
function getEffectiveUnitCost(vp: VendorPrice): number {
  if (vp.unitCost !== undefined && vp.unitCost > 0) return vp.unitCost
  return computeUnitCost(
    vp.unitPrice,
    vp.packType ?? 'UNIT',
    vp.unitsPerCase ?? 1,
    vp.priceBasis ?? 'PER_UNIT'
  )
}

export function getVendorPricesForProduct(
  state: PersistedState,
  productId: string
): VendorPriceWithVendor[] {
  return state.vendorPrices
    .filter((vp) => vp.productId === productId)
    .map((vp) => ({
      ...vp,
      vendor: state.vendors.find((v) => v.id === vp.vendorId),
      effectiveUnitCost: getEffectiveUnitCost(vp),
    }))
}

export function computeBestVendor(
  state: PersistedState,
  productId: string
): VendorPriceWithVendor | null {
  const prices = getVendorPricesForProduct(state, productId)
  if (prices.length === 0) return null

  const threshold = state.settings?.stalenessThreshold ?? 45
  const freshPrices = prices.filter((p) => {
    const days =
      (Date.now() - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    return days <= threshold
  })

  const pricesToUse = freshPrices.length > 0 ? freshPrices : prices
  // Sort by effective unit cost (handles case vs unit comparison)
  pricesToUse.sort((a, b) => a.effectiveUnitCost - b.effectiveUnitCost)
  return pricesToUse[0]
}
