import { ReactNode, useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider, ErrorBoundary } from '@/shared/components'
import { useAuthStore } from '@/store/slices/authSlice'

function AuthInitializer({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize)
  useEffect(() => {
    initialize()
  }, [initialize])
  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthInitializer>{children}</AuthInitializer>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
