import type { PersistedState } from '@/types'
import type { VendorPrice } from '@/types'

export interface VendorPriceWithVendor extends VendorPrice {
  vendor: { id: string; name: string } | undefined
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
  pricesToUse.sort((a, b) => a.unitPrice - b.unitPrice)
  return pricesToUse[0]
}
