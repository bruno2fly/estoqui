import type { PersistedState } from '@/types'

/** Full store state (persisted state + all actions). */
export type StoreState = PersistedState

export type StateSetter = (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => void
export type StateGetter = () => StoreState
