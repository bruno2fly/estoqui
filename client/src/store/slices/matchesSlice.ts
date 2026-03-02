import type { Matches } from '@/types'
import type { StateSetter, StateGetter } from '../types'

export const initialMatchesState = {
  matches: {} as Matches,
}

export function getMatchesActions(set: StateSetter, _get: StateGetter) {
  return {
    setMatch: (key: string, productId: string) => {
      set((s) => ({ matches: { ...s.matches, [key]: productId } }))
    },
    deleteMatch: (key: string) => {
      set((s) => {
        const next = { ...s.matches }
        delete next[key]
        return { matches: next }
      })
    },
  }
}
