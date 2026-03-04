import { supabase } from '@/lib/supabase'
import { orderToDb, orderFromDb } from './mappers'
import type { Order } from '@/types'

export async function fetchOrders(userId: string): Promise<Order[]> {
  const { data, error } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) {
    console.error('[Supabase orders] fetch error:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => orderFromDb(row))
}

export async function createOrder(order: Order, userId: string): Promise<void> {
  const row = orderToDb(order, userId)
  const { error } = await supabase.from('orders').insert(row)
  if (error) {
    // If a column doesn't exist, try stripping it
    if (/column.*does not exist|Could not find/i.test(error.message)) {
      console.warn('[orders] Retrying insert with minimal fields')
      const { error: e2 } = await supabase.from('orders').insert({
        id: row.id,
        user_id: row.user_id,
        created_at: row.created_at,
        total: row.total,
        totals_by_vendor: row.totals_by_vendor,
        lines: row.lines,
      })
      if (e2) throw e2
      return
    }
    throw error
  }
}
