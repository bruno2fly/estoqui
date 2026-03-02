/* ── Raw input types ─────────────────────────────────────────────────────── */

export interface RawPosRow {
  barcode?: string
  name: string
  brand?: string
  unitPrice?: number
  stockQty?: number
  /** Any extra columns the CSV may have */
  extra?: Record<string, string>
}

export interface RawVendorRow {
  vendorSku?: string
  name: string
  brand?: string
  casePrice: number
  barcode?: string
  extra?: Record<string, string>
}

/* ── Parsed representation ───────────────────────────────────────────────── */

export interface ParsedItem {
  originalName: string
  normalizedName: string
  tokens: string[]
  brand: string
  coreName: string
  coreTokens: string[]
  variantTokens: string[]
  unitSizeValue: number | null
  unitSizeUnit: string | null
  packCount: number
}

/* ── Master catalog ──────────────────────────────────────────────────────── */

export interface MasterProduct {
  id: string
  canonicalName: string
  brand: string
  barcode?: string
  sku?: string
  unitSizeValue: number | null
  unitSizeUnit: string | null
  defaultPackCount?: number
  createdAt: string
}

/* ── Alias: links a raw name from any source to a master product ─────── */

export interface Alias {
  id: string
  sourceType: 'pos' | 'vendor'
  sourceId: string
  rawName: string
  normalizedName: string
  masterProductId: string
  createdAt: string
}

/* ── Match results ───────────────────────────────────────────────────────── */

export interface MatchCandidate {
  masterProductId: string
  score: number
  breakdown: {
    sizeScore: number
    coreTokenScore: number
    brandScore: number
  }
}

export type MatchStatus = 'auto' | 'needs_review' | 'confirmed' | 'new_product'

export interface MatchResult {
  vendorRowId: string
  parsed: ParsedItem
  candidates: MatchCandidate[]
  selectedMasterProductId: string | null
  confidence: number
  status: MatchStatus
  casePrice: number
  derivedUnitCost: number | null
}

/* ── Store state ─────────────────────────────────────────────────────────── */

export interface CatalogMatchState {
  masterProducts: MasterProduct[]
  aliases: Alias[]
  matchResults: MatchResult[]
  /** Persisted brand dictionary: user-learned brands merged with defaults */
  brandDict: Record<string, string>
  /** version for localStorage migration */
  _catalogVersion: number
}
