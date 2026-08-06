import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'
import { insertNewProducts, upsertProducts } from '@/lib/supabase/products'
import { upsertVendor } from '@/lib/supabase/vendors'
import type { Product, Vendor } from '@/types'

/**
 * App → Software product pull-sync.
 *
 * The Software user IS the App store's owner (same Supabase project, same
 * login), and the App's RLS already lets store members read `app_products`.
 * So we read the App catalog with the existing session and merge it into the
 * Software's own `products` — no new infra, no migrations, App data untouched.
 *
 * MERGE RULES (deliberate — do not "improve" without Bruno's sign-off):
 *  - Barcode (app) ↔ sku (software) is the join key; fallback = exact
 *    case-insensitive name match.
 *  - FILL BLANKS ONLY. Prices are a ONE-TIME SEED: the App's retail defaults
 *    never overwrite Software values, and once set they are never updated by
 *    sync again — Software costs come from vendor lists / the owner's own
 *    numbers, which always win. Same for names: owner edits are permanent.
 *  - Client suggestions (no barcode) are skipped.
 *  - Sync never deletes anything.
 */

export interface AppSyncResult {
  ok: boolean
  created: number
  updated: number
  skipped: number
  total: number
  error?: string
  at: string
}

export interface AppPushResult {
  ok: boolean
  created: number
  skipped: number
  error?: string
  at: string
}

const LAST_SYNC_KEY = 'estoqui-app-sync-last'

export function getLastSync(): AppSyncResult | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY)
    return raw ? (JSON.parse(raw) as AppSyncResult) : null
  } catch {
    return null
  }
}

function remember(result: AppSyncResult): AppSyncResult {
  try {
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(result))
  } catch {
    /* storage unavailable — harmless */
  }
  return result
}

const LAST_PUSH_KEY = 'estoqui-app-push-last'

export function getLastPush(): AppPushResult | null {
  try {
    const raw = localStorage.getItem(LAST_PUSH_KEY)
    return raw ? (JSON.parse(raw) as AppPushResult) : null
  } catch {
    return null
  }
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Read ALL matching rows, not just the first 1000 — Supabase caps a single
 * query at 1000 rows, which would silently truncate big catalogs (and make the
 * push think existing App products are "new", creating duplicates).
 */
export async function fetchAllStoreRows(
  table: 'app_products' | 'app_vendors' | 'app_requests' | 'app_daily_sales',
  storeId: string,
  select: string,
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000
  let all: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('store_id', storeId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    all = all.concat(rows)
    if (rows.length < PAGE) break
  }
  return all
}

/** The signed-in user's App store id (owner or member), or null. */
export async function resolveAppStoreId(uid: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_members')
    .select('store_id')
    .eq('user_id', uid)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.store_id as string | undefined) ?? null
}

let running = false

export async function syncProductsFromApp(): Promise<AppSyncResult> {
  const fail = (error: string): AppSyncResult =>
    remember({ ok: false, created: 0, updated: 0, skipped: 0, total: 0, error, at: new Date().toISOString() })

  if (running) return fail('Sync already running')
  running = true
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return fail('Not signed in')

    // The user's App store (owner or member — RLS scopes the read either way).
    const storeId = await resolveAppStoreId(uid)
    if (!storeId) return fail('No App store found for this account')

    // App catalog — paginated so catalogs over 1000 products aren't truncated.
    // select('*') keeps this resilient to older App schemas.
    const rows = await fetchAllStoreRows('app_products', storeId, '*')

    const state = useStore.getState()
    const existing = state.products
    const bySku = new Map<string, Product>()
    const byName = new Map<string, Product>()
    for (const p of existing) {
      if (p.sku?.trim()) bySku.set(p.sku.trim(), p)
      byName.set(norm(p.name), p)
    }

    const toNum = (v: unknown): number | undefined => {
      if (v == null) return undefined
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) && n > 0 ? n : undefined
    }

    const created: Product[] = []
    const updated: Product[] = []
    let skipped = 0

    for (const r of rows) {
      const barcode = ((r.barcode as string | null) ?? '').trim()
      const name = ((r.name as string | null) ?? '').trim()
      // Client suggestions / barcode-less items: skip (v1 rule).
      if (!barcode || !name || r.source === 'client_suggestion') {
        skipped++
        continue
      }

      const match = bySku.get(barcode) ?? byName.get(norm(name))
      const purchase = toNum(r.purchase_price)
      const sale = toNum(r.sale_price)
      const minStock = toNum(r.min_stock)

      if (!match) {
        const product: Product = {
          id: crypto.randomUUID(),
          name,
          brand: '',
          sku: barcode,
          minStock: minStock ?? 10,
          unitCost: purchase,
          unitPrice: sale,
        }
        created.push(product)
        bySku.set(barcode, product)
        byName.set(norm(name), product)
      } else {
        // FILL BLANKS ONLY — never overwrite what the owner set here.
        const patch: Partial<Product> = {}
        if (!match.sku?.trim()) patch.sku = barcode
        if (match.unitCost == null && purchase != null) patch.unitCost = purchase
        if (match.unitPrice == null && sale != null) patch.unitPrice = sale
        if (Object.keys(patch).length > 0) {
          updated.push({ ...match, ...patch })
        }
      }
    }

    // Persist to the Software's own schema.
    if (created.length > 0) await insertNewProducts(created, uid)
    if (updated.length > 0) await upsertProducts(updated, uid)

    // Reflect in the in-memory store so the Catalog updates immediately.
    if (created.length > 0 || updated.length > 0) {
      const patched = new Map(updated.map((p) => [p.id, p]))
      useStore.setState({
        products: [...existing.map((p) => patched.get(p.id) ?? p), ...created],
      })
    }

    return remember({
      ok: true,
      created: created.length,
      updated: updated.length,
      skipped,
      total: rows.length,
      at: new Date().toISOString(),
    })
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Sync failed')
  } finally {
    running = false
  }
}

