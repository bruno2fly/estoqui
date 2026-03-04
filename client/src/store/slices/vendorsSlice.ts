import type { Vendor } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'
import { supabase } from '@/lib/supabase'
import { upsertVendor, deleteVendor as dbDeleteVendor } from '@/lib/supabase/vendors'
import { emitSupabaseError } from '@/lib/supabase/errorEmitter'

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
      getUid().then(uid => { if (uid) upsertVendor(v, uid).catch((e) => emitSupabaseError('Save vendor', e)) })
      return v.id
    },
    updateVendor: (id: string, updates: Partial<Omit<Vendor, 'id'>>) => {
      set((s) => ({
        vendors: s.vendors.map((v) => (v.id === id ? { ...v, ...updates } : v)),
      }))
      getUid().then(uid => {
        if (!uid) return
        const vendor = _get().vendors.find(v => v.id === id)
        if (vendor) upsertVendor(vendor, uid).catch((e) => emitSupabaseError('Update vendor', e))
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
      dbDeleteVendor(id).catch((e) => emitSupabaseError('Delete vendor', e))
    },
  }
}
