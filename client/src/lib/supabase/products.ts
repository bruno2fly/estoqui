import { supabase } from '@/lib/supabase'
import { productToDb, productFromDb } from './mappers'
import type { Product } from '@/types'

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*')
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => productFromDb(row))
}

export async function upsertProduct(product: Product, userId: string): Promise<void> {
  const { error } = await supabase.from('products').upsert(productToDb(product, userId), { onConflict: 'id' })
  if (error) throw error
}

export async function upsertProducts(products: Product[], userId: string): Promise<void> {
  if (products.length === 0) return
  const rows = products.map((p) => productToDb(p, userId))
  const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
}
