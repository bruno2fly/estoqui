import type { Product } from '@/types'
import type { Matches } from '@/types'

export function normalize(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeForMatch(str: string): string {
  return normalize(str)
    .replace(/,?\s*(imported|import|importado)\s*$/i, '')
    .trim()
}

export function normalizeSku(sku: string): string {
  if (!sku) return ''
  return sku.trim().toLowerCase().replace(/[\s\-_]+/g, '')
}

export function matchKey(name: string, brand: string): string {
  return normalizeForMatch(name) + '|' + normalizeForMatch(brand)
}

// ── Fuzzy matching helpers ────────────────────────────────────────────────

/**
 * Strip case-pack notation ("24 x 12 oz", "Fr 24 X 500MI") and unit info
 * to get the core product identity for fuzzy matching.
 * e.g. "Detergente Ype Coco Fr 24 X 500MI" → "detergente ype coco"
 * e.g. "La Cascada Fresa / Strawberry 24 x 12 oz Bottle" → "la cascada fresa strawberry"
 */
function stripPackAndSize(text: string): string {
  return normalize(text)
    // Remove "Fr" / "Frd" before pack notation (common in Brazilian vendor lists)
    .replace(/\bfr(?:d)?\b/gi, ' ')
    // Remove pack notation: "24 x 500ml", "6x2 lts", "24 x 12 oz bottle"
    .replace(/\b\d{1,4}\s*x\s*\d*[.\d]*\s*(?:oz|g|gr|kg|lb|ml|l|lts?|gal)?\b[^,\n]*/gi, ' ')
    // Remove standalone sizes: "500ml", "1.5l", "12oz", "2kg", "4lbs"
    .replace(/\b\d+(?:\.\d+)?\s*(?:oz|g|gr|kg|lb|lbs?|ml|l|lts?|gal)\b/gi, ' ')
    // Remove standalone numbers that look like sizes or weights
    .replace(/\b\d{1,5}\s*(?:ea|un|und|pcs?|pack|ct)\b/gi, ' ')
    // Remove special chars and slash (used for bilingual names)
    .replace(/[\/\-()]/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract meaningful tokens for comparison (words ≥ 2 chars, no stop words).
 */
function meaningfulTokens(text: string): string[] {
  const STOP_WORDS = new Set([
    'de', 'do', 'da', 'dos', 'das', 'em', 'com', 'para', 'por', 'um', 'uma',
    'the', 'and', 'or', 'for', 'with', 'in', 'of', 'to', 'a', 'an',
    'ea', 'un', 'und', 'pc', 'pcs', 'pack', 'ct',
  ])
  return stripPackAndSize(text)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
}

/**
 * Token overlap score between two product descriptions.
 * Returns value between 0 and 1.
 * Uses Jaccard-like similarity but weighted toward the smaller set.
 */
function tokenOverlapScore(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const setB = new Set(tokensB)
  let hits = 0
  for (const t of tokensA) {
    if (setB.has(t)) hits++
  }
  // Use smaller set as denominator so partial matches score higher
  const minLen = Math.min(tokensA.length, tokensB.length)
  return hits / minLen
}

/**
 * Fuzzy match a vendor product name against the store catalog.
 * Returns the best matching product above the threshold, or null.
 *
 * Strategy:
 *  1. Strip pack notation and sizes from both names
 *  2. Tokenize into meaningful words
 *  3. Score by token overlap
 *  4. Return best match above 0.75 threshold (if unique enough)
 */
export function fuzzyMatchProduct(
  vendorName: string,
  products: Product[],
  threshold = 0.75
): Product | null {
  const vendorTokens = meaningfulTokens(vendorName)
  if (vendorTokens.length === 0) return null

  let bestProduct: Product | null = null
  let bestScore = 0
  let secondBestScore = 0

  for (const product of products) {
    const prodTokens = meaningfulTokens(product.name)
    const score = tokenOverlapScore(vendorTokens, prodTokens)
    if (score > bestScore) {
      secondBestScore = bestScore
      bestScore = score
      bestProduct = product
    } else if (score > secondBestScore) {
      secondBestScore = score
    }
  }

  // Require clear winner: best must be above threshold AND
  // significantly better than second-best (avoid ambiguous matches)
  if (bestScore >= threshold && bestScore - secondBestScore >= 0.1) {
    return bestProduct
  }

  // If perfect score with no ambiguity, accept even with close second
  if (bestScore >= 0.95) return bestProduct

  return null
}

/**
 * Match priority:
 *   1. SKU exact match (normalized) against product.sku
 *   2. Cached name|brand match from matches store
 *   3. Exact name+brand match
 *   4. Name-only match (if unique)
 *   5. Fuzzy token-based match (strips pack notation, compares core words)
 */
export function findProductMatch(
  rawName: string,
  rawBrand: string,
  products: Product[],
  matches: Matches,
  rawSku?: string
): string | null {
  if (rawSku) {
    const cleanSku = normalizeSku(rawSku)
    if (cleanSku) {
      const skuMatch = products.find(
        (p) => p.sku && normalizeSku(p.sku) === cleanSku
      )
      if (skuMatch) return skuMatch.id
    }
  }

  const key = matchKey(rawName, rawBrand)
  if (matches[key]) return matches[key]

  const cleanName = normalizeForMatch(rawName)
  const cleanBrand = normalizeForMatch(rawBrand)

  for (const product of products) {
    if (
      normalizeForMatch(product.name) === cleanName &&
      normalizeForMatch(product.brand) === cleanBrand
    ) {
      return product.id
    }
  }

  if (cleanName) {
    const nameOnlyMatches = products.filter(
      (p) => normalizeForMatch(p.name) === cleanName
    )
    if (nameOnlyMatches.length === 1) return nameOnlyMatches[0].id
  }

  // 5. Fuzzy match — strips pack notation and sizes, compares core tokens
  const fuzzyMatch = fuzzyMatchProduct(rawName, products)
  if (fuzzyMatch) return fuzzyMatch.id

  return null
}

export function findProductByNameAndBrand(
  name: string,
  brand: string,
  products: Product[],
  matches: Matches,
  sku?: string
): Product | null {
  const id = findProductMatch(name, brand, products, matches, sku)
  return id ? products.find((p) => p.id === id) ?? null : null
}
