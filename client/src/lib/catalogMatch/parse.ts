/**
 * Parsing raw product names into structured ParsedItem objects.
 *
 * Handles:
 *  - Pack patterns: "12 x 360 grs", "24x12oz", "6x1L"
 *  - Weight/volume: "670G", "1,8kg", "500ml", "3.6L", "370 grs"
 *  - Brand extraction via persisted BrandDictionary + first-token heuristic
 *  - Core name vs variant token separation
 */

import type { ParsedItem } from './types'
import type { BrandDictionary } from './brand'
import { normalizeText, tokenize } from './normalize'
import { detectBrandFromName, stripBrandTokens, DEFAULT_BRANDS } from './brand'

/* ── Unit aliases -> canonical unit ──────────────────────────────────────── */

const UNIT_MAP: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', gramas: 'g', grama: 'g',
  kg: 'kg', kgs: 'kg', quilo: 'kg', quilos: 'kg',
  mg: 'mg',
  ml: 'ml', mls: 'ml',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  oz: 'oz',
  lb: 'lb', lbs: 'lb',
  un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un',
}

/* ── Variant keywords (not core product identity) ────────────────────────── */

const VARIANT_WORDS = new Set([
  'instantaneo', 'instant', 'soluvel',
  'integral', 'light', 'diet', 'zero', 'fitness', 'fit',
  'kids', 'jr', 'junior', 'mini', 'max', 'maxi', 'mega', 'super', 'ultra',
  'premium', 'gold', 'plus', 'pro', 'extra',
  'tradicional', 'trad', 'original', 'orig', 'classico',
  'morango', 'chocolate', 'baunilha', 'limao', 'laranja', 'uva', 'menta',
  'moca', 'caramelo', 'coco',
  'forte', 'suave', 'medio',
  'novo', 'nova', 'new',
  'importado', 'import', 'imported',
  'organico', 'organic',
])

/* ── Pack pattern regex ──────────────────────────────────────────────────── */

const PACK_RE = /(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*([a-z]+)/i
const SIZE_RE = /(?<!\d\s*x\s*)(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramas?|kg|kgs?|quilos?|mg|ml|mls?|l|lt|lts?|litros?|oz|lb|lbs?)\b/i
const VERSION_RE = /\b(\d+\.\d+)\b/

/* ── parsePackaging ──────────────────────────────────────────────────────── */

export interface PackagingInfo {
  unitSizeValue: number | null
  unitSizeUnit: string | null
  packCount: number
}

/**
 * Extract pack count and unit size from a product name string.
 */
export function parsePackaging(name: string): PackagingInfo {
  const lower = name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  let packCount = 1
  let unitSizeValue: number | null = null
  let unitSizeUnit: string | null = null

  const packMatch = lower.match(PACK_RE)
  if (packMatch) {
    packCount = parseInt(packMatch[1], 10)
    const rawVal = parseFloat(packMatch[2].replace(',', '.'))
    const rawUnit = packMatch[3].toLowerCase()
    const canonUnit = UNIT_MAP[rawUnit]
    if (canonUnit) {
      const converted = convertToBaseUnit(rawVal, canonUnit)
      unitSizeValue = converted.value
      unitSizeUnit = converted.unit
    }
  }

  if (unitSizeValue === null) {
    const sizeMatch = lower.match(SIZE_RE)
    if (sizeMatch) {
      const rawVal = parseFloat(sizeMatch[1].replace(',', '.'))
      const rawUnit = sizeMatch[2].toLowerCase()
      const canonUnit = UNIT_MAP[rawUnit]
      if (canonUnit) {
        const converted = convertToBaseUnit(rawVal, canonUnit)
        unitSizeValue = converted.value
        unitSizeUnit = converted.unit
      }
    }
  }

  return { unitSizeValue, unitSizeUnit, packCount }
}

function convertToBaseUnit(value: number, unit: string): { value: number; unit: string } {
  switch (unit) {
    case 'kg':
      return { value: Math.round(value * 1000 * 100) / 100, unit: 'g' }
    case 'l':
      return { value: Math.round(value * 1000 * 100) / 100, unit: 'ml' }
    default:
      return { value: Math.round(value * 100) / 100, unit }
  }
}

/* ── extractBrandCoreVariant ─────────────────────────────────────────────── */

export interface BrandCoreVariant {
  brand: string
  coreName: string
  coreTokens: string[]
  variantTokens: string[]
}

/**
 * Split tokens into brand, core product name, and variant descriptors.
 *
 * Uses the BrandDictionary for reliable multi-token brand detection,
 * then strips brand tokens before core/variant classification.
 */
export function extractBrandCoreVariant(
  tokens: string[],
  rawName: string,
  brandDict: BrandDictionary,
  explicitBrand?: string
): BrandCoreVariant {
  let brand = ''
  let remaining = [...tokens]

  if (explicitBrand) {
    // Explicit brand overrides detection
    const normBrand = normalizeText(explicitBrand)
    brand = normBrand
    const brandTokens = normBrand.split(' ').filter(Boolean)
    remaining = stripBrandTokens(remaining, brandTokens)
  } else {
    // Detect brand from the raw name using dictionary
    const hit = detectBrandFromName(rawName, brandDict)
    brand = normalizeText(hit.brand)
    remaining = stripBrandTokens(remaining, hit.matchedTokens)
  }

  // Strip tokens that are purely numeric (sizes already captured)
  const stripped = remaining.filter((t) => {
    if (/^\d+[.,]?\d*$/.test(t)) return false
    if (UNIT_MAP[t]) return false
    return true
  })

  const coreTokens: string[] = []
  const variantTokens: string[] = []

  for (const token of stripped) {
    if (VARIANT_WORDS.has(token)) {
      variantTokens.push(token)
    } else {
      coreTokens.push(token)
    }
  }

  return {
    brand,
    coreName: coreTokens.join(' '),
    coreTokens,
    variantTokens,
  }
}

/* ── Full parser: raw name -> ParsedItem ─────────────────────────────────── */

/**
 * Parse a raw product name into a structured ParsedItem.
 *
 * @param rawName      The original product name string
 * @param explicitBrand  Optional brand override (e.g. from a CSV Brand column)
 * @param brandDict    Brand dictionary for detection; defaults to DEFAULT_BRANDS
 */
export function parseProductName(
  rawName: string,
  explicitBrand?: string,
  brandDict?: BrandDictionary
): ParsedItem {
  const dict = brandDict ?? DEFAULT_BRANDS
  const normalized = normalizeText(rawName)
  const packaging = parsePackaging(rawName)
  const tokens = tokenize(normalized)

  // Remove version-like tokens before brand extraction
  const cleanTokens = tokens.filter((t) => !VERSION_RE.test(t))

  const { brand, coreName, coreTokens, variantTokens } =
    extractBrandCoreVariant(cleanTokens, rawName, dict, explicitBrand)

  // Re-add version tokens as variants
  const versionMatch = rawName.match(VERSION_RE)
  if (versionMatch) {
    variantTokens.push(versionMatch[1])
  }

  return {
    originalName: rawName,
    normalizedName: normalized,
    tokens,
    brand,
    coreName,
    coreTokens,
    variantTokens,
    unitSizeValue: packaging.unitSizeValue,
    unitSizeUnit: packaging.unitSizeUnit,
    packCount: packaging.packCount,
  }
}
