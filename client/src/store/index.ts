import { create } from 'zustand'
import type { PersistedState } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { initialVendorsState, getVendorsActions } from './slices/vendorsSlice'
import { initialProductsState, getProductsActions } from './slices/productsSlice'
import { initialVendorPricesState, getVendorPricesActions } from './slices/vendorPricesSlice'
import { initialStockSnapshotsState, getStockSnapshotsActions } from './slices/stockSnapshotsSlice'
import { initialReorderDraftState, getReorderDraftActions } from './slices/reorderDraftSlice'
import { initialOrdersState, getOrdersActions } from './slices/ordersSlice'
import { initialActivityState, getActivityActions } from './slices/activitySlice'
import { initialSettingsState, getSettingsActions } from './slices/settingsSlice'
import { initialMatchesState, getMatchesActions } from './slices/matchesSlice'
import { initialVendorPriceUploadsState, getVendorPriceUploadsActions } from './slices/vendorPriceUploadsSlice'
import { getInventoryActions } from './actions/inventoryActions'
import { registerMainStore } from './slices/authSlice'

type StoreState = PersistedState &
  ReturnType<typeof getVendorsActions> &
  ReturnType<typeof getProductsActions> &
  ReturnType<typeof getVendorPricesActions> &
  ReturnType<typeof getVendorPriceUploadsActions> &
  ReturnType<typeof getStockSnapshotsActions> &
  ReturnType<typeof getReorderDraftActions> &
  ReturnType<typeof getOrdersActions> &
  ReturnType<typeof getActivityActions> &
  ReturnType<typeof getSettingsActions> &
  ReturnType<typeof getMatchesActions> &
  ReturnType<typeof getInventoryActions> & {
    hydrateFromSupabase: (data: PersistedState) => void
    clearStore: () => void
  }

const initialState: PersistedState = {
  ...initialVendorsState,
  ...initialProductsState,
  ...initialVendorPricesState,
  ...initialStockSnapshotsState,
  ...initialReorderDraftState,
  ...initialOrdersState,
  ...initialActivityState,
  ...initialSettingsState,
  ...initialMatchesState,
  ...initialVendorPriceUploadsState,
}

export const useStore = create<StoreState>()((set, get) => ({
  ...initialState,
  ...getVendorsActions(set, get),
  ...getProductsActions(set, get),
  ...getVendorPricesActions(set, get),
  ...getStockSnapshotsActions(set, get),
  ...getReorderDraftActions(set, get),
  ...getOrdersActions(set, get),
  ...getActivityActions(set, get),
  ...getSettingsActions(set, get),
  ...getMatchesActions(set, get),
  ...getVendorPriceUploadsActions(set, get),
  ...getInventoryActions(set, get),

  /** Populate store with data fetched from Supabase after login */
  hydrateFromSupabase: (data: PersistedState) => {
    set({
      vendors: data.vendors,
      products: data.products,
      vendorPrices: data.vendorPrices,
      vendorPriceUploads: data.vendorPriceUploads,
      stockSnapshots: data.stockSnapshots,
      matches: data.matches,
      reorderDraft: data.reorderDraft,
      orders: data.orders,
      activity: data.activity,
      settings: data.settings,
    })
  },

  /** Clear store on logout */
  clearStore: () => {
    set({ ...initialState })
  },
}))

// Register main store so authSlice can hydrate/clear without circular imports
registerMainStore(() => ({
  hydrateFromSupabase: useStore.getState().hydrateFromSupabase,
  clearStore: useStore.getState().clearStore,
}))

// Re-export for components
export { DEFAULT_SETTINGS }
export { clearAllData } from '@/shared/lib/storage'
