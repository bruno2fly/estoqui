import type { PackType, PriceBasis } from '@/types'

export interface PackInfo {
  packType: PackType
  unitsPerCase: number
  unitDescriptor: string
  priceBasis: PriceBasis
  parseVersion: number
}

// ── Normalization ────────────────────────────────────────────────────────────

/** Lowercase, replace multiplication signs with 'x', collapse whitespace, trim. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[×✕]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Pack detection ───────────────────────────────────────────────────────────

/**
 * Strict regex: N x <number><unit> (e.g. "24 x 12 oz bottle", "6x330ml cans")
 * Captures: group 1 = case count, group 2 = unit descriptor with size
 */
const STRICT_RE =
  /\b(\d{1,4})\s*x\s*(\d+(?:\.\d+)?\s*(?:oz|g|gr|kg|lb|ml|l)\b[^\n\r]*)/i

/**
 * Loose fallback: N x <anything> (e.g. "12 x small bottles")
 * Captures: group 1 = case count, group 2 = rest of text
 */
const LOOSE_RE = /\b(\d{1,4})\s*x\s*([^\n\r]+)/i

/** Extract standalone unit size from text (e.g. "12gr", "500ml", "2.5kg") */
const UNIT_SIZE_RE = /(\d+(?:\.\d+)?\s*(?:oz|g|gr|kg|lb|ml|l))\b/i

/**
 * Parse a product description and detect case-pack vs. single-unit pricing.
 *
 * "Strawberry 24 x 12 oz Bottle" → CASE, 24 units, "12 oz bottle"
 * "Strawberry 12gr"              → UNIT, 1 unit,  "12gr"
 */
export function parsePackFromText(text: string): PackInfo {
  const normalized = normalizeText(text)

  // Try strict pattern first (N x <size><unit>)
  let match = STRICT_RE.exec(normalized)
  if (match) {
    const count = parseInt(match[1], 10)
    if (count > 1) {
      return {
        packType: 'CASE',
        unitsPerCase: count,
        unitDescriptor: match[2].trim(),
        priceBasis: 'PER_CASE',
        parseVersion: 1,
      }
    }
  }

  // Try loose pattern (N x <anything>)
  match = LOOSE_RE.exec(normalized)
  if (match) {
    const count = parseInt(match[1], 10)
    if (count > 1) {
      return {
        packType: 'CASE',
        unitsPerCase: count,
        unitDescriptor: match[2].trim(),
        priceBasis: 'PER_CASE',
        parseVersion: 1,
      }
    }
  }

  // No case pattern → UNIT
  const sizeMatch = UNIT_SIZE_RE.exec(normalized)
  return {
    packType: 'UNIT',
    unitsPerCase: 1,
    unitDescriptor: sizeMatch ? sizeMatch[1].trim() : '',
    priceBasis: 'PER_UNIT',
    parseVersion: 1,
  }
}

// ── Unit cost computation ────────────────────────────────────────────────────

/**
 * Compute effective per-unit cost.
 *
 * CASE + PER_CASE  → vendorPrice / unitsPerCase
 * CASE + PER_UNIT  → vendorPrice  (already per unit)
 * UNIT + PER_UNIT  → vendorPrice
 * UNIT + PER_CASE  → vendorPrice  (treat as per-unit; nonsensical combo)
 */
export function computeUnitCost(
  vendorPrice: number,
  packType: PackType,
  unitsPerCase: number,
  priceBasis: PriceBasis
): number {
  if (
    packType === 'CASE' &&
    priceBasis === 'PER_CASE' &&
    unitsPerCase > 0
  ) {
    return vendorPrice / unitsPerCase
  }
  return vendorPrice
}
