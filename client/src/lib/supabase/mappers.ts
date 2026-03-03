/**
 * camelCase ↔ snake_case key transformation for Supabase DB rows.
 */

// camelCase → snake_case
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

// snake_case → camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

/** Convert object keys from camelCase to snake_case */
export function toSnakeCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value
  }
  return result
}

/** Convert object keys from snake_case to camelCase */
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

import type { Vendor, Product, VendorPrice, Order, Activity, AppSettings, StockSnapshot } from '@/types'

export function vendorToDb(v: Vendor, userId: string) {
  return {
    id: v.id,
    user_id: userId,
    name: v.name,
    status: v.status ?? 'active',
    contact_name: v.contactName ?? null,
    contact_email: v.contactEmail ?? null,
    contact_phone: v.phone || null,
    notes: v.notes || '',
    score: v.score ?? null,
    created_at: v.createdAt ?? new Date().toISOString(),
    updated_at: v.updatedAt ?? new Date().toISOString(),
  }
}

export function vendorFromDb(row: Record<string, unknown>): Vendor {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: (row.contact_phone as string) ?? (row.phone as string) ?? '',
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
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    brand: p.brand || '',
    sku: p.sku ?? null,
    category: p.category ?? null,
    unit_size: p.unitSize ?? null,
    min_stock: p.minStock ?? 10,
    stock_qty: p.stockQty ?? null,
    unit_cost: p.unitCost ?? null,
    unit_price: p.unitPrice ?? null,
  }
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

export function vendorPriceToDb(vp: VendorPrice, userId: string) {
  return {
    user_id: userId,
    vendor_id: vp.vendorId,
    product_id: vp.productId,
    unit_price: vp.unitPrice,
    updated_at: vp.updatedAt || new Date().toISOString(),
    pack_type: vp.packType ?? null,
    units_per_case: vp.unitsPerCase ?? null,
    unit_descriptor: vp.unitDescriptor ?? null,
    price_basis: vp.priceBasis ?? null,
    parse_version: vp.parseVersion ?? null,
    unit_cost: vp.unitCost ?? null,
  }
}

export function vendorPriceFromDb(row: Record<string, unknown>): VendorPrice {
  return {
    vendorId: row.vendor_id as string,
    productId: row.product_id as string,
    unitPrice: row.unit_price as number,
    updatedAt: row.updated_at as string,
    packType: row.pack_type as VendorPrice['packType'],
    unitsPerCase: row.units_per_case as number | undefined,
    unitDescriptor: row.unit_descriptor as string | undefined,
    priceBasis: row.price_basis as VendorPrice['priceBasis'],
    parseVersion: row.parse_version as number | undefined,
    unitCost: row.unit_cost as number | undefined,
  }
}

// ─── Order Mappers ───────────────────────────────────────────────────────

export function orderToDb(o: Order, userId: string) {
  return {
    id: o.id,
    user_id: userId,
    created_at: o.createdAt,
    snapshot_id: o.snapshotId ?? null,
    total: o.total,
    totals_by_vendor: o.totalsByVendor,
    lines: o.lines,
  }
}

export function orderFromDb(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    snapshotId: row.snapshot_id as string | null | undefined,
    total: row.total as number,
    totalsByVendor: (row.totals_by_vendor as Record<string, number>) ?? {},
    lines: (row.lines as Order['lines']) ?? [],
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

export function settingsToDb(s: AppSettings, userId: string) {
  return {
    user_id: userId,
    store_name: s.storeName,
    staleness_threshold: s.stalenessThreshold,
    default_min_stock: s.defaultMinStock,
    openai_api_key: s.openaiApiKey ?? '',
  }
}

export function settingsFromDb(row: Record<string, unknown>): AppSettings {
  return {
    storeName: (row.store_name as string) ?? 'My Store',
    stalenessThreshold: (row.staleness_threshold as number) ?? 45,
    defaultMinStock: (row.default_min_stock as number) ?? 10,
    openaiApiKey: (row.openai_api_key as string) ?? '',
  }
}

// ─── StockSnapshot Mappers ───────────────────────────────────────────────

export function stockSnapshotToDb(s: StockSnapshot, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    uploaded_at: s.uploadedAt,
    source_file_name: s.sourceFileName ?? null,
    source_type: s.sourceType ?? null,
    rows: s.rows,
  }
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
