import type { Activity } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'
import { supabase } from '@/lib/supabase'
import { createActivity as dbCreateActivity } from '@/lib/supabase/activity'
import { emitSupabaseError } from '@/lib/supabase/errorEmitter'

const MAX_ACTIVITY = 50

export const initialActivityState = {
  activity: [] as Activity[],
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? ''
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
      getUid().then(uid => { if (uid) dbCreateActivity(a, uid).catch((e) => emitSupabaseError('Save activity', e)) })
    },
  }
}
