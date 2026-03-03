import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/slices/authSlice'

export function ProtectedRoute() {
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)
  const dataLoaded = useAuthStore((s) => s.dataLoaded)

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
