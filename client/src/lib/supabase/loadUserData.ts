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

  // Fetch each table independently — if one fails, the rest still load.
  // This prevents a single slow/broken table from wiping the entire dashboard.
  async function safeFetch<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      console.warn(`[loadUserData] ${label} fetch failed — using fallback:`, err)
      return fallback
    }
  }

  const [vendors, products, vendorPrices, orders, activity, settings, stockSnapshots] =
    await Promise.all([
      safeFetch('vendors', () => fetchVendors(userId), []),
      safeFetch('products', () => fetchProducts(userId), []),
      safeFetch('vendorPrices', () => fetchVendorPrices(userId), []),
      safeFetch('orders', () => fetchOrders(userId), []),
      safeFetch('activity', () => fetchActivity(userId), []),
      safeFetch('settings', () => fetchSettings(userId), null),
      safeFetch('stockSnapshots', () => fetchStockSnapshots(userId), []),
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
