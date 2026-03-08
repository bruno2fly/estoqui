import { useState, useRef, useEffect } from 'react'

/**
 * A simple info icon (ⓘ) that shows a tooltip on click.
 * Uses easy, non-technical language for users who aren't tech-savvy.
 */
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="w-4 h-4 rounded-full border border-fg-secondary/40 text-fg-secondary/60 hover:text-fg hover:border-fg transition-colors flex items-center justify-center text-[10px] font-bold leading-none shrink-0"
        aria-label="More info"
      >
        i
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-fg text-background text-[11px] leading-relaxed rounded-lg px-3 py-2 shadow-lg">
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-fg" />
          {text}
        </div>
      )}
    </div>
  )
}
