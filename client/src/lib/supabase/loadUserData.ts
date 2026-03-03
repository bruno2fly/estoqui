import type { PersistedState } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { fetchVendors } from './vendors'
import { fetchProducts } from './products'
import { fetchVendorPrices } from './vendorPrices'
import { fetchOrders } from './orders'
import { fetchActivity } from './activity'
import { fetchSettings } from './settings'
import { fetchStockSnapshots } from './stockSnapshots'

/**
 * Fetch all user data from Supabase in parallel.
 * Returns a full PersistedState shape ready for Zustand hydration.
 */
export async function loadAllUserData(): Promise<PersistedState> {
  const [vendors, products, vendorPrices, orders, activity, settings, stockSnapshots] =
    await Promise.all([
      fetchVendors(),
      fetchProducts(),
      fetchVendorPrices(),
      fetchOrders(),
      fetchActivity(),
      fetchSettings(),
      fetchStockSnapshots(),
    ])

  return {
    vendors,
    products,
    vendorPrices,
    vendorPriceUploads: [], // no Supabase table — in-memory only
    stockSnapshots,
    matches: {}, // ephemeral — rebuilt at runtime
    reorderDraft: { snapshotId: null, lines: [] },
    orders,
    activity,
    settings: settings ?? { ...DEFAULT_SETTINGS },
  }
}
