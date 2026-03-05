import { supabase } from '@/lib/supabase'
import { vendorPriceToDb, vendorPriceFromDb } from './mappers'
import { safeUpsert } from './safeUpsert'
import { enqueueWrite } from './writeQueue'
import type { VendorPrice } from '@/types'

export async function fetchVendorPrices(userId: string): Promise<VendorPrice[]> {
  const PAGE = 1000
  let all: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('vendor_prices')
      .select('*')
      .eq('user_id', userId)
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[Supabase vendor_prices] fetch error:', error)
      throw error
    }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all.map((row) => vendorPriceFromDb(row))
}

export async function upsertVendorPrice(vp: VendorPrice, userId: string): Promise<void> {
  enqueueWrite({
    table: 'vendor_prices',
    data: vendorPriceToDb(vp, userId),
    onConflict: 'user_id,vendor_id,product_id',
  })
}

export async function upsertVendorPrices(vps: VendorPrice[], userId: string): Promise<void> {
  if (vps.length === 0) return
  const CHUNK = 200
  for (let i = 0; i < vps.length; i += CHUNK) {
    const chunk = vps.slice(i, i + CHUNK)
    const rows = chunk.map((vp) => vendorPriceToDb(vp, userId))
    await safeUpsert({
      table: 'vendor_prices',
      data: rows,
      onConflict: 'user_id,vendor_id,product_id',
    })
  }
}

export async function deleteVendorPrice(vendorId: string, productId: string): Promise<void> {
  const { error } = await supabase
    .from('vendor_prices')
    .delete()
    .eq('vendor_id', vendorId)
    .eq('product_id', productId)
  if (error) {
    console.error('[Supabase vendor_prices] delete error:', error)
    throw error
  }
}
