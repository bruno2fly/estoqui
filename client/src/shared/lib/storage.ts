/**
 * Storage abstraction for Estoqui. Runs 100% in browser with localStorage.
 * Uses versioned keys for future migrations.
 */

import type {
  Product,
  Vendor,
  VendorPrice,
  VendorPriceUpload,
  StockSnapshot,
  ReorderDraft,
  Order,
  Activity,
  AppSettings,
} from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

const PREFIX = 'estoqui:v1:'
const KEYS = {
  inventory: PREFIX + 'inventory',
  vendors: PREFIX + 'vendors',
  vendorPrices: PREFIX + 'vendorPrices',
  vendorPriceUploads: PREFIX + 'vendorPriceUploads',
  stockSnapshots: PREFIX + 'stockSnapshots',
  matches: PREFIX + 'matches',
  reorderDraft: PREFIX + 'reorderDraft',
  orders: PREFIX + 'orders',
  activity: PREFIX + 'activity',
  settings: PREFIX + 'settings',
} as const

function safeParse<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return defaultValue
    const parsed = JSON.parse(raw) as T
    return parsed ?? defaultValue
  } catch {
    return defaultValue
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.error('[storage] Failed to save', key, e)
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export function getInventory(): Product[] {
  return safeParse<Product[]>(KEYS.inventory, [])
}

export function saveInventory(items: Product[]): void {
  safeSet(KEYS.inventory, items)
}

export function getVendors(): Vendor[] {
  return safeParse<Vendor[]>(KEYS.vendors, [])
}

export function saveVendors(items: Vendor[]): void {
  safeSet(KEYS.vendors, items)
}

export function getOrders(): Order[] {
  return safeParse<Order[]>(KEYS.orders, [])
}

export function saveOrders(items: Order[]): void {
  safeSet(KEYS.orders, items)
}

export function getSettings(): AppSettings {
  return safeParse<AppSettings>(KEYS.settings, { ...DEFAULT_SETTINGS })
}

export function saveSettings(settings: AppSettings): void {
  safeSet(KEYS.settings, settings)
}

// ─── Additional entities (for full app state) ──────────────────────────────

export function getVendorPrices(): VendorPrice[] {
  return safeParse<VendorPrice[]>(KEYS.vendorPrices, [])
}

export function saveVendorPrices(items: VendorPrice[]): void {
  safeSet(KEYS.vendorPrices, items)
}

export function getVendorPriceUploads(): VendorPriceUpload[] {
  return safeParse<VendorPriceUpload[]>(KEYS.vendorPriceUploads, [])
}

export function saveVendorPriceUploads(items: VendorPriceUpload[]): void {
  safeSet(KEYS.vendorPriceUploads, items)
}

export function getStockSnapshots(): StockSnapshot[] {
  return safeParse<StockSnapshot[]>(KEYS.stockSnapshots, [])
}

export function saveStockSnapshots(items: StockSnapshot[]): void {
  safeSet(KEYS.stockSnapshots, items)
}

export function getMatches(): Record<string, string> {
  return safeParse<Record<string, string>>(KEYS.matches, {})
}

export function saveMatches(matches: Record<string, string>): void {
  safeSet(KEYS.matches, matches)
}

export function getReorderDraft(): ReorderDraft {
  return safeParse<ReorderDraft>(KEYS.reorderDraft, {
    snapshotId: null,
    lines: [],
  })
}

export function saveReorderDraft(draft: ReorderDraft): void {
  safeSet(KEYS.reorderDraft, draft)
}

export function getActivity(): Activity[] {
  return safeParse<Activity[]>(KEYS.activity, [])
}

export function saveActivity(items: Activity[]): void {
  safeSet(KEYS.activity, items)
}

// ─── Reset helper ─────────────────────────────────────────────────────────

export function clearAllData(): void {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key))
}
