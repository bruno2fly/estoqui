/**
 * Similarity scoring and matching algorithm.
 *
 * Scoring formula:
 *   score = 0.55 * sizeSimilarity + 0.30 * coreTokenJaccard + 0.15 * brandSimilarity
 *
 * Size gets the highest weight because two products with different sizes are
 * almost certainly different SKUs, even if the name tokens overlap heavily.
 */

import type {
  ParsedItem,
  MasterProduct,
  Alias,
  MatchCandidate,
  MatchResult,
  MatchStatus,
} from './types'
import type { BrandDictionary } from './brand'
import { normalizeText } from './normalize'
import { parseProductName } from './parse'

/* ── Thresholds ──────────────────────────────────────────────────────────── */

const AUTO_ACCEPT_THRESHOLD = 0.88
const TOP_N_CANDIDATES = 3

/* ── Similarity: tokens (Jaccard index) ──────────────────────────────────── */

export function tokenJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection++
  }
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : intersection / union
}

/* ── Similarity: size ────────────────────────────────────────────────────── */

/**
 * Compare unit sizes. Returns 1 for exact match, 0 for mismatch,
 * and a scaled value for "close" sizes (within 15% tolerance for
 * rounding differences like 360g vs 370g).
 *
 * If either side has no size info, returns a neutral 0.5 (unknown).
 */
export function sizeSimilarity(
  a: { unitSizeValue: number | null; unitSizeUnit: string | null },
  b: { unitSizeValue: number | null; unitSizeUnit: string | null }
): number {
  // If either is unknown, return neutral
  if (a.unitSizeValue === null || b.unitSizeValue === null) return 0.5
  // Unit mismatch (g vs ml) — different product category
  if (a.unitSizeUnit !== b.unitSizeUnit) return 0
  // Exact match
  if (a.unitSizeValue === b.unitSizeValue) return 1
  // Close match: within 15% tolerance
  const max = Math.max(a.unitSizeValue, b.unitSizeValue)
  const diff = Math.abs(a.unitSizeValue - b.unitSizeValue)
  const ratio = diff / max
  if (ratio <= 0.15) return 1 - ratio * 2 // 0% diff -> 1.0, 15% diff -> 0.7
  return 0
}

/* ── Similarity: brand ───────────────────────────────────────────────────── */

/**
 * Brand comparison: exact match -> 1, one contains the other -> 0.7,
 * no overlap -> 0. If either brand is empty, return neutral 0.4.
 */
export function brandSimilarity(aBrand: string, bBrand: string): number {
  if (!aBrand || !bBrand) return 0.4
  if (aBrand === bBrand) return 1
  if (aBrand.includes(bBrand) || bBrand.includes(aBrand)) return 0.7
  // Check if they share first 3+ characters (typo/abbreviation tolerance)
  if (aBrand.length >= 3 && bBrand.length >= 3 && aBrand.slice(0, 3) === bBrand.slice(0, 3)) return 0.5
  return 0
}

/* ── Combined score ──────────────────────────────────────────────────────── */

const W_SIZE = 0.55
const W_CORE = 0.30
const W_BRAND = 0.15

export function combinedScore(
  vendor: ParsedItem,
  master: { coreTokens: string[]; brand: string; unitSizeValue: number | null; unitSizeUnit: string | null }
): { score: number; sizeScore: number; coreTokenScore: number; brandScore: number } {
  const sizeScore = sizeSimilarity(vendor, master)
  const coreTokenScore = tokenJaccard(vendor.coreTokens, master.coreTokens)
  const brandScore = brandSimilarity(vendor.brand, master.brand)
  const score = W_SIZE * sizeScore + W_CORE * coreTokenScore + W_BRAND * brandScore
  return { score, sizeScore, coreTokenScore, brandScore }
}

/* ── Main matching function ──────────────────────────────────────────────── */

