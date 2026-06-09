import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'

export interface FileUploadProps {
  accept?: string
  onFile: (file: File) => void
  label?: string
  hint?: string
}

export function FileUpload({
  accept = '.csv',
  onFile,
  label = 'Arraste um arquivo ou clique para selecionar',
  hint,
}: FileUploadProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => setDragging(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        role="button"
        tabIndex={0}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={`
          flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl px-5 py-8 cursor-pointer transition-colors text-center
          ${dragging
            ? 'border-primary bg-primary/5'
            : 'border-surface-border hover:border-primary/40 hover:bg-surface-hover'}
        `}
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-medium text-fg">{label}</p>
          {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        aria-label="Selecionar arquivo"
      />
    </div>
  )
}
