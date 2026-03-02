import type { PersistedState } from '@/types'

export function getStalenessThreshold(state: PersistedState): number {
  return state.settings?.stalenessThreshold ?? 45
}
