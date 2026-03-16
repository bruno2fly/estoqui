import { supabase } from '@/lib/supabase'
import { productToDb, productFromDb } from './mappers'
import { safeUpsert } from './safeUpsert'
import { enqueueWrite } from './writeQueue'
import type { Product } from '@/types'

export async function fetchProducts(userId: string): Promise<Product[]> {
  const PAGE = 1000
  let all: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[Supabase products] fetch error:', error)
      throw error
    }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all.map((row) => productFromDb(row))
}

export async function upsertProduct(product: Product, userId: string): Promise<void> {
  enqueueWrite({
    table: 'products',
    data: productToDb(product, userId),
    onConflict: 'user_id,name',
  })
}

export async function upsertProducts(products: Product[], userId: string): Promise<void> {
  if (products.length === 0) return
  const CHUNK = 200
  for (let i = 0; i < products.length; i += CHUNK) {
    const chunk = products.slice(i, i + CHUNK)
    const rows = chunk.map((p) => productToDb(p, userId))
    await safeUpsert({
      table: 'products',
      data: rows,
      onConflict: 'user_id,name',
    })
  }
}

/**
 * Insert brand-new products directly (no upsert/onConflict needed).
 * Much faster than upsertProducts because it skips the broken upsert→500→fallback path.
 * Duplicates within the batch are handled row-by-row.
 */
export async function insertNewProducts(products: Product[], userId: string): Promise<number> {
  if (products.length === 0) return 0
  const CHUNK = 200
  let totalInserted = 0
  for (let i = 0; i < products.length; i += CHUNK) {
    const chunk = products.slice(i, i + CHUNK)
    const rows = chunk.map((p) => productToDb(p, userId))
    const { error } = await supabase.from('products').insert(rows)
    if (!error) {
      totalInserted += rows.length
      console.log(`[insertNewProducts] Batch ${Math.floor(i / CHUNK) + 1}: ${rows.length} inserted (${totalInserted} total)`)
      continue
    }
    const msg = error.message ?? ''
    if (msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('already exists')) {
      // Row-by-row fallback for batches with duplicates
      console.warn(`[insertNewProducts] Batch ${Math.floor(i / CHUNK) + 1} hit duplicates, falling back to row-by-row`)
      let inserted = 0
      let skipped = 0
      for (const row of rows) {
        const { error: rowErr } = await supabase.from('products').insert(row)
        if (!rowErr) {
          inserted++
        } else {
          console.warn(`[insertNewProducts] Skipped duplicate: ${(row as Record<string, unknown>).name}`)
          skipped++
        }
      }
      totalInserted += inserted
      console.log(`[insertNewProducts] Row-by-row: ${inserted} inserted, ${skipped} skipped (${totalInserted} total)`)
    } else {
      console.error(`[insertNewProducts] Batch error:`, msg)
      throw error
    }
  }
  console.log(`[insertNewProducts] Done — ${totalInserted} total inserted`)
  return totalInserted
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) {
    console.error('[Supabase products] delete error:', error)
    throw error
  }
}

async function batchDelete(
  table: string,
  userId: string,
  label: string,
): Promise<number> {
  const BATCH = 200
  let totalDeleted = 0
  while (true) {
    const { data, error: fetchErr } = await supabase
      .from(table)
      .select('id')
      .eq('user_id', userId)
      .limit(BATCH)
    if (fetchErr) {
      console.error(`[${label}] fetch error:`, JSON.stringify(fetchErr))
      throw new Error(`${label} fetch failed: ${fetchErr.message ?? JSON.stringify(fetchErr)}`)
    }
    if (!data || data.length === 0) break
    const ids = data.map((r) => r.id as string)
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .in('id', ids)
    if (delErr) {
      console.error(`[${label}] delete error:`, JSON.stringify(delErr))
      throw new Error(`${label} delete failed: ${delErr.message ?? JSON.stringify(delErr)}`)
    }
    totalDeleted += ids.length
    console.log(`[${label}] Deleted ${totalDeleted} so far...`)
    // Small pause to avoid rate-limit
    await new Promise((r) => setTimeout(r, 50))
  }
  console.log(`[${label}] Done — ${totalDeleted} total deleted`)
  return totalDeleted
}

export async function deleteAllProducts(userId: string): Promise<number> {
  return batchDelete('products', userId, 'deleteAllProducts')
}

export async function deleteAllVendorPrices(userId: string): Promise<number> {
  return batchDelete('vendor_prices', userId, 'deleteAllVendorPrices')
}

export async function deleteAllStockSnapshots(userId: string): Promise<number> {
  return batchDelete('stock_snapshots', userId, 'deleteAllStockSnapshots')
}
