import { type ReactNode } from 'react'

type Variant = 'fresh' | 'stale' | 'neutral'

const variantClasses: Record<Variant, string> = {
  fresh: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  stale: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
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
        inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  )
}
