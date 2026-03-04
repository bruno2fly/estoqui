import { supabase } from '@/lib/supabase'
import { productToDb, productFromDb } from './mappers'
import { safeUpsert } from './safeUpsert'
import { enqueueWrite } from './writeQueue'
import type { Product } from '@/types'

export async function fetchProducts(userId: string): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*').eq('user_id', userId)
  if (error) {
    console.error('[Supabase products] fetch error:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => productFromDb(row))
}

export async function upsertProduct(product: Product, userId: string): Promise<void> {
  enqueueWrite({
    table: 'products',
    data: productToDb(product, userId),
    onConflict: 'id',
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
      onConflict: 'id',
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
