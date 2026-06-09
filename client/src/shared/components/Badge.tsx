import { type ReactNode } from 'react'

type Variant = 'fresh' | 'stale' | 'neutral'

const variantClasses: Record<Variant, string> = {
  fresh: 'border border-success/30 bg-success-bg text-success',
  stale: 'border border-danger/30 bg-danger-bg text-danger',
  neutral: 'border border-surface-border bg-surface-hover text-fg-secondary',
}

export interface BadgeProps {
  variant?: Variant
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  )
}
