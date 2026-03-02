import { type ReactNode } from 'react'

export interface CardProps {
  title?: string
  children: ReactNode
  className?: string
}

export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-surface border border-surface-border rounded-xl p-6 ${className}`}
    >
      {title && (
        <h3 className="text-base font-semibold text-fg mb-5">{title}</h3>
      )}
      {children}
    </div>
  )
}
