import { supabase } from '@/lib/supabase'
import { vendorToDb, vendorFromDb } from './mappers'
import { safeUpsert } from './safeUpsert'
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
  await safeUpsert({
    table: 'vendors',
    data: vendorToDb(vendor, userId),
    onConflict: 'id',
  })
}

export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase.from('vendors').delete().eq('id', id)
  if (error) {
    console.error('[Supabase vendors] delete error:', error)
    throw error
  }
}
