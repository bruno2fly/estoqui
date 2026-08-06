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

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

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
    const { data: member, error: memberErr } = await supabase
      .from('app_members')
      .select('store_id')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle()
    if (memberErr) return fail(memberErr.message)
    const storeId = member?.store_id as string | undefined
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
