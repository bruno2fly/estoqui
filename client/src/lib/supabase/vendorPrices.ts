import { supabase } from '@/lib/supabase'
import { vendorPriceToDb, vendorPriceFromDb } from './mappers'
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
  const { error } = await supabase.from('vendor_prices').upsert(
    vendorPriceToDb(vp, userId),
    { onConflict: 'user_id,vendor_id,product_id' }
  )
  if (error) {
    console.error('[Supabase vendor_prices] upsert error:', error)
    throw error
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
