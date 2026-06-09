import { type ReactNode } from 'react'

export interface EmptyStateProps {
  message: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ message, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-surface-border bg-surface/50 px-6 py-12 text-center ${className}`}
      role="status"
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-surface-hover text-muted">
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </span>
      <p className="text-sm text-fg-secondary">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
