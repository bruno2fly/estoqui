import type { VendorPrice } from '@/types'
import type { StateSetter, StateGetter } from '../types'

export const initialVendorPricesState = {
  vendorPrices: [] as VendorPrice[],
}

export function getVendorPricesActions(set: StateSetter, _get: StateGetter) {
  return {
    setVendorPrice: (vp: VendorPrice) => {
      set((s) => {
        const rest = s.vendorPrices.filter(
          (p) => !(p.vendorId === vp.vendorId && p.productId === vp.productId)
        )
        return { vendorPrices: [...rest, { ...vp, updatedAt: vp.updatedAt || new Date().toISOString() }] }
      })
    },
    removeVendorPrice: (vendorId: string, productId: string) => {
      set((s) => ({
        vendorPrices: s.vendorPrices.filter(
          (p) => !(p.vendorId === vendorId && p.productId === productId)
        ),
      }))
    },
    setVendorPrices: (prices: VendorPrice[]) => {
      set(() => ({ vendorPrices: prices }))
    },
  }
}
