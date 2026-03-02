import type { StockSnapshotRow } from '@/types'

/** RFC 4180-style line parser: handles quoted fields with commas/newlines */
export function parseCSVLine(line: string, separator: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === separator) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

function normalize(s: string): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function detectSeparator(headerLine: string): string {
  const candidates = [',', ';', '\t']
  let best = ','
  let bestCount = 0
  for (const sep of candidates) {
    const count = parseCSVLine(headerLine, sep).length
    if (count > bestCount) {
      bestCount = count
      best = sep
    }
  }
  return best
}

function parseNum(raw: string): number | undefined {
  if (!raw) return undefined
  const cleaned = raw.replace(/[R$\s,]/g, (m) => m === ',' ? '.' : '').replace(/[^\d.-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? undefined : n
}

/**
 * Detect if a CSV row is a category header: no meaningful numeric data,
 * only a text string in the name column (or first column), rest empty.
 */
function isCategoryRow(parts: string[], nameIdx: number, stockIdx: number): boolean {
  const name = (parts[nameIdx] ?? '').trim()
  if (!name) return false
  const stock = (parts[stockIdx] ?? '').trim()
  // A category header has no stock value and typically no other numeric columns
  if (stock && /\d/.test(stock)) return false
  const filledCount = parts.filter((p) => p.trim()).length
  return filledCount <= 2
}

export function parseCSVStock(text: string): StockSnapshotRow[] {
  text = text.replace(/^\uFEFF/, '')
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const separator = detectSeparator(lines[0])
  const headers = parseCSVLine(lines[0], separator).map((h) => normalize(h))

  const nameIdx = headers.findIndex((h) =>
    /\b(name|produto|nome|item|desc|product)\b/.test(h)
  )
  const brandIdx = headers.findIndex((h) => /\b(brand|marca)\b/.test(h))
  const stockIdx = headers.findIndex(
    (h) =>
      /\b(stock|estoque|qty|quantidade|case|units|pcs|pieces|in stock)\b/.test(h) ||
      /\bon[- ]?hand\b/.test(h)
  )
  const costIdx = (() => {
    const unitCostIdx = headers.findIndex((h) => /\bunit\s*cost\b/.test(h))
    if (unitCostIdx >= 0) return unitCostIdx
    return headers.findIndex((h) =>
      /\b(cost|custo)\b/.test(h) && !/\btotal\s*cost\b/.test(h)
    )
  })()
  const priceIdx = headers.findIndex((h) =>
    /\b(sale|price|preco|venda|unit price)\b/.test(h)
  )
  const categoryIdx = headers.findIndex((h) =>
    /\b(category|categoria|section|secao|dept|department|group|grupo)\b/.test(h)
  )
  const skuIdx = (() => {
    const normalizeHeader = (h: string) => h.replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '')
    const preferred = headers.findIndex((h) =>
      /^(sku|itemsku|productcode|productsku|plu|itemcode|code|codigo)$/.test(normalizeHeader(h))
    )
    if (preferred >= 0) return preferred
    return headers.findIndex((h) =>
      /^(upc|barcode|ean)$/.test(normalizeHeader(h))
    )
  })()

  if (import.meta.env.DEV) {
    console.debug(`[CSV parse] Header indices — name:${nameIdx} brand:${brandIdx} sku:${skuIdx} stock:${stockIdx} cost:${costIdx} price:${priceIdx} category:${categoryIdx}`)
  }

  if (nameIdx === -1 || stockIdx === -1) {
    return lines.slice(1).map((line, idx) => {
      const parts = parseCSVLine(line, separator)
      const stockVal = parts[2] ?? parts[1] ?? '0'
      const stockQty =
        parseFloat(stockVal.toString().replace(/[^\d.]/g, '')) || 0
      return {
        rawName: parts[0] ?? `Product ${idx + 1}`,
        rawBrand: parts[1] ?? '',
        stockQty: Math.floor(stockQty),
        matchedProductId: null,
      }
    }).filter((r) => r.rawName)
  }

  const rows: StockSnapshotRow[] = []
  let currentCategory = ''

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i], separator)

    // Check for category row (section header)
    if (categoryIdx === -1 && isCategoryRow(parts, nameIdx, stockIdx)) {
      currentCategory = (parts[nameIdx] ?? '').trim()
      continue
    }

    const rawName = (parts[nameIdx] ?? '').trim()
    if (!rawName) continue

    const stockVal = parts[stockIdx] ?? '0'
    const stockClean = stockVal.replace(/,/g, '').replace(/[^\d.\-]/g, '')
    const stockRaw = parseFloat(stockClean) || 0
    const stockQty = Math.max(0, stockRaw)
    if (isNaN(stockRaw)) continue

    const unitCost = costIdx >= 0 ? parseNum(parts[costIdx] ?? '') : undefined
    const unitPrice = priceIdx >= 0 ? parseNum(parts[priceIdx] ?? '') : undefined
    const category = categoryIdx >= 0
      ? (parts[categoryIdx] ?? '').trim() || currentCategory
      : currentCategory || undefined

    const rawSku = skuIdx >= 0 ? (parts[skuIdx] ?? '').trim() : undefined

    rows.push({
      rawName,
      rawBrand: (brandIdx >= 0 ? (parts[brandIdx] ?? '') : '').trim(),
      rawSku: rawSku || undefined,
      stockQty: Math.floor(stockQty),
      matchedProductId: null,
      unitCost: unitCost && unitCost > 0 ? unitCost : undefined,
      unitPrice: unitPrice && unitPrice > 0 ? unitPrice : undefined,
      category: category || undefined,
    })
  }

  return rows
}
