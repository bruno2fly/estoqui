/**
 * Global Supabase error emitter.
 * Store slices can't use React context (useToast), so they emit errors here.
 * The React ToastProvider subscribes and shows them.
 */

type ErrorListener = (message: string) => void

const listeners = new Set<ErrorListener>()

export function onSupabaseError(listener: ErrorListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitSupabaseError(context: string, error: unknown): void {
  let msg: string
  if (error instanceof Error) {
    msg = error.message
  } else if (error && typeof error === 'object' && 'message' in error) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string }
    msg = [e.message, e.code, e.details, e.hint].filter(Boolean).join(' | ')
  } else {
    msg = JSON.stringify(error) ?? String(error)
  }
  const full = `[${context}] ${msg}`
  console.error('[Supabase]', full)
  listeners.forEach((fn) => fn(full))
}
