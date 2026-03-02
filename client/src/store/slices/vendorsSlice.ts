import type { Vendor } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'

export const initialVendorsState = {
  vendors: [] as Vendor[],
}

export function getVendorsActions(set: StateSetter, _get: StateGetter) {
  return {
    addVendor: (vendor: Omit<Vendor, 'id'>) => {
      const v: Vendor = { ...vendor, id: generateId() }
      set((s) => ({ vendors: [...s.vendors, v] }))
      return v.id
    },
    updateVendor: (id: string, updates: Partial<Omit<Vendor, 'id'>>) => {
      set((s) => ({
        vendors: s.vendors.map((v) => (v.id === id ? { ...v, ...updates } : v)),
      }))
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
    },
  }
}
