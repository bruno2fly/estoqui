import type { VendorPriceUpload } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'

export const initialVendorPriceUploadsState = {
  vendorPriceUploads: [] as VendorPriceUpload[],
}

export function getVendorPriceUploadsActions(set: StateSetter, _get: StateGetter) {
  return {
    addVendorPriceUpload: (upload: Omit<VendorPriceUpload, 'id'>) => {
      const u: VendorPriceUpload = { ...upload, id: generateId() }
      set((s) => ({ vendorPriceUploads: [u, ...s.vendorPriceUploads].slice(0, 100) }))
      return u.id
    },
    getVendorUploads: (vendorId: string) => {
      return _get().vendorPriceUploads.filter((u) => u.vendorId === vendorId)
    },
    getLatestUpload: (vendorId: string) => {
      return _get().vendorPriceUploads.find((u) => u.vendorId === vendorId) ?? null
    },
  }
}
