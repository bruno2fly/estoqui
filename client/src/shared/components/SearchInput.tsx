import { useState, useEffect, useRef, type InputHTMLAttributes } from 'react'

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  debounceMs?: number
  placeholder?: string
}

export function SearchInput({
  value,
  onChange,
  debounceMs = 200,
  placeholder = 'Buscar...',
  className = '',
  ...props
}: SearchInputProps) {
  const [local, setLocal] = useState(value)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    if (debounceMs <= 0) {
      onChange(local)
      return
    }
    timeoutRef.current = setTimeout(() => {
      onChange(local)
    }, debounceMs)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [local, debounceMs, onChange])

  return (
    <div className="relative w-full max-w-[300px]">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        role="searchbox"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className={`
          w-full bg-input-bg border border-input-border text-fg
          pl-9 pr-3 py-2 rounded-xl text-sm
          placeholder:text-muted
          transition-colors
          focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
          ${className}
        `}
        {...props}
      />
    </div>
  )
}
