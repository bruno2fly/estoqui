import { supabase } from '@/lib/supabase'
import { vendorPriceToDb, vendorPriceFromDb } from './mappers'
import { safeUpsert } from './safeUpsert'
import type { VendorPrice } from '@/types'

export async function fetchVendorPrices(userId: string): Promise<VendorPrice[]> {
  const { data, error } = await supabase.from('vendor_prices').select('*').eq('user_id', userId)
  if (error) {
    console.error('[Supabase vendor_prices] fetch error:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => vendorPriceFromDb(row))
}

export async function upsertVendorPrice(vp: VendorPrice, userId: string): Promise<void> {
  await safeUpsert({
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
