import { supabase } from '@/lib/supabase'
import { orderToDb, orderFromDb } from './mappers'
import type { Order } from '@/types'

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => orderFromDb(row))
}

export async function createOrder(order: Order, userId: string): Promise<void> {
  const { error } = await supabase.from('orders').insert(orderToDb(order, userId))
  if (error) throw error
}
