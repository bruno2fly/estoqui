import type { CatalogProduct, CatalogVendorPrice } from '@/types/catalog'

export function exportCatalogProductsCsv(products: Record<string, CatalogProduct>): string {
  const rows = Object.values(products)
  const headers = ['sku', 'name', 'brand', 'barcode', 'aliases', 'createdAt', 'updatedAt']
  const lines = [headers.join(',')]
  for (const p of rows) {
    const aliases = (p.aliases ?? []).join(';')
    const row = [
      escapeCsv(p.sku),
      escapeCsv(p.name),
      escapeCsv(p.brand ?? ''),
      escapeCsv(p.barcode ?? ''),
      escapeCsv(aliases),
      escapeCsv(p.createdAt),
      escapeCsv(p.updatedAt),
    ]
    lines.push(row.join(','))
  }
  return lines.join('\n')
}

export function exportVendorPricesCsv(prices: CatalogVendorPrice[]): string {
  const headers = ['vendorId', 'sku', 'price', 'lastSeenAt', 'sourceUploadId']
  const lines = [headers.join(',')]
  for (const p of prices) {
    const row = [
      escapeCsv(p.vendorId),
      escapeCsv(p.sku),
      String(p.price),
      escapeCsv(p.lastSeenAt),
      escapeCsv(p.sourceUploadId),
    ]
    lines.push(row.join(','))
  }
  return lines.join('\n')
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
