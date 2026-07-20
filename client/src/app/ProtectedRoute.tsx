import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/slices/authSlice'
import { Locked } from '@/app/Locked'

export function ProtectedRoute() {
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)
  const dataLoaded = useAuthStore((s) => s.dataLoaded)
  const entitled = useAuthStore((s) => s.entitled)

  // Still checking auth state
  if (!initialized) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted">Loading...</p>
        </div>
      </div>
    )
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Verifying plan (entitlement not resolved yet)
  if (entitled === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted">Checking your plan…</p>
        </div>
      </div>
    )
  }

  // Signed in, but the plan doesn't include the Software → hard gate.
  if (!entitled) {
    return <Locked />
  }

  // Authenticated but still loading data
  if (!dataLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted">Loading your inventory...</p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
