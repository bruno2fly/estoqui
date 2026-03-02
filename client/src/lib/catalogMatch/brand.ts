/**
 * Brand detection and learning system.
 *
 * Uses a persisted dictionary (BrandDictionary) mapping normalized keys
 * to canonical display names. Detects multi-token brands ("3 CORACOES",
 * "DOIS FRADES") and single-token brands ("NESCAU", "TODDY") from the
 * START of a product name.
 *
 * To expand DEFAULT_BRANDS: add entries as `'normalized key': 'DISPLAY NAME'`.
 * Multi-token brands are matched as contiguous phrases from the beginning
 * of the product name. The dictionary is merged with user-learned brands
 * at runtime so additions here are safe and non-destructive.
 */

import { normalizeText, tokenize } from './normalize'

/* ── Types ───────────────────────────────────────────────────────────────── */

/** Normalized lowercase key -> canonical UPPERCASE display name */
export type BrandDictionary = Record<string, string>

export interface BrandHit {
  brand: string          // display name (e.g. "3 CORACOES")
  brandKey: string       // normalized key (e.g. "3 coracoes")
  inferred: boolean      // true if fallback first-token heuristic was used
  matchedTokens: string[] // tokens consumed by the brand match
}

/* ── Default brand dictionary ────────────────────────────────────────────── */

export const DEFAULT_BRANDS: BrandDictionary = {
  // Multi-token brands (must come before single-token fallback)
  '3 coracoes': '3 CORACOES',
  'tres coracoes': '3 CORACOES',
  'dois frades': 'DOIS FRADES',
  'coca cola': 'COCA COLA',
  'tio joao': 'TIO JOAO',
  'oral b': 'ORAL B',
  'dona benta': 'DONA BENTA',
  'mae terra': 'MAE TERRA',
  'sao braz': 'SAO BRAZ',
  'santa amalia': 'SANTA AMALIA',

  // Single-token brands — Brazilian grocery staples
  'nescau': 'NESCAU',
  'toddy': 'TODDY',
  'sustagen': 'SUSTAGEN',
  'ovomaltine': 'OVOMALTINE',
  'ninho': 'NINHO',
  'nestle': 'NESTLE',
  'nescafe': 'NESCAFE',
  'maggi': 'MAGGI',
  'kitkat': 'KITKAT',
  'tang': 'TANG',
  'clight': 'CLIGHT',
  'fresh': 'FRESH',
  'sadia': 'SADIA',
  'perdigao': 'PERDIGAO',
  'seara': 'SEARA',
  'aurora': 'AURORA',
  'ype': 'YPE',
  'bombril': 'BOMBRIL',
  'limpol': 'LIMPOL',
  'cocacola': 'COCA COLA',
  'pepsi': 'PEPSI',
  'guarana': 'GUARANA',
  'fanta': 'FANTA',
  'sprite': 'SPRITE',
  'sukita': 'SUKITA',
  'heineken': 'HEINEKEN',
  'brahma': 'BRAHMA',
  'skol': 'SKOL',
  'antarctica': 'ANTARCTICA',
  'bauducco': 'BAUDUCCO',
  'parati': 'PARATI',
  'renata': 'RENATA',
  'adria': 'ADRIA',
  'vitarella': 'VITARELLA',
  'pilao': 'PILAO',
  'melitta': 'MELITTA',
  'quaker': 'QUAKER',
  'kellogs': 'KELLOGGS',
  'kelloggs': 'KELLOGGS',
  'camil': 'CAMIL',
  'kicaldo': 'KICALDO',
  'urbano': 'URBANO',
  'yoki': 'YOKI',
  'hikari': 'HIKARI',
  'fugini': 'FUGINI',
  'quero': 'QUERO',
  'elefante': 'ELEFANTE',
  'knorr': 'KNORR',
  'sazon': 'SAZON',
  'ajinomoto': 'AJINOMOTO',
  'hellmanns': 'HELLMANNS',
  'heinz': 'HEINZ',
  'tambau': 'TAMBAU',
  'palmolive': 'PALMOLIVE',
  'colgate': 'COLGATE',
  'protex': 'PROTEX',
  'omo': 'OMO',
  'ariel': 'ARIEL',
  'downy': 'DOWNY',
  'comfort': 'COMFORT',
  'elege': 'ELEGE',
  'italac': 'ITALAC',
  'piracanjuba': 'PIRACANJUBA',
  'parmalat': 'PARMALAT',
  'presidente': 'PRESIDENTE',
  'catupiry': 'CATUPIRY',
  'polenghi': 'POLENGHI',
  'triunfo': 'TRIUNFO',
  'mabel': 'MABEL',
  'marilan': 'MARILAN',
  'domino': 'DOMINO',
  'mavalerio': 'MAVALERIO',
  'paineiras': 'PAINEIRAS',
  'uniao': 'UNIAO',
  'zero cal': 'ZERO-CAL',
  'castello': 'CASTELLO',
  'ascend': 'ASCEND',
  'aloe vera': 'ALOE VERA',
  'da colonia': 'DA COLONIA',
}

/* ── Detection ───────────────────────────────────────────────────────────── */

