/**
 * Error tracking wrapper. Plug in Sentry, LogRocket, etc. when ready.
 * Call from ErrorBoundary and key catch blocks.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.error('[reportError]', error, context)
    return
  }
  // TODO: Sentry.captureException(error, { extra: context })
  // For now, errors are only logged in dev
}
