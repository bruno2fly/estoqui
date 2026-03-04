import { supabase } from '@/lib/supabase'
import { settingsToDb, settingsFromDb } from './mappers'
import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

export async function fetchSettings(userId: string): Promise<AppSettings> {
  const { data, error } = await supabase.from('settings').select('*').eq('user_id', userId).limit(1).maybeSingle()
  if (error) {
    console.error('[Supabase settings] fetch error:', error)
    throw error
  }
  if (!data) return { ...DEFAULT_SETTINGS }
  return settingsFromDb(data as Record<string, unknown>)
}

export async function upsertSettings(settings: AppSettings, userId: string): Promise<void> {
  const row = settingsToDb(settings, userId)
  const { error } = await supabase.from('settings').upsert(row, { onConflict: 'user_id' })
  if (error) {
    // If onConflict constraint doesn't exist, try insert
    if (/no unique or exclusion constraint/i.test(error.message)) {
      console.warn('[settings] No unique constraint on user_id, trying insert')
      const { error: e2 } = await supabase.from('settings').insert(row)
      if (e2) throw e2
      return
    }
    throw error
  }
}
