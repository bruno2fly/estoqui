import { parseCSVLine, detectSeparator } from '@/features/inventory/lib/csvStock'
import { normalize } from '@/shared/lib/matching'
import { parsePackFromText } from '@/lib/pack/parsePack'
import type { PackType, PriceBasis } from '@/types'

export interface VendorPriceRow {
  name: string
  brand: string
  sku: string
  unitSize: string
  unitType: string
  price: number
  available: boolean
  packType?: PackType
  unitsPerCase?: number
  unitDescriptor?: string
  priceBasis?: PriceBasis
}

export interface VendorCsvParseResult {
  prices: VendorPriceRow[]
  rowCount: number
  validRowCount: number
  invalidRowCount: number
  hasSkuPercent: number
  errors: { row: number; message: string }[]
}

export function parseVendorPriceCSV(
  text: string
): VendorCsvParseResult | { error: string } {
  text = text.replace(/^\uFEFF/, '')
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) {
    return { error: 'CSV file must have at least a header and one data row' }
  }

  // Auto-detect header row: skip title/label rows that don't contain
  // recognizable column names (e.g. "LISTA_SEMANA_clean")
  let headerLineIdx = 0
  const isHeaderLine = (line: string) => {
    const lower = line.toLowerCase().replace(/_/g, ' ')
    return /\b(name|product|nome|produto|price|preco|preço|sku|brand|marca)\b/.test(lower)
  }
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (isHeaderLine(lines[i])) {
      headerLineIdx = i
      break
    }
  }

  const separator = detectSeparator(lines[headerLineIdx])
  const headers = parseCSVLine(lines[headerLineIdx], separator).map((h) =>
    normalize(h).replace(/_/g, ' ')
  )

  const normalizeHeader = (h: string) =>
    h.replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '')

  const nameIdx = headers.findIndex((h) =>
    /\b(name|produto|nome|product)\b/.test(h)
  )
  const brandIdx = headers.findIndex((h) => /\b(brand|marca)\b/.test(h))
  const skuIdx = (() => {
    const preferred = headers.findIndex((h) =>
      /^(sku|itemsku|productcode|productsku|plu|itemcode|code|codigo)$/.test(normalizeHeader(h))
    )
    if (preferred >= 0) return preferred
    return headers.findIndex((h) =>
      /^(upc|barcode|ean)$/.test(normalizeHeader(h))
    )
  })()
  const priceIdx = headers.findIndex((h) =>
    /\b(price|preco|preço|unit price|unit)\b/.test(h)
  )
  const unitSizeIdx = headers.findIndex((h) =>
    /\b(unit size|size|tamanho|peso|weight)\b/.test(h)
  )
  const unitTypeIdx = headers.findIndex((h) =>
    /\b(unit type|type|tipo|unit)\b/.test(h) && !/\b(price|preco)\b/.test(h)
  )
  const availableIdx = headers.findIndex((h) =>
    /\b(available|disponivel|disponível|active|ativo)\b/.test(h)
  )

  if (nameIdx === -1 || priceIdx === -1) {
    return {
      error:
        'CSV must have columns for Product Name and Price. Expected: product_name (or Name), price (or Unit Price). Optional: sku, brand, unit_size, unit_type, available',
    }
  }

  const prices: VendorPriceRow[] = []
  const errors: { row: number; message: string }[] = []
  let skuCount = 0
  const dataStartIdx = headerLineIdx + 1
  const rowCount = lines.length - dataStartIdx

  for (let i = dataStartIdx; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i], separator)
    const name = (parts[nameIdx] ?? '').trim().replace(/\s+/g, ' ')
    const brand = brandIdx >= 0 ? (parts[brandIdx] ?? '').trim().replace(/\s+/g, ' ') : ''
    const sku = skuIdx >= 0 ? (parts[skuIdx] ?? '').trim() : ''
    const unitSize = unitSizeIdx >= 0 ? (parts[unitSizeIdx] ?? '').trim() : ''
    const unitType = unitTypeIdx >= 0 ? (parts[unitTypeIdx] ?? '').trim() : ''

    const priceStr = (parts[priceIdx] ?? '0')
      .trim()
      .replace(/[R$]/g, '')
      .replace(/,/g, '.')
    const price = parseFloat(priceStr)

    let available = true
    if (availableIdx >= 0) {
      const av = (parts[availableIdx] ?? '').trim().toLowerCase()
      available = !['false', 'no', '0', 'n'].includes(av)
    }

    if (!name) {
      errors.push({ row: i + 1, message: 'Missing product name' })
      continue
    }
    if (Number.isNaN(price) || price <= 0) {
      errors.push({ row: i + 1, message: `Invalid price for "${name}": ${parts[priceIdx]}` })
      continue
    }

    if (sku) skuCount++
    const packText = [name, unitSize, unitType].filter(Boolean).join(' ')
    const pack = parsePackFromText(packText)
    prices.push({
      name, brand, sku, unitSize, unitType, price, available,
      packType: pack.packType,
      unitsPerCase: pack.unitsPerCase,
      unitDescriptor: pack.unitDescriptor,
      priceBasis: pack.priceBasis,
    })
  }

  if (prices.length === 0) {
    return { error: `No valid price entries found. ${errors.length} row(s) had errors.` }
  }

  const validRowCount = prices.length
  const invalidRowCount = rowCount - validRowCount
  const hasSkuPercent = validRowCount > 0 ? Math.round((skuCount / validRowCount) * 100) : 0

  return {
    prices,
    rowCount,
    validRowCount,
    invalidRowCount,
    hasSkuPercent,
    errors,
  }
}
