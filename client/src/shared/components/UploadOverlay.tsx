import { useEffect, useState } from 'react'

export interface UploadOverlayProps {
  /** 'loading' = show spinner, 'success' = show result, 'error' = show error, null = hidden */
  status: 'loading' | 'success' | 'error' | null
  /** Message shown while loading (e.g. "Processing CSV...") */
  loadingMessage?: string
  /** Message shown on success (e.g. "5161 products imported") */
  resultMessage?: string
  /** Called when user clicks "Close" or the backdrop */
  onClose: () => void
}

export function UploadOverlay({
  status,
  loadingMessage = 'Processing your file...',
  resultMessage = '',
  onClose,
}: UploadOverlayProps) {
  const [dots, setDots] = useState('')

  // Animate loading dots
  useEffect(() => {
    if (status !== 'loading') return
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'))
    }, 500)
    return () => clearInterval(interval)
  }, [status])

  if (!status) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface border border-surface-border rounded-2xl p-8 max-w-md mx-4 shadow-2xl text-center space-y-4 animate-in">
        {/* Loading state */}
        {status === 'loading' && (
          <>
            <div className="flex justify-center">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-surface-border" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              </div>
            </div>
            <p className="text-lg font-semibold text-fg">
              {loadingMessage}{dots}
            </p>
            <p className="text-sm text-muted">
              Please wait — don't close or navigate away
            </p>
          </>
        )}

        {/* Success state */}
        {status === 'success' && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
            <p className="text-lg font-semibold text-fg">Upload Complete!</p>
            <p className="text-sm text-fg-secondary leading-relaxed">{resultMessage}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </>
        )}

        {/* Error state */}
        {status === 'error' && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
            </div>
            <p className="text-lg font-semibold text-fg">Upload Failed</p>
            <p className="text-sm text-fg-secondary leading-relaxed">{resultMessage}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-xl bg-surface-hover text-fg text-sm font-semibold border border-surface-border hover:bg-surface-hover/80 transition-colors"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