/**
 * Software → App push (the reverse direction).
 *
 * RULES (mirror of the pull, approved by Bruno):
 *  - ADDITIVE ONLY: creates App products for barcodes the App doesn't have.
 *    Existing App products are NEVER modified — the floor's data stays
 *    authoritative in the App.
 *  - Products without a SKU are skipped (nothing to scan on the phone).
 *  - Name collisions are skipped too (the pull already links those by name).
 *  - Loop-safe: the pull direction fills blanks only, so a pushed product
 *    simply round-trips as a barcode match with nothing to change.
 */
let pushing = false

export async function pushProductsToApp(): Promise<AppPushResult> {
  const fail = (error: string): AppPushResult => {
    const r: AppPushResult = { ok: false, created: 0, skipped: 0, error, at: new Date().toISOString() }
    try {
      localStorage.setItem(LAST_PUSH_KEY, JSON.stringify(r))
    } catch { /* harmless */ }
    return r
  }

  if (pushing) return fail('Push already running')
  pushing = true
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return fail('Not signed in')

    const storeId = await resolveAppStoreId(uid)
    if (!storeId) return fail('No App store found for this account')

    // What the App already has (barcode + name), to guarantee additive-only.
    // Paginated — a truncated read here would create DUPLICATES in the App.
    const appRows = await fetchAllStoreRows('app_products', storeId, 'barcode, name')
    const appBarcodes = new Set(
      appRows.map((r) => ((r.barcode as string | null) ?? '').trim()).filter(Boolean),
    )
    const appNames = new Set(appRows.map((r) => norm(r.name as string | null)))

    const products = useStore.getState().products
    let skipped = 0
    const rows: Record<string, unknown>[] = []
    for (const p of products) {
      const sku = p.sku?.trim() ?? ''
      if (!sku || appBarcodes.has(sku) || appNames.has(norm(p.name))) {
        skipped++
        continue
      }
      const row: Record<string, unknown> = {
        store_id: storeId,
        barcode: sku,
        name: p.name.trim(),
        created_by: uid,
        created_by_name: 'Software',
      }
      // Optional seeds — only when the Software actually has a value.
      if (p.unitCost != null && p.unitCost > 0) row.purchase_price = p.unitCost
      if (p.unitPrice != null && p.unitPrice > 0) row.sale_price = p.unitPrice
      if (p.minStock != null && p.minStock > 0) row.min_stock = Math.round(p.minStock)
      rows.push(row)
      appBarcodes.add(sku) // dedupe within this batch too
    }

    let created = 0
    const CHUNK = 100
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from('app_products').insert(chunk)
      if (error) {
        // Pre-v3/v4 App schema or similar: retry without optional columns.
        const bare = chunk.map((r) => ({
          store_id: r.store_id,
          barcode: r.barcode,
          name: r.name,
          created_by: r.created_by,
        }))
        const { error: bareErr } = await supabase.from('app_products').insert(bare)
        if (bareErr) return fail(bareErr.message)
      }
      created += chunk.length
    }

    const result: AppPushResult = { ok: true, created, skipped, at: new Date().toISOString() }
    try {
      localStorage.setItem(LAST_PUSH_KEY, JSON.stringify(result))
    } catch { /* harmless */ }
    return result
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Push failed')
  } finally {
    pushing = false
  }
}

// ---------------------------------------------------------------------------
// Vendors — same rules as products; the join key is the NORMALIZED NAME
// (vendors have no barcode).
//
// Field mapping:
//   App app_vendors { name, contact_method: 'whatsapp'|'email', contact_value }
//   Software Vendor { name, phone, contactEmail, preferredChannel, ... }
//   whatsapp → phone / email → contactEmail; preferredChannel mirrors method.
// ---------------------------------------------------------------------------

