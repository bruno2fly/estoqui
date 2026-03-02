import { type ReactNode } from 'react'

export interface EmptyStateProps {
  message: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ message, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`text-center py-10 text-muted text-sm ${className}`}
      role="status"
    >
      <p>{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
