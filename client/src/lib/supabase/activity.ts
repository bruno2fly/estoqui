import { supabase } from '@/lib/supabase'
import { activityToDb, activityFromDb } from './mappers'
import type { Activity } from '@/types'

export async function fetchActivity(): Promise<Activity[]> {
  const { data, error } = await supabase.from('activity').select('*').order('date', { ascending: false }).limit(50)
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => activityFromDb(row))
}

export async function createActivity(activity: Activity, userId: string): Promise<void> {
  const { error } = await supabase.from('activity').insert(activityToDb(activity, userId))
  if (error) throw error
}
