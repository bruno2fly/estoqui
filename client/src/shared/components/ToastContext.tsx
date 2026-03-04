import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { onSupabaseError } from '@/lib/supabase/errorEmitter'

type ToastVariant = 'success' | 'error'

interface ToastMessage {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, variant === 'error' ? 5000 : 3000)
  }, [])

  // Subscribe to Supabase write errors globally
  useEffect(() => {
    return onSupabaseError((msg) => {
      show(`Save failed: ${msg}`, 'error')
    })
  }, [show])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {createPortal(
        <div
          className="fixed bottom-5 right-5 z-[2000] flex flex-col gap-2"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`
                px-5 py-3 rounded-md text-sm font-medium shadow-lg
                animate-slideIn
                ${t.variant === 'error' ? 'bg-danger text-white' : 'bg-success text-white'}
              `}
            >
              {t.message}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
