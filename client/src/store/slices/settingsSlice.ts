import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { supabase } from '@/lib/supabase'
import { upsertSettings } from '@/lib/supabase/settings'

export const initialSettingsState = {
  settings: { ...DEFAULT_SETTINGS } as AppSettings,
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? ''
}

export function getSettingsActions(set: StateSetter, _get: StateGetter) {
  return {
    setSettings: (updates: Partial<AppSettings>) => {
      set((s) => ({ settings: { ...s.settings, ...updates } }))
      getUid().then(uid => {
        if (!uid) return
        const settings = _get().settings
        upsertSettings(settings, uid).catch(console.error)
      })
    },
    resetSettings: () => {
      set(() => ({ settings: { ...DEFAULT_SETTINGS } }))
      getUid().then(uid => {
        if (uid) upsertSettings({ ...DEFAULT_SETTINGS }, uid).catch(console.error)
      })
    },
  }
}
