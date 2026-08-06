import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'
import { insertNewProducts, upsertProducts } from '@/lib/supabase/products'
import type { Product } from '@/types'

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

/** The signed-in user's App store id (owner or member), or null. */
async function resolveAppStoreId(uid: string): Promise<string | null> {
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

    // App catalog. select('*') keeps this resilient to older App schemas.
    const { data: rows, error: prodErr } = await supabase
      .from('app_products')
      .select('*')
      .eq('store_id', storeId)
    if (prodErr) return fail(prodErr.message)

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

    for (const r of rows ?? []) {
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
      total: rows?.length ?? 0,
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
    const { data: appRows, error: appErr } = await supabase
      .from('app_products')
      .select('barcode, name')
      .eq('store_id', storeId)
    if (appErr) return fail(appErr.message)
    const appBarcodes = new Set(
      (appRows ?? []).map((r) => ((r.barcode as string | null) ?? '').trim()).filter(Boolean),
    )
    const appNames = new Set((appRows ?? []).map((r) => norm(r.name as string | null)))

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
