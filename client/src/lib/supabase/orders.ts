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
    console.error('[Supabase orders] insert error:', error)
    throw error
  }
}
