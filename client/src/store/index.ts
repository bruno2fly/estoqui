import { create } from 'zustand'
import { persist, type StorageValue } from 'zustand/middleware'
import type { PersistedState } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { sanitizeState } from './middleware/sanitize'
import {
  getInventory,
  saveInventory,
  getVendors,
  saveVendors,
  getVendorPrices,
  saveVendorPrices,
  getVendorPriceUploads,
  saveVendorPriceUploads,
  getStockSnapshots,
  saveStockSnapshots,
  getMatches,
  saveMatches,
  getReorderDraft,
  saveReorderDraft,
  getOrders,
  saveOrders,
  getActivity,
  saveActivity,
  getSettings,
  saveSettings,
  clearAllData,
} from '@/shared/lib/storage'
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

const LEGACY_STORAGE_KEY = 'estoquiState'

/** Migrate from legacy single-key storage to versioned keys. */
function migrateFromLegacy(): void {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (raw == null) return
  try {
    const parsed = JSON.parse(raw) as StorageValue<PersistedState>
    const state = parsed?.state
    if (!state) return
    saveInventory(state.products ?? [])
    saveVendors(state.vendors ?? [])
    saveVendorPrices(state.vendorPrices ?? [])
    saveVendorPriceUploads(state.vendorPriceUploads ?? [])
    saveStockSnapshots(state.stockSnapshots ?? [])
    saveMatches(state.matches ?? {})
    saveReorderDraft(state.reorderDraft ?? { snapshotId: null, lines: [] })
    saveOrders(state.orders ?? [])
    saveActivity(state.activity ?? [])
    saveSettings(state.settings ?? { ...DEFAULT_SETTINGS })
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  }
}

/** Persist storage using our storage module (versioned keys). */
function createPersistStorage(): {
  getItem: (name: string) => StorageValue<PersistedState> | null
  setItem: (name: string, value: StorageValue<PersistedState>) => void
  removeItem: (name: string) => void
} {
  return {
    getItem: (): StorageValue<PersistedState> | null => {
      migrateFromLegacy()
      const state: PersistedState = {
        products: getInventory(),
        vendors: getVendors(),
        vendorPrices: getVendorPrices(),
        vendorPriceUploads: getVendorPriceUploads(),
        stockSnapshots: getStockSnapshots(),
        matches: getMatches(),
        reorderDraft: getReorderDraft(),
        orders: getOrders(),
        activity: getActivity(),
        settings: getSettings(),
      }
      const sanitized = sanitizeState(state)
      return { state: sanitized, version: 1 }
    },
    setItem: (_name: string, value: StorageValue<PersistedState>): void => {
      const s = value.state
      saveInventory(s.products ?? [])
      saveVendors(s.vendors ?? [])
      saveVendorPrices(s.vendorPrices ?? [])
      saveVendorPriceUploads(s.vendorPriceUploads ?? [])
      saveStockSnapshots(s.stockSnapshots ?? [])
      saveMatches(s.matches ?? {})
      saveReorderDraft(s.reorderDraft ?? { snapshotId: null, lines: [] })
      saveOrders(s.orders ?? [])
      saveActivity(s.activity ?? [])
      saveSettings(s.settings ?? { ...DEFAULT_SETTINGS })
    },
    removeItem: (): void => {
      clearAllData()
    },
  }
}

type StoreState = PersistedState & ReturnType<typeof getVendorsActions> &
  ReturnType<typeof getProductsActions> &
  ReturnType<typeof getVendorPricesActions> &
  ReturnType<typeof getVendorPriceUploadsActions> &
  ReturnType<typeof getStockSnapshotsActions> &
  ReturnType<typeof getReorderDraftActions> &
  ReturnType<typeof getOrdersActions> &
  ReturnType<typeof getActivityActions> &
  ReturnType<typeof getSettingsActions> &
  ReturnType<typeof getMatchesActions> &
  ReturnType<typeof getInventoryActions>

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

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
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
    }),
    {
      name: 'estoquiState',
      storage: createPersistStorage(),
      partialize: (state): PersistedState => ({
        vendors: state.vendors,
        products: state.products,
        vendorPrices: state.vendorPrices,
        vendorPriceUploads: state.vendorPriceUploads,
        stockSnapshots: state.stockSnapshots,
        matches: state.matches,
        reorderDraft: state.reorderDraft,
        orders: state.orders,
        activity: state.activity,
        settings: state.settings,
      }),
    }
  )
)

// Re-export for components that need default settings
export { DEFAULT_SETTINGS }

// Re-export for reset actions
export { clearAllData } from '@/shared/lib/storage'
