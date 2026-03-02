import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = '800px' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const content = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/40 dark:bg-black/70 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-surface border border-surface-border rounded-xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-surface-border">
          <h2 id="modal-title" className="text-lg font-semibold text-fg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