/** App → Software vendor pull. Fill-blanks-only, never deletes. */
export async function syncVendorsFromApp(): Promise<AppSyncResult> {
  const fail = (error: string): AppSyncResult => ({
    ok: false, created: 0, updated: 0, skipped: 0, total: 0, error, at: new Date().toISOString(),
  })
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return fail('Not signed in')
    const storeId = await resolveAppStoreId(uid)
    if (!storeId) return fail('No App store found for this account')

    const rows = await fetchAllStoreRows('app_vendors', storeId, '*')
    const existing = useStore.getState().vendors
    const byName = new Map(existing.map((v) => [norm(v.name), v]))

    const created: Vendor[] = []
    const updated: Vendor[] = []
    let skipped = 0

    for (const r of rows) {
      const name = ((r.name as string | null) ?? '').trim()
      if (!name) {
        skipped++
        continue
      }
      const method = r.contact_method === 'email' ? 'email' : 'whatsapp'
      const value = ((r.contact_value as string | null) ?? '').trim()
      const match = byName.get(norm(name))

      if (!match) {
        const vendor: Vendor = {
          id: crypto.randomUUID(),
          name,
          phone: method === 'whatsapp' ? value : '',
          notes: '',
          status: 'active',
          contactEmail: method === 'email' && value ? value : undefined,
          preferredChannel: method,
        }
        created.push(vendor)
        byName.set(norm(name), vendor)
      } else {
        // FILL BLANKS ONLY — owner-entered contact data always wins.
        const patch: Partial<Vendor> = {}
        if (!match.phone?.trim() && method === 'whatsapp' && value) patch.phone = value
        if (!match.contactEmail?.trim() && method === 'email' && value) patch.contactEmail = value
        if (!match.preferredChannel) patch.preferredChannel = method
        if (Object.keys(patch).length > 0) updated.push({ ...match, ...patch })
      }
    }

    for (const v of [...created, ...updated]) await upsertVendor(v, uid)

    if (created.length > 0 || updated.length > 0) {
      const patched = new Map(updated.map((v) => [v.id, v]))
      useStore.setState({
        vendors: [...existing.map((v) => patched.get(v.id) ?? v), ...created],
      })
    }

    return {
      ok: true,
      created: created.length,
      updated: updated.length,
      skipped,
      total: rows.length,
      at: new Date().toISOString(),
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Vendor sync failed')
  }
}

/** Software → App vendor push. Additive only, name-keyed, never modifies. */
export async function pushVendorsToApp(): Promise<AppPushResult> {
  const fail = (error: string): AppPushResult => ({
    ok: false, created: 0, skipped: 0, error, at: new Date().toISOString(),
  })
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return fail('Not signed in')
    const storeId = await resolveAppStoreId(uid)
    if (!storeId) return fail('No App store found for this account')

    const appRows = await fetchAllStoreRows('app_vendors', storeId, 'name')
    const appNames = new Set(appRows.map((r) => norm(r.name as string | null)))

    const vendors = useStore.getState().vendors
    let skipped = 0
    const rows: Record<string, unknown>[] = []
    for (const v of vendors) {
      const name = v.name.trim()
      if (!name || appNames.has(norm(name))) {
        skipped++
        continue
      }
      // The App stores ONE contact: prefer WhatsApp/phone, fall back to email.
      const phone = v.phone?.trim() ?? ''
      const email = v.contactEmail?.trim() ?? ''
      rows.push({
        store_id: storeId,
        name,
        contact_method: phone ? 'whatsapp' : 'email',
        contact_value: phone || email,
      })
      appNames.add(norm(name))
    }

    let created = 0
    const CHUNK = 100
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from('app_vendors').insert(chunk)
      if (error) return fail(error.message)
      created += chunk.length
    }

    return { ok: true, created, skipped, at: new Date().toISOString() }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Vendor push failed')
  }
}

// ---------------------------------------------------------------------------
// Combined runners — what the UI and the login hook actually call.
// ---------------------------------------------------------------------------

export interface CombinedSyncResult {
  products: AppSyncResult
  vendors: AppSyncResult
}

export interface CombinedPushResult {
  products: AppPushResult
  vendors: AppPushResult
}

/** Pull products + vendors from the App (login auto-run and "Sync from App"). */
export async function syncAllFromApp(): Promise<CombinedSyncResult> {
  const products = await syncProductsFromApp()
  const vendors = await syncVendorsFromApp()
  return { products, vendors }
}

/** Push products + vendors to the App ("Send to App"). */
export async function pushAllToApp(): Promise<CombinedPushResult> {
  const products = await pushProductsToApp()
  const vendors = await pushVendorsToApp()
  return { products, vendors }
}
