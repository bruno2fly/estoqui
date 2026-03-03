/**
 * Storage abstraction for Estoqui.
 * Legacy localStorage functions have been removed — all persistence is now through Supabase.
 * This file is kept for backward compatibility with any imports.
 */

/** Clear any remaining localStorage data (cleanup from migration). */
export function clearAllData(): void {
  const PREFIX = 'estoqui:v1:'
  const keys = [
    'inventory', 'vendors', 'vendorPrices', 'vendorPriceUploads',
    'stockSnapshots', 'matches', 'reorderDraft', 'orders', 'activity', 'settings', 'auth',
  ]
  keys.forEach((k) => {
    try { localStorage.removeItem(PREFIX + k) } catch { /* ignore */ }
  })
  try { localStorage.removeItem('estoquiState') } catch { /* ignore */ }
}
