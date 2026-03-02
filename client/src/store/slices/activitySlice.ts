import type { Activity } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'

const MAX_ACTIVITY = 50

export const initialActivityState = {
  activity: [] as Activity[],
}

export function getActivityActions(set: StateSetter, _get: StateGetter) {
  return {
    addActivity: (type: string, description: string) => {
      const a: Activity = {
        id: generateId(),
        type,
        description,
        date: new Date().toISOString(),
      }
      set((s) => ({
        activity: [a, ...s.activity].slice(0, MAX_ACTIVITY),
      }))
    },
  }
}
