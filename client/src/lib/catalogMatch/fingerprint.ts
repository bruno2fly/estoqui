const NOISE_TOKENS = new Set([
  'tradicional', 'original', 'novo', 'oferta', 'promo', 'und', 'un', 'pc', 'pct', 'c/', 'com', 'sem',
])

export function normalizeText(s: string): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\sx\d.-]/g, '')
    .split(/\s+/)
    .filter((t) => !NOISE_TOKENS.has(t))
    .join(' ')
}

export function extractPackTokens(name: string): string {
  const patterns = [
    /\b(\d+)x(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\b/gi,
    /\b(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\b/gi,
    /\b(\d+)\s*x\s*(\d+)\b/gi,
  ]
  for (const re of patterns) {
    const m = name.match(re)
    if (m) return m.map((x) => x.toLowerCase().replace(/\s+/g, '')).join(' ')
  }
  return ''
}

export function makeFingerprint(name: string, brand?: string): string {
  const base = normalizeText(name)
  const b = normalizeText(brand ?? '')
  const pack = extractPackTokens(name)
  const parts = [b, base, pack].filter(Boolean)
  return parts.join('|').replace(/\|+/g, '|').replace(/^\|+|\|+$/g, '')
}
