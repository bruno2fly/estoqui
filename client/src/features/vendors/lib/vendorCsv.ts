import { parseCSVLine, detectSeparator } from '@/features/inventory/lib/csvStock'
import { normalize } from '@/shared/lib/matching'
import { parsePackFromText } from '@/lib/pack/parsePack'
import * as XLSX from 'xlsx'
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
    return /\b(name|product|nome|produto|price|preco|preço|sku|brand|marca|description|descricao|descrição|desc|item|cost|valor|case|pack|quantity)\b/.test(lower)
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
    /\b(name|produto|nome|product|description|descricao|descrição|desc)\b/.test(h)
  )
  const brandIdx = headers.findIndex((h) => /\b(brand|marca)\b/.test(h))
  const skuIdx = (() => {
    const preferred = headers.findIndex((h) =>
      /^(sku|itemsku|productcode|productsku|plu|itemcode|code|codigo|item|itemno|itemnum|itemnumber|itemid|ref|referencia)$/.test(normalizeHeader(h))
    )
    if (preferred >= 0) return preferred
    return headers.findIndex((h) =>
      /^(upc|barcode|ean)$/.test(normalizeHeader(h))
    )
  })()
  const priceIdx = headers.findIndex((h) =>
    /\b(price|preco|preço|unit price|cost|valor|value)\b/.test(h)
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

  // Only require a product name column — price, sku, brand, etc. are all optional
  if (nameIdx === -1) {
    return {
      error:
        'File must have a column for Product Name. Expected: product_name, name, description, or desc. Optional: price/cost, sku/item, brand, unit_size, pack_size, case, available',
    }
  }

  const prices: VendorPriceRow[] = []
  const errors: { row: number; message: string }[] = []
  let skuCount = 0
  const dataStartIdx = headerLineIdx + 1
  const rowCount = lines.length - dataStartIdx

  // Also detect "case" / "pack" / "pack_size" / "caixa" columns for case quantity
  const caseIdx = headers.findIndex((h) =>
    /\b(case|cases|pack|pack size|packsize|caixa|fardo|cx|qty|quantity)\b/.test(h) && !/\b(price|preco)\b/.test(h)
  )

  for (let i = dataStartIdx; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i], separator)
    const name = (parts[nameIdx] ?? '').trim().replace(/\s+/g, ' ')
    const brand = brandIdx >= 0 ? (parts[brandIdx] ?? '').trim().replace(/\s+/g, ' ') : ''
    const sku = skuIdx >= 0 ? (parts[skuIdx] ?? '').trim() : ''
    const unitSize = unitSizeIdx >= 0 ? (parts[unitSizeIdx] ?? '').trim() : ''
    const unitType = unitTypeIdx >= 0 ? (parts[unitTypeIdx] ?? '').trim() : ''

    // Price is optional — default to 0 if column missing or empty
    let price = 0
    if (priceIdx >= 0) {
      const priceStr = (parts[priceIdx] ?? '0')
        .trim()
        .replace(/[R$]/g, '')
        .replace(/,/g, '.')
      price = parseFloat(priceStr)
      if (Number.isNaN(price)) price = 0
    }

    let available = true
    if (availableIdx >= 0) {
      const av = (parts[availableIdx] ?? '').trim().toLowerCase()
      available = !['false', 'no', '0', 'n'].includes(av)
    }

    if (!name) {
      errors.push({ row: i + 1, message: 'Missing product name' })
      continue
    }

    if (sku) skuCount++

    // Detect pack/case info from name, size columns, or dedicated "case" column
    const packText = [name, unitSize, unitType].filter(Boolean).join(' ')
    const pack = parsePackFromText(packText)

    // If there's a dedicated case column, use it (e.g. "24", "12", "6")
    let unitsPerCase = pack.unitsPerCase
    if (caseIdx >= 0) {
      const caseVal = parseInt((parts[caseIdx] ?? '').trim(), 10)
      if (!Number.isNaN(caseVal) && caseVal > 0) {
        unitsPerCase = caseVal
      }
    }
    const packType = unitsPerCase > 1 ? 'CASE' as const : 'UNIT' as const
    const priceBasis = packType === 'CASE' ? 'PER_CASE' as const : 'PER_UNIT' as const

    prices.push({
      name, brand, sku, unitSize, unitType, price, available,
      packType,
      unitsPerCase,
      unitDescriptor: pack.unitDescriptor,
      priceBasis,
    })
  }

  if (prices.length === 0) {
    return { error: `No valid products found. ${errors.length} row(s) had errors.` }
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

/**
 * Parse an Excel (.xlsx / .xls) file into vendor price rows.
 * Reads the first sheet, converts to CSV, then reuses the CSV parser.
 */
export function parseVendorPriceExcel(
  data: ArrayBuffer
): VendorCsvParseResult | { error: string } {
  try {
    const workbook = XLSX.read(data, { type: 'array' })
    const firstSheet = workbook.SheetNames[0]
    if (!firstSheet) return { error: 'Excel file has no sheets.' }

    const sheet = workbook.Sheets[firstSheet]
    const csvText = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' })
    if (!csvText.trim()) return { error: 'Excel sheet is empty.' }

    return parseVendorPriceCSV(csvText)
  } catch (err) {
    return {
      error: `Failed to read Excel file: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}
