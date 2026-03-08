import type { CatalogProduct, SkuMapping, ImportRow } from '@/types/catalog'

export type ResolveInput = Pick<ImportRow, 'sku' | 'barcode' | 'productName' | 'brand' | 'vendorId'> & {
  fingerprint: string
}

export type ResolveResult = {
  status: 'resolved' | 'unresolved'
  resolvedSku?: string
  confidence: number
  proposedMatches?: Array<{ sku: string; score: number }>
  conflictNote?: string
  createdProduct?: CatalogProduct
}

type ResolveState = {
  catalogProducts: Record<string, CatalogProduct>
  skuMappings: SkuMapping[]
}

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/\s+/).filter(Boolean))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  const inter = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : inter / union
}

export function resolveRow(
  row: ResolveInput,
  state: ResolveState
): ResolveResult {
  const { catalogProducts, skuMappings } = state

  // 1) Row has SKU
  if (row.sku && row.sku.trim()) {
    const sku = row.sku.trim()
    const existing = catalogProducts[sku]
    if (existing) {
      return { status: 'resolved', resolvedSku: sku, confidence: 100 }
    }
    // Check barcode conflict before creating
    if (row.barcode?.trim()) {
      const barcodeConflict = Object.values(catalogProducts).find(
        (p) => p.barcode && p.barcode === row.barcode?.trim()
      )
      if (barcodeConflict && barcodeConflict.sku !== sku) {
        return {
          status: 'unresolved',
          confidence: 50,
          proposedMatches: [
            { sku: barcodeConflict.sku, score: 50 },
            { sku, score: 50 },
          ],
          conflictNote: `Barcode ${row.barcode} already assigned to SKU ${barcodeConflict.sku}`,
        }
      }
    }
    return {
      status: 'resolved',
      resolvedSku: sku,
      confidence: 100,
      createdProduct: {
        sku,
        name: row.productName,
        brand: row.brand,
        barcode: row.barcode?.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }
  }

  // 2) Row has barcode
  if (row.barcode?.trim()) {
    const barcode = row.barcode.trim()
    const mapping = skuMappings.find(
      (m) => m.keyType === 'barcode' && m.keyValue === barcode
    )
    if (mapping) {
      return { status: 'resolved', resolvedSku: mapping.sku, confidence: 98 }
    }
    const byBarcode = Object.values(catalogProducts).find(
      (p) => p.barcode === barcode
    )
    if (byBarcode) {
      return { status: 'resolved', resolvedSku: byBarcode.sku, confidence: 98 }
    }
  }

  // 3) Fingerprint mapping
  const fpMapping = skuMappings.find(
    (m) =>
      m.keyType === 'name_fingerprint' &&
      m.keyValue === row.fingerprint &&
      (!m.vendorId || m.vendorId === row.vendorId)
  )
  if (fpMapping) {
    const conf = fpMapping.vendorId === row.vendorId ? 95 : 92
    return { status: 'resolved', resolvedSku: fpMapping.sku, confidence: conf }
  }

  // 4) Fuzzy propose
  const rowTokens = tokenize(row.productName)
  const rowBrand = (row.brand ?? '').toLowerCase()
  const pack = row.productName.match(/\d+x?\d*(?:\.\d+)?\s*(?:ml|l|g|kg)/gi)?.[0] ?? ''

  const candidates = Object.values(catalogProducts)
    .filter((p) => {
      if (rowBrand && p.brand) {
        return p.brand.toLowerCase().includes(rowBrand) || rowBrand.includes(p.brand.toLowerCase())
      }
      const nameStart = row.productName.slice(0, 4).toLowerCase()
      return p.name.toLowerCase().includes(nameStart) || nameStart.includes(p.name.slice(0, 4).toLowerCase())
    })
    .slice(0, 50)

  const scored = candidates.map((p) => {
    const nameTokens = tokenize(p.name)
    const brandMatch = rowBrand && p.brand?.toLowerCase() === rowBrand ? 10 : 0
    const packMatch = pack && p.name.toLowerCase().includes(pack.toLowerCase()) ? 5 : 0
    const j = jaccard(rowTokens, nameTokens)
    const score = Math.min(100, Math.round(j * 85 + brandMatch + packMatch))
    return { sku: p.sku, score }
  })

  scored.sort((a, b) => b.score - a.score)
  const top3 = scored.slice(0, 3).filter((s) => s.score > 0)

  if (top3.length > 0 && top3[0].score >= 92) {
    return {
      status: 'resolved',
      resolvedSku: top3[0].sku,
      confidence: top3[0].score,
    }
  }

  return {
    status: 'unresolved',
    confidence: top3[0]?.score ?? 0,
    proposedMatches: top3,
  }
}
