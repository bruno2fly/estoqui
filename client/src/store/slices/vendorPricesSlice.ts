import type { VendorPrice } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { supabase } from '@/lib/supabase'
import { upsertVendorPrice, deleteVendorPrice as dbDeleteVendorPrice, upsertVendorPrices, deleteAllVendorPrices as dbDeleteAllVendorPrices } from '@/lib/supabase/vendorPrices'
import { emitSupabaseError } from '@/lib/supabase/errorEmitter'

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
      getUid().then(uid => { if (uid) upsertVendorPrice(withTimestamp, uid).catch((e) => emitSupabaseError('Save price', e)) })
    },
    removeVendorPrice: (vendorId: string, productId: string) => {
      set((s) => ({
        vendorPrices: s.vendorPrices.filter(
          (p) => !(p.vendorId === vendorId && p.productId === productId)
        ),
      }))
      dbDeleteVendorPrice(vendorId, productId).catch((e) => emitSupabaseError('Delete price', e))
    },
        setVendorPricesBatch: (prices: VendorPrice[]) => {
      set((s) => {
        const rest = s.vendorPrices.filter(
          (p) => !prices.some((np) => np.vendorId === p.vendorId && np.productId === p.productId)
        )
        return { vendorPrices: [...rest, ...prices] }
      })
      getUid().then(uid => { if (uid) upsertVendorPrices(prices, uid).catch((e) => emitSupabaseError('Save prices batch', e)) })
    },
    setVendorPrices: (prices: VendorPrice[]) => {
      set(() => ({ vendorPrices: prices }))
    },
    /** Remove all prices for a vendor from state + DB (weekly full replacement). */
    clearVendorPrices: (vendorId: string) => {
      set((s) => ({
        vendorPrices: s.vendorPrices.filter((p) => p.vendorId !== vendorId),
      }))
      dbDeleteAllVendorPrices(vendorId).catch((e) => emitSupabaseError('Clear vendor prices', e))
    },
  }
}
