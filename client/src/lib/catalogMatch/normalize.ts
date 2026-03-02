/**
 * Text normalization and tokenization for product matching.
 *
 * Handles Brazilian Portuguese accents, common abbreviations, and
 * grocery-specific stopwords that add noise to similarity scoring.
 */

/* ── Portuguese / grocery stopwords ──────────────────────────────────────── */

const STOPWORDS = new Set([
  'em', 'de', 'do', 'da', 'dos', 'das', 'com', 'sem', 'para', 'por',
  'ao', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'uns', 'umas',
  'e', 'ou', 'o', 'a', 'os', 'as',
  'po', 'tipo', 'lata', 'sache', 'sachet', 'pacote', 'pct', 'pote',
  'garrafa', 'grf', 'pet', 'tp', 'und', 'unid', 'unidade', 'cx', 'caixa',
  'fardo', 'display', 'dsp', 'bandeja', 'bdj',
  'sabor', 'sab',
])

/* ── Core normalizer ─────────────────────────────────────────────────────── */

/**
 * Lowercase, strip accents, remove punctuation, collapse whitespace.
 * Keeps digits and latin letters only.
 */
export function normalizeText(input: string): string {
  if (!input) return ''
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')      // punctuation -> space
    .replace(/\s+/g, ' ')              // collapse spaces
    .trim()
}

/* ── Tokenizer ───────────────────────────────────────────────────────────── */

/**
 * Split normalized string into tokens, removing stopwords and
 * single-character noise tokens (except digits that carry meaning).
 */
export function tokenize(normalizedName: string): string[] {
  const raw = normalizedName.split(' ')
  return raw.filter((t) => {
    if (!t) return false
    if (STOPWORDS.has(t)) return false
    // keep single digits (e.g. "2" in "2.0") but drop single letters
    if (t.length === 1 && !/\d/.test(t)) return false
    return true
  })
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token)
}
