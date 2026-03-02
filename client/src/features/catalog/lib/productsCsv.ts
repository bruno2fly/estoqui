import { parseCSVLine, detectSeparator } from '@/features/inventory/lib/csvStock'
import { normalize } from '@/shared/lib/matching'
import { detectBrandFromName, DEFAULT_BRANDS } from '@/lib/catalogMatch/brand'
import { useCatalogMatchStore } from '@/store/catalogMatchStore'

export interface ProductRow {
  name: string
  brand: string
  sku: string
  category: string
  unitSize: string
  minStock: number
}

export function parseProductsCSV(
  text: string
): { products: ProductRow[] } | { error: string } {
  text = text.replace(/^\uFEFF/, '')
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) {
    return { error: 'CSV must have a header row and at least one data row' }
  }

  const separator = detectSeparator(lines[0])
  const headers = parseCSVLine(lines[0], separator).map((h) => normalize(h))

  const nameIdx = headers.findIndex((h) =>
    /\b(name|produto|nome|product)\b/.test(h)
  )
  const brandIdx = headers.findIndex((h) => /\b(brand|marca)\b/.test(h))
  const categoryIdx = headers.findIndex((h) =>
    /\b(category|categoria|tipo|type)\b/.test(h)
  )
  const sizeIdx = headers.findIndex((h) =>
    /\b(size|unit|tamanho|unidade)\b/.test(h)
  )
  const minStockIdx = headers.findIndex((h) =>
    /\b(minstock|min_stock|min stock|estoque mínimo)\b/.test(h)
  )
  const skuIdx = headers.findIndex((h) => /\b(sku|código|codigo)\b/.test(h))

  if (nameIdx === -1) {
    return {
      error:
        'CSV must have a Product Name column. Optional: Brand, SKU, Category, Size/Unit, Min Stock',
    }
  }

  // Use the persisted brand dictionary for auto-detection when Brand column is empty
  const userBrandDict = useCatalogMatchStore.getState().brandDict
  const brandDict = { ...DEFAULT_BRANDS, ...userBrandDict }

  const defaultMinStock = 10
  const products: ProductRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i], separator)
    const name = (parts[nameIdx] ?? '').trim()
    if (!name) continue

    let brand = brandIdx >= 0 ? (parts[brandIdx] ?? '').trim() : ''

    // Auto-detect brand from product name when the column is empty
    if (!brand) {
      const hit = detectBrandFromName(name, brandDict)
      if (!hit.inferred) {
        brand = hit.brand
      }
    }

    const minStockVal = minStockIdx >= 0 ? (parts[minStockIdx] ?? '') : ''
    const minStock = Math.max(
      0,
      parseInt(minStockVal.toString().replace(/[^\d]/g, ''), 10) || defaultMinStock
    )

    products.push({
      name,
      brand,
      sku: (skuIdx >= 0 ? (parts[skuIdx] ?? '') : '').trim(),
      category: (categoryIdx >= 0 ? (parts[categoryIdx] ?? '') : '').trim(),
      unitSize: (sizeIdx >= 0 ? (parts[sizeIdx] ?? '') : '').trim(),
      minStock,
    })
  }

  if (products.length === 0) {
    return { error: 'No valid products found in CSV' }
  }

  return { products }
}
