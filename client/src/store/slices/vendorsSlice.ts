import type { Vendor } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'
import { supabase } from '@/lib/supabase'
import { upsertVendor, deleteVendor as dbDeleteVendor } from '@/lib/supabase/vendors'

export const initialVendorsState = {
  vendors: [] as Vendor[],
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? ''
}

export function getVendorsActions(set: StateSetter, _get: StateGetter) {
  return {
    addVendor: (vendor: Omit<Vendor, 'id'>) => {
      const v: Vendor = { ...vendor, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      set((s) => ({ vendors: [...s.vendors, v] }))
      getUid().then(uid => { if (uid) upsertVendor(v, uid).catch((e) => console.error('[vendorsSlice] upsertVendor failed:', e)) })
      return v.id
    },
    updateVendor: (id: string, updates: Partial<Omit<Vendor, 'id'>>) => {
      set((s) => ({
        vendors: s.vendors.map((v) => (v.id === id ? { ...v, ...updates } : v)),
      }))
      getUid().then(uid => {
        if (!uid) return
        const vendor = _get().vendors.find(v => v.id === id)
        if (vendor) upsertVendor(vendor, uid).catch((e) => console.error('[vendorsSlice] upsertVendor (update) failed:', e))
      })
    },
    deleteVendor: (id: string) => {
      set((s) => ({
        vendors: s.vendors.filter((v) => v.id !== id),
        vendorPrices: s.vendorPrices.filter((vp) => vp.vendorId !== id),
        reorderDraft: {
          ...s.reorderDraft,
          lines: s.reorderDraft.lines.map((l) =>
            l.chosenVendorId === id ? { ...l, chosenVendorId: null, unitPrice: 0, priceUpdatedAt: null } : l
          ),
        },
      }))
      dbDeleteVendor(id).catch((e) => console.error('[vendorsSlice] deleteVendor failed:', e))
    },
  }
}
