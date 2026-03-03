import { supabase } from '@/lib/supabase'
import { stockSnapshotToDb, stockSnapshotFromDb } from './mappers'
import type { StockSnapshot } from '@/types'

export async function fetchStockSnapshots(): Promise<StockSnapshot[]> {
  const { data, error } = await supabase.from('stock_snapshots').select('*').order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => stockSnapshotFromDb(row))
}

export async function upsertStockSnapshot(snapshot: StockSnapshot, userId: string): Promise<void> {
  const { error } = await supabase.from('stock_snapshots').upsert(
    stockSnapshotToDb(snapshot, userId),
    { onConflict: 'id' }
  )
  if (error) throw error
}

export async function deleteStockSnapshot(id: string): Promise<void> {
  const { error } = await supabase.from('stock_snapshots').delete().eq('id', id)
  if (error) throw error
}
