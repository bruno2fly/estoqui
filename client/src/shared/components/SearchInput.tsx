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
    <input
      type="search"
      role="searchbox"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      className={`
        w-full max-w-[300px] bg-input-bg border border-input-border text-fg
        px-2.5 py-2 rounded-lg text-sm
        placeholder:text-muted
        focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30
        ${className}
      `}
      {...props}
    />
  )
}
