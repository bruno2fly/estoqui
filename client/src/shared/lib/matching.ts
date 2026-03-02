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

/**
 * Match priority:
 *   1. SKU exact match (normalized) against product.sku
 *   2. Cached name|brand match from matches store
 *   3. Exact name+brand match
 *   4. Name-only match (if unique)
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
