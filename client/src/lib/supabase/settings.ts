import { supabase } from '@/lib/supabase'
import { settingsToDb, settingsFromDb } from './mappers'
import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

export async function fetchSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle()
  if (error) throw error
  if (!data) return { ...DEFAULT_SETTINGS }
  return settingsFromDb(data as Record<string, unknown>)
}

export async function upsertSettings(settings: AppSettings, userId: string): Promise<void> {
  const { error } = await supabase.from('settings').upsert(
    settingsToDb(settings, userId),
    { onConflict: 'user_id' }
  )
  if (error) throw error
}
