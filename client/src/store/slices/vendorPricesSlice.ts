import type { VendorPrice } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { supabase } from '@/lib/supabase'
import { upsertVendorPrice, deleteVendorPrice as dbDeleteVendorPrice } from '@/lib/supabase/vendorPrices'

export const initialVendorPricesState = {
  vendorPrices: [] as VendorPrice[],
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? ''
}

export function getVendorPricesActions(set: StateSetter, _get: StateGetter) {
  return {
    setVendorPrice: (vp: VendorPrice) => {
      const withTimestamp = { ...vp, updatedAt: vp.updatedAt || new Date().toISOString() }
      set((s) => {
        const rest = s.vendorPrices.filter(
          (p) => !(p.vendorId === vp.vendorId && p.productId === vp.productId)
        )
        return { vendorPrices: [...rest, withTimestamp] }
      })
      getUid().then(uid => { if (uid) upsertVendorPrice(withTimestamp, uid).catch(console.error) })
    },
    removeVendorPrice: (vendorId: string, productId: string) => {
      set((s) => ({
        vendorPrices: s.vendorPrices.filter(
          (p) => !(p.vendorId === vendorId && p.productId === productId)
        ),
      }))
      dbDeleteVendorPrice(vendorId, productId).catch(console.error)
    },
    setVendorPrices: (prices: VendorPrice[]) => {
      set(() => ({ vendorPrices: prices }))
    },
  }
}
