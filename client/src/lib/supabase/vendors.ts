import { supabase } from '@/lib/supabase'
import { vendorToDb, vendorFromDb } from './mappers'
import type { Vendor } from '@/types'

export async function fetchVendors(userId: string): Promise<Vendor[]> {
  const { data, error } = await supabase.from('vendors').select('*').eq('user_id', userId)
  if (error) {
    console.error('[Supabase vendors] fetch error:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => vendorFromDb(row))
}

export async function upsertVendor(vendor: Vendor, userId: string): Promise<void> {
  const { error } = await supabase.from('vendors').upsert(vendorToDb(vendor, userId), { onConflict: 'id' })
  if (error) {
    console.error('[Supabase vendors] upsert error:', error)
    throw error
  }
}

export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase.from('vendors').delete().eq('id', id)
  if (error) {
    console.error('[Supabase vendors] delete error:', error)
    throw error
  }
}
