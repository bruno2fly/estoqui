import { supabase } from '@/lib/supabase'
import { activityToDb, activityFromDb } from './mappers'
import type { Activity } from '@/types'

export async function fetchActivity(userId: string): Promise<Activity[]> {
  const { data, error } = await supabase.from('activity').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(50)
  if (error) {
    console.error('[Supabase activity] fetch error:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => activityFromDb(row))
}

export async function createActivity(activity: Activity, userId: string): Promise<void> {
  const { error } = await supabase.from('activity').insert(activityToDb(activity, userId))
  if (error) {
    console.error('[Supabase activity] insert error:', error)
    throw error
  }
}
