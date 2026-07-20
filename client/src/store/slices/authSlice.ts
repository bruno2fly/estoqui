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
  /**
   * Cross-product entitlement gate. The Software is only unlocked for the
   * 'software_app' tier (the $299 "App + Software" plan). Read from the shared
   * `entitlements` table, written by the App's Stripe webhook.
   *   null  = not checked yet
   *   true  = tier is 'software_app' → allowed
   *   false = no entitlement / App-only / error → locked (default-deny)
   */
  entitled: boolean | null

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  loadUserData: () => Promise<void>
  checkEntitlement: () => Promise<void>
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
  entitled: null,

  initialize: async () => {
    const TIMEOUT_MS = 5000 // only for session check, not data loading

    try {
      const { data: { session } } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auth session check timeout')), TIMEOUT_MS)
        ),
      ]) as Awaited<ReturnType<typeof supabase.auth.getSession>>

      if (session?.user) {
        set({ user: session.user, session, initialized: true })
        void get().checkEntitlement()
        // Load data in background — don't block the login screen
        get().loadUserData().catch(() => {
          console.warn('[auth] loadUserData failed on init — continuing with empty data')
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
        set({ dataLoaded: false, entitled: null })
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
    // Set user immediately so navigation works, then load data in background
    set({ user: data.user, session: data.session, loading: false })
    void get().checkEntitlement()
    // Don't await — let the ProtectedRoute show "Loading your inventory..."
    // while data downloads in the background
    get().loadUserData().catch((err) => {
      console.error('[auth] Failed to load data after sign-in:', err)
      set({ dataLoaded: true }) // unblock UI even on failure
    })
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
      void get().checkEntitlement()
      get().loadUserData().catch((err) => {
        console.error('[auth] Failed to load data after sign-up:', err)
        set({ dataLoaded: true })
      })
    } else {
      set({ loading: false })
    }
    return { error: null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, dataLoaded: false, entitled: null })
    _getMainStore?.()?.clearStore()
  },

  checkEntitlement: async () => {
    const uid = get().user?.id
    if (!uid) {
      set({ entitled: false })
      return
    }
    try {
      const { data, error } = await supabase
        .from('entitlements')
        .select('tier')
        .eq('user_id', uid)
        .maybeSingle()
      if (error) throw error
      // Default-deny: only the 'software_app' tier unlocks the Software.
      set({ entitled: data?.tier === 'software_app' })
    } catch (err) {
      console.error('[auth] entitlement check failed', err)
      set({ entitled: false }) // deny on error; the Locked screen offers a retry
    }
  },

  loadUserData: async () => {
    const DATA_TIMEOUT_MS = 30000 // 30s max for all data fetches
    try {
      const data = await Promise.race([
        loadAllUserData(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Data load timeout (30s)')), DATA_TIMEOUT_MS)
        ),
      ])
      const sanitized = sanitizeState(data)
      _getMainStore?.()?.hydrateFromSupabase(sanitized)
      set({ dataLoaded: true })
    } catch (err) {
      console.error('[auth] Failed to load user data:', err)
      set({ dataLoaded: true }) // still mark as loaded to unblock UI
    }
  },
}))