/**
 * Match a single parsed vendor row against the master catalog.
 *
 * Priority:
 *   1. Barcode match -> confidence 1.0
 *   2. Alias match (exact normalized name) -> confidence 0.99
 *   3. Score-based matching against all master products
 *      Auto-accept if top score >= AUTO_ACCEPT_THRESHOLD
 */
export function matchVendorToCatalog(
  vendorParsed: ParsedItem,
  vendorBarcode: string | undefined,
  masterProducts: MasterProduct[],
  aliases: Alias[],
  brandDict?: BrandDictionary
): { candidates: MatchCandidate[]; confidence: number; status: MatchStatus; selectedId: string | null } {

  // 1. Barcode match
  if (vendorBarcode) {
    const barcodeMatch = masterProducts.find((m) => m.barcode && m.barcode === vendorBarcode)
    if (barcodeMatch) {
      return {
        candidates: [{
          masterProductId: barcodeMatch.id,
          score: 1,
          breakdown: { sizeScore: 1, coreTokenScore: 1, brandScore: 1 },
        }],
        confidence: 1,
        status: 'auto',
        selectedId: barcodeMatch.id,
      }
    }
  }

  // 2. Alias match
  const vendorNorm = vendorParsed.normalizedName
  const aliasMatch = aliases.find((a) => a.normalizedName === vendorNorm)
  if (aliasMatch) {
    const mp = masterProducts.find((m) => m.id === aliasMatch.masterProductId)
    if (mp) {
      return {
        candidates: [{
          masterProductId: mp.id,
          score: 0.99,
          breakdown: { sizeScore: 1, coreTokenScore: 1, brandScore: 1 },
        }],
        confidence: 0.99,
        status: 'auto',
        selectedId: mp.id,
      }
    }
  }

  // 3. Score-based matching
  const scored: MatchCandidate[] = masterProducts.map((mp) => {
    // Parse the master product's canonical name for token comparison
    const masterParsed = parseProductName(mp.canonicalName, mp.brand, brandDict)
    const { score, sizeScore, coreTokenScore, brandScore } = combinedScore(vendorParsed, {
      coreTokens: masterParsed.coreTokens,
      brand: mp.brand ? normalizeText(mp.brand) : masterParsed.brand,
      unitSizeValue: mp.unitSizeValue,
      unitSizeUnit: mp.unitSizeUnit,
    })
    return {
      masterProductId: mp.id,
      score,
      breakdown: { sizeScore, coreTokenScore, brandScore },
    }
  })

  scored.sort((a, b) => b.score - a.score)
  const topCandidates = scored.slice(0, TOP_N_CANDIDATES)
  const topScore = topCandidates[0]?.score ?? 0

  const status: MatchStatus = topScore >= AUTO_ACCEPT_THRESHOLD ? 'auto' : 'needs_review'
  const selectedId = status === 'auto' ? topCandidates[0]?.masterProductId ?? null : null

  return {
    candidates: topCandidates,
    confidence: topScore,
    status,
    selectedId,
  }
}

/* ── Batch matching ──────────────────────────────────────────────────────── */

export interface VendorRowForMatching {
  id: string
  rawName: string
  brand?: string
  barcode?: string
  casePrice: number
}

/**
 * Match a batch of vendor rows against the master catalog.
 * Returns MatchResult[] ready for the store.
 */
export function matchVendorBatch(
  vendorRows: VendorRowForMatching[],
  masterProducts: MasterProduct[],
  aliases: Alias[],
  brandDict?: BrandDictionary
): MatchResult[] {
  return vendorRows.map((row) => {
    const parsed = parseProductName(row.rawName, row.brand, brandDict)
    const { candidates, confidence, status, selectedId } =
      matchVendorToCatalog(parsed, row.barcode, masterProducts, aliases, brandDict)

    const derivedUnitCost = parsed.packCount > 0
      ? Math.round((row.casePrice / parsed.packCount) * 100) / 100
      : null

    return {
      vendorRowId: row.id,
      parsed,
      candidates,
      selectedMasterProductId: selectedId,
      confidence,
      status,
      casePrice: row.casePrice,
      derivedUnitCost,
    }
  })
}
