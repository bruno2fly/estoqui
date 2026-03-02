import { ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider, ErrorBoundary } from '@/shared/components'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>{children}</ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
