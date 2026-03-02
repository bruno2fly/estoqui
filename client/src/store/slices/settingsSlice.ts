import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import type { StateSetter, StateGetter } from '../types'

export const initialSettingsState = {
  settings: { ...DEFAULT_SETTINGS } as AppSettings,
}

export function getSettingsActions(set: StateSetter, _get: StateGetter) {
  return {
    setSettings: (updates: Partial<AppSettings>) => {
      set((s) => ({ settings: { ...s.settings, ...updates } }))
    },
    resetSettings: () => {
      set(() => ({ settings: { ...DEFAULT_SETTINGS } }))
    },
  }
}
