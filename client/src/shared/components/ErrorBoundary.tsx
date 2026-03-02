import { Component, type ReactNode } from 'react'
import { reportError } from '@/shared/lib/errorTracking'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportError(error, { componentStack: errorInfo.componentStack })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center gap-4 p-6 bg-surface border border-surface-border rounded-2xl">
          <p className="text-fg font-medium text-center">
            Something went wrong. Please try again.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
