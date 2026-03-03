import { supabase } from '@/lib/supabase'
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
 * Requires a valid authenticated user — filters all queries by user_id.
 */
export async function loadAllUserData(): Promise<PersistedState> {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) {
    console.error('[loadUserData] getUser error:', userError)
    throw userError
  }
  if (!user?.id) {
    console.error('[loadUserData] No authenticated user — cannot load data')
    return {
      vendors: [],
      products: [],
      vendorPrices: [],
      vendorPriceUploads: [],
      stockSnapshots: [],
      matches: {},
      reorderDraft: { snapshotId: null, lines: [] },
      orders: [],
      activity: [],
      settings: { ...DEFAULT_SETTINGS },
    }
  }
  const userId = user.id

  const [vendors, products, vendorPrices, orders, activity, settings, stockSnapshots] =
    await Promise.all([
      fetchVendors(userId),
      fetchProducts(userId),
      fetchVendorPrices(userId),
      fetchOrders(userId),
      fetchActivity(userId),
      fetchSettings(userId),
      fetchStockSnapshots(userId),
    ])

  console.log('[loadUserData] Loaded:', {
    vendors: vendors.length,
    products: products.length,
    vendorPrices: vendorPrices.length,
    orders: orders.length,
    activity: activity.length,
  })

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
