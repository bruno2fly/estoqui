import { type ReactNode } from 'react'

export interface SkeletonProps {
  className?: string
  children?: ReactNode
}

export function Skeleton({ className = '', children }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-surface-border ${className}`}
      aria-hidden
    >
      {children}
    </div>
  )
}

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-4 ${className}`} />
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
