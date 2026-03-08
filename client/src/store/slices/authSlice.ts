import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { loadAllUserData } from '@/lib/supabase/loadUserData'
import { sanitizeState } from '../middleware/sanitize'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  initialized: boolean
  dataLoaded: boolean

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  loadUserData: () => Promise<void>
}

// Import the main store dynamically to avoid circular deps
import type { PersistedState } from '@/types'

let _getMainStore: (() => { hydrateFromSupabase: (data: PersistedState) => void; clearStore: () => void }) | null = null
export function registerMainStore(getter: typeof _getMainStore) {
  _getMainStore = getter
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,
  dataLoaded: false,

  initialize: async () => {
    const TIMEOUT_MS = 8000
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Auth timeout')), TIMEOUT_MS)
    )

    try {
      const { data: { session } } = await Promise.race([
        supabase.auth.getSession(),
        timeoutPromise,
      ]) as Awaited<ReturnType<typeof supabase.auth.getSession>>
      if (session?.user) {
        set({ user: session.user, session, initialized: true })
        // Load user data in background (with timeout so we don't block forever)
        const loadPromise = get().loadUserData()
        await Promise.race([loadPromise, timeoutPromise]).catch(() => {
          console.warn('[auth] loadUserData timed out — continuing with empty data')
          set({ dataLoaded: true })
        })
      } else {
        set({ initialized: true })
      }
    } catch (err) {
      console.warn('[auth] Initialize failed:', err)
      set({ initialized: true })
    }

    // Listen for auth changes (token refresh, sign out from other tab, etc.)
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, session })
      if (!session?.user) {
        set({ dataLoaded: false })
        _getMainStore?.()?.clearStore()
      }
    })
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ loading: false })
      return { error: error.message }
    }
    set({ user: data.user, session: data.session, loading: false })
    await get().loadUserData()
    return { error: null }
  },

  signUp: async (email: string, password: string) => {
    set({ loading: true })
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      set({ loading: false })
      return { error: error.message }
    }
    // If email confirmation is disabled, user is signed in immediately
    if (data.user && data.session) {
      set({ user: data.user, session: data.session, loading: false })
      await get().loadUserData()
    } else {
      set({ loading: false })
    }
    return { error: null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, dataLoaded: false })
    _getMainStore?.()?.clearStore()
  },

  loadUserData: async () => {
    try {
      const data = await loadAllUserData()
      const sanitized = sanitizeState(data)
      _getMainStore?.()?.hydrateFromSupabase(sanitized)
      set({ dataLoaded: true })
    } catch (err) {
      console.error('[auth] Failed to load user data:', err)
      set({ dataLoaded: true }) // still mark as loaded to unblock UI
    }
  },
}))
