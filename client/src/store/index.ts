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
import { getInventoryActions, type OrderGroup } from './actions/inventoryActions'
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
    console.log('[hydrateFromSupabase] Hydrating store:', {
      vendors: data.vendors?.length ?? 0,
      products: data.products?.length ?? 0,
      orders: data.orders?.length ?? 0,
      stockSnapshots: data.stockSnapshots?.length ?? 0,
    })
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

    // ── Restore session state from persisted data ──
    // This rebuilds the activeOrderView and reorderDraft so the
    // inventory workflow survives logout / login from another device.
    setTimeout(() => {
      const state = get()

      // 1. Find the most recent order that has a snapshotId (active inventory session)
      const latestOrder = state.orders.find((o) => o.snapshotId)
      const latestSnapshot = state.stockSnapshots[0] // sorted desc by uploaded_at

      if (latestOrder && latestSnapshot && latestOrder.snapshotId === latestSnapshot.id) {
        // Rebuild activeOrderView from the latest order
        console.log('[hydrateFromSupabase] Restoring active order view from order', latestOrder.id)
        const byVendor: Record<string, OrderGroup> = {}
        for (const line of latestOrder.lines) {
          const vendor = state.vendors.find((v) => v.id === line.vendorId)
          if (!vendor) continue
          if (!byVendor[line.vendorId]) {
            byVendor[line.vendorId] = {
              vendorId: line.vendorId,
              vendor: { id: vendor.id, name: vendor.name },
              lines: [],
              subtotal: 0,
            }
          }
          byVendor[line.vendorId].lines.push(line)
          byVendor[line.vendorId].subtotal += line.lineTotal
        }
        set({
          activeOrderView: { order: latestOrder, byVendor },
          reorderDraft: { snapshotId: latestSnapshot.id, lines: [] },
        } as any)
      } else if (latestSnapshot) {
        // No order yet — rebuild reorder draft from the latest snapshot
        console.log('[hydrateFromSupabase] Rebuilding reorder draft from snapshot', latestSnapshot.id)
        state.buildReorderDraftFromSnapshot(latestSnapshot.id)
      }
    }, 100)
  },

  /** Clear store on logout */
  clearStore: () => {
    set({ ...initialState, activeOrderView: null } as any)
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