/**
 * Detect brand from the START of a product name using the dictionary.
 *
 * Uses RAW normalized words (not stopword-filtered tokens) for phrase matching
 * so multi-token brands containing stopwords like "DA COLONIA" still work.
 * Falls back to the first non-stopword token (inferred=true).
 */
export function detectBrandFromName(
  rawName: string,
  brandDict: BrandDictionary
): BrandHit {
  const normalized = normalizeText(rawName)
  // Raw words: split by space WITHOUT removing stopwords
  const rawWords = normalized.split(' ').filter(Boolean)
  // Filtered tokens: for the inferred fallback
  const tokens = tokenize(normalized)

  if (rawWords.length === 0) {
    return { brand: '', brandKey: '', inferred: true, matchedTokens: [] }
  }

  // Try 3-word, 2-word, 1-word phrases from the start of the raw name
  for (const n of [3, 2, 1]) {
    if (rawWords.length < n) continue
    const phrase = rawWords.slice(0, n).join(' ')
    const display = brandDict[phrase]
    if (display) {
      // matchedTokens: the subset that appears in the tokenized array
      const matchedTokens = rawWords.slice(0, n).filter((w) => tokens.includes(w))
      return {
        brand: display,
        brandKey: phrase,
        inferred: false,
        matchedTokens,
      }
    }
  }

  // Fallback: first non-stopword token as inferred brand
  if (tokens.length >= 2) {
    return {
      brand: tokens[0].toUpperCase(),
      brandKey: tokens[0],
      inferred: true,
      matchedTokens: [tokens[0]],
    }
  }

  if (tokens.length === 1) {
    return {
      brand: tokens[0].toUpperCase(),
      brandKey: tokens[0],
      inferred: true,
      matchedTokens: [tokens[0]],
    }
  }

  return { brand: '', brandKey: '', inferred: true, matchedTokens: [] }
}

/* ── Token stripping ─────────────────────────────────────────────────────── */

/**
 * Remove brand tokens from the front of the token array.
 * Only strips if the tokens appear as a contiguous prefix.
 */
export function stripBrandTokens(
  tokens: string[],
  matchedTokens: string[]
): string[] {
  if (matchedTokens.length === 0) return tokens

  // Verify the matched tokens are at the start
  const allMatch = matchedTokens.every((mt, i) => tokens[i] === mt)
  if (allMatch) {
    return tokens.slice(matchedTokens.length)
  }

  // Fallback: filter them out wherever they appear
  const matchSet = new Set(matchedTokens)
  return tokens.filter((t) => !matchSet.has(t))
}

/* ── Learning helper ─────────────────────────────────────────────────────── */

/**
 * Derive the brand key from a product name for learning purposes.
 *
 * Checks the dictionary first to avoid overwriting a known multi-token brand
 * (e.g. user editing brand on a "3 CORACOES CAPPUCCINO" product shouldn't
 * learn "3 coracoes" → "CAPPUCCINO"; it should learn "cappuccino" → user value).
 *
 * @param rawName    The product name
 * @param brandDict  Optional dict to check existing entries (pass merged dict)
 */
export function deriveBrandKeyFromName(
  rawName: string,
  brandDict?: BrandDictionary
): string {
  const tokens = tokenize(normalizeText(rawName))
  if (tokens.length === 0) return ''

  // If a dictionary is provided, detect the actual brand first.
  // If the name starts with a known brand, the user is editing a NON-brand
  // token — learn using the FIRST token after the known brand.
  if (brandDict) {
    const hit = detectBrandFromName(rawName, brandDict)
    if (!hit.inferred && hit.matchedTokens.length > 0) {
      const remaining = tokens.slice(hit.matchedTokens.length)
      if (remaining.length > 0) {
        return remaining[0]
      }
      // Name is just the brand, learn the first token
      return tokens[0]
    }
  }

  return tokens[0]
}

/* ── Dev verification ────────────────────────────────────────────────────── */

/**
 * Quick smoke-test for brand detection. Call from browser console:
 *   import { verifyBrandDetection } from '@/lib/catalogMatch/brand'
 *   verifyBrandDetection()
 */
export function verifyBrandDetection(): void {
  const cases: [string, string][] = [
    ['3 CORACOES CHOCOLATE QUENTE', '3 CORACOES'],
    ['NESCAU BEBIDA PRONTA 180ML', 'NESCAU'],
    ['TIO JOAO ARROZ 10LB', 'TIO JOAO'],
    ['COCA COLA LATA 350ML', 'COCA COLA'],
    ['DOIS FRADES CHOCOLATE EM PO 200G', 'DOIS FRADES'],
    ['TODDY SACHE 1,8KG', 'TODDY'],
    ['SUSTAGEN KIDS MORANGO 380G', 'SUSTAGEN'],
  ]
  for (const [input, expected] of cases) {
    const hit = detectBrandFromName(input, DEFAULT_BRANDS)
    const ok = hit.brand === expected
    if (import.meta.env.DEV) {
      console[ok ? 'log' : 'error'](
        `${ok ? '✓' : '✗'} "${input}" → brand="${hit.brand}" (expected "${expected}") inferred=${hit.inferred}`
      )
    }
  }
}
