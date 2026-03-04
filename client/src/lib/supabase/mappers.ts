/**
 * camelCase ↔ snake_case key transformation for Supabase DB rows.
 *
 * IMPORTANT: toDb mappers only include optional fields when they have real
 * values.  This prevents "column does not exist" errors when the Postgres
 * schema hasn't been extended with those columns yet.
 */

import type {
  Vendor,
  Product,
  VendorPrice,
  Order,
  Activity,
  AppSettings,
  StockSnapshot,
} from '@/types'

// ── helpers ─────────────────────────────────────────────────────────────

/** Strip keys whose value is undefined (null is kept — it means "clear"). */
function defined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

// camelCase → snake_case (generic utilities kept for future use)
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

export function toSnakeCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value
  }
  return result
}

export function toCamelCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value
  }
  return result
}

// ─── Vendor Mappers ──────────────────────────────────────────────────────

// DB columns: id, user_id, name, contact_phone, contact_name, contact_email,
//   status, notes, score, created_at, updated_at, preferred_channel,
//   stale_after_days, update_cadence, expected_update_day_of_week, last_price_list_at
// MISSING in DB: phone
export function vendorToDb(v: Vendor, userId: string) {
  return defined({
    id: v.id,
    user_id: userId,
    name: v.name,
    status: v.status ?? 'active',
    contact_name: v.contactName || undefined,
    contact_email: v.contactEmail || undefined,
    contact_phone: v.phone || undefined,
    notes: v.notes || undefined,
    score: v.score ?? undefined,
    preferred_channel: v.preferredChannel ?? undefined,
    update_cadence: v.updateCadence ?? undefined,
    expected_update_day_of_week: v.expectedUpdateDayOfWeek ?? undefined,
    last_price_list_at: v.lastPriceListAt ?? undefined,
    stale_after_days: v.staleAfterDays ?? undefined,
    created_at: v.createdAt ?? new Date().toISOString(),
    updated_at: v.updatedAt ?? new Date().toISOString(),
  })
}

export function vendorFromDb(row: Record<string, unknown>): Vendor {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: (row.contact_phone as string) ?? '',
    notes: (row.notes as string) ?? '',
    status: row.status as Vendor['status'],
    contactName: row.contact_name as string | undefined,
    contactEmail: row.contact_email as string | undefined,
    preferredChannel: row.preferred_channel as Vendor['preferredChannel'],
    updateCadence: row.update_cadence as Vendor['updateCadence'],
    expectedUpdateDayOfWeek: row.expected_update_day_of_week as number | undefined,
    lastPriceListAt: row.last_price_list_at as string | undefined,
    staleAfterDays: row.stale_after_days as number | undefined,
    score: row.score as number | undefined,
    createdAt: row.created_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
  }
}

// ─── Product Mappers ─────────────────────────────────────────────────────

export function productToDb(p: Product, userId: string) {
  return defined({
    id: p.id,
    user_id: userId,
    name: p.name,
    brand: p.brand || '',
    sku: p.sku ?? undefined,
    category: p.category ?? undefined,
    unit_size: p.unitSize ?? undefined,
    min_stock: p.minStock ?? undefined,
    stock_qty: p.stockQty ?? undefined,
    unit_cost: p.unitCost ?? undefined,
    unit_price: p.unitPrice ?? undefined,
  })
}

export function productFromDb(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    brand: (row.brand as string) ?? '',
    sku: row.sku as string | undefined,
    category: row.category as string | undefined,
    unitSize: row.unit_size as string | undefined,
    minStock: (row.min_stock as number) ?? 10,
    stockQty: row.stock_qty as number | undefined,
    unitCost: row.unit_cost as number | undefined,
    unitPrice: row.unit_price as number | undefined,
  }
}

// ─── VendorPrice Mappers ─────────────────────────────────────────────────

// DB columns: id, user_id, vendor_id, product_id, price
// MISSING in DB: unit_price, updated_at, cost, unit_cost, pack_*
export function vendorPriceToDb(vp: VendorPrice, userId: string) {
  return {
    user_id: userId,
    vendor_id: vp.vendorId,
    product_id: vp.productId,
    price: vp.unitPrice,
  }
}

export function vendorPriceFromDb(row: Record<string, unknown>): VendorPrice {
  return {
    vendorId: row.vendor_id as string,
    productId: row.product_id as string,
    unitPrice: (row.price as number) ?? (row.unit_price as number) ?? 0,
    updatedAt: (row.updated_at as string) ?? (row.created_at as string) ?? '',
  }
}

// ─── Order Mappers ───────────────────────────────────────────────────────

// DB columns: id, user_id, created_at, lines, status, vendor_id
// MISSING in DB: snapshot_id, total, totals_by_vendor
export function orderToDb(o: Order, userId: string) {
  // Derive vendor_id from the first line if available
  const firstVendorId = o.lines?.[0]?.vendorId ?? null
  return defined({
    id: o.id,
    user_id: userId,
    created_at: o.createdAt,
    lines: o.lines,
    status: 'completed',
    vendor_id: firstVendorId ?? undefined,
  })
}

export function orderFromDb(row: Record<string, unknown>): Order {
  const lines = (row.lines as Order['lines']) ?? []
  // Recompute total and totalsByVendor from lines since DB doesn't store them
  let total = 0
  const totalsByVendor: Record<string, number> = {}
  for (const line of lines) {
    total += line.lineTotal ?? 0
    if (line.vendorId) {
      totalsByVendor[line.vendorId] = (totalsByVendor[line.vendorId] ?? 0) + (line.lineTotal ?? 0)
    }
  }
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    snapshotId: null,
    total,
    totalsByVendor,
    lines,
  }
}

// ─── Activity Mappers ────────────────────────────────────────────────────

export function activityToDb(a: Activity, userId: string) {
  return {
    id: a.id,
    user_id: userId,
    type: a.type,
    description: a.description,
    date: a.date,
  }
}

export function activityFromDb(row: Record<string, unknown>): Activity {
  return {
    id: row.id as string,
    type: row.type as string,
    description: row.description as string,
    date: row.date as string,
  }
}

// ─── Settings Mappers ────────────────────────────────────────────────────

// DB columns: id, user_id, store_name, default_min_stock, openai_api_key
// MISSING in DB: staleness_threshold
export function settingsToDb(s: AppSettings, userId: string) {
  return defined({
    user_id: userId,
    store_name: s.storeName,
    default_min_stock: s.defaultMinStock,
    openai_api_key: s.openaiApiKey ?? undefined,
  })
}

export function settingsFromDb(row: Record<string, unknown>): AppSettings {
  return {
    storeName: (row.store_name as string) ?? 'My Store',
    stalenessThreshold: 45, // not stored in DB, use default
    defaultMinStock: (row.default_min_stock as number) ?? 10,
    openaiApiKey: (row.openai_api_key as string) ?? '',
  }
}

// ─── StockSnapshot Mappers ───────────────────────────────────────────────

export function stockSnapshotToDb(s: StockSnapshot, userId: string) {
  return defined({
    id: s.id,
    user_id: userId,
    uploaded_at: s.uploadedAt,
    source_file_name: s.sourceFileName ?? undefined,
    source_type: s.sourceType ?? undefined,
    rows: s.rows,
  })
}

export function stockSnapshotFromDb(row: Record<string, unknown>): StockSnapshot {
  return {
    id: row.id as string,
    uploadedAt: row.uploaded_at as string,
    sourceFileName: row.source_file_name as string | undefined,
    sourceType: row.source_type as string | undefined,
    rows: (row.rows as StockSnapshot['rows']) ?? [],
  }
}
