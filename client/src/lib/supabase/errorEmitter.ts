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
  const msg = error instanceof Error ? error.message : String(error)
  const full = `[${context}] ${msg}`
  console.error('[Supabase]', full)
  listeners.forEach((fn) => fn(full))
}
