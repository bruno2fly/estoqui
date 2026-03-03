import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Hardcoded credentials (swap for API call later) ─────────────────────────
const VALID_USERNAME = 'admin'
const VALID_PASSWORD = 'estoqui2024'

interface AuthState {
  isAuthenticated: boolean
  login: (username: string, password: string) => boolean
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      login: (username: string, password: string) => {
        const ok = username === VALID_USERNAME && password === VALID_PASSWORD
        if (ok) set({ isAuthenticated: true })
        return ok
      },
      logout: () => set({ isAuthenticated: false }),
    }),
    {
      name: 'estoqui:v1:auth',
      partialize: (state) => ({ isAuthenticated: state.isAuthenticated }),
    }
  )
)
