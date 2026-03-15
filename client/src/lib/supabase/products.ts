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

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) {
    console.error('[Supabase products] delete error:', error)
    throw error
  }
}

export async function deleteAllProducts(userId: string): Promise<number> {
  let totalDeleted = 0
  // Delete in batches to avoid timeouts
  while (true) {
    const { data, error: fetchErr } = await supabase
      .from('products')
      .select('id')
      .eq('user_id', userId)
      .limit(500)
    if (fetchErr) throw fetchErr
    if (!data || data.length === 0) break
    const ids = data.map((r) => r.id as string)
    const { error: delErr } = await supabase
      .from('products')
      .delete()
      .in('id', ids)
    if (delErr) throw delErr
    totalDeleted += ids.length
    console.log(`[deleteAllProducts] Deleted ${totalDeleted} so far...`)
  }
  return totalDeleted
}

export async function deleteAllVendorPrices(userId: string): Promise<number> {
  let totalDeleted = 0
  while (true) {
    const { data, error: fetchErr } = await supabase
      .from('vendor_prices')
      .select('id')
      .eq('user_id', userId)
      .limit(500)
    if (fetchErr) throw fetchErr
    if (!data || data.length === 0) break
    const ids = data.map((r) => r.id as string)
    const { error: delErr } = await supabase
      .from('vendor_prices')
      .delete()
      .in('id', ids)
    if (delErr) throw delErr
    totalDeleted += ids.length
    console.log(`[deleteAllVendorPrices] Deleted ${totalDeleted} so far...`)
  }
  return totalDeleted
}
