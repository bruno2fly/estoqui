import { type InputHTMLAttributes } from 'react'

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function Toggle({
  label,
  checked,
  onCheckedChange,
  id,
  className = '',
  ...props
}: ToggleProps) {
  const inputId = id ?? (label ? `toggle-${label.replace(/\s+/g, '-')}` : undefined)
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={inputId}
        onClick={() => onCheckedChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 shrink-0 rounded-full
          transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
          ${checked ? 'bg-primary' : 'bg-surface-border'}
        `}
        {...(props as object)}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0
            transition-transform mt-0.5 ml-0.5
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
      {label && (
        <label htmlFor={inputId} className="text-sm text-fg-secondary cursor-pointer">
          {label}
        </label>
      )}
    </div>
  )
}
