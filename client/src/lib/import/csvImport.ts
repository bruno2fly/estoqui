import { parseCSVLine, detectSeparator } from '@/features/inventory/lib/csvStock'
import { makeFingerprint } from '@/lib/catalogMatch/fingerprint'
import { resolveRow } from '@/lib/catalogMatch/resolve'
import { useCatalogStore } from '@/store/catalogStore'
import { useStore } from '@/store'
import type { ImportRow } from '@/types/catalog'

function uuid() {
  return crypto.randomUUID()
}

function now() {
  return new Date().toISOString()
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
}

function parsePrice(raw: string): number | undefined {
  if (!raw) return undefined
  const cleaned = raw.replace(/[R$\s]/g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? undefined : n
}

function preserveString(s: string): string {
  return String(s ?? '').trim()
}

export type CsvImportResult = {
  uploadId: string
  rowCount: number
  resolvedCount: number
  unresolvedCount: number
  skippedCount: number
}

export function parseVendorCatalogCsv(
  text: string,
  vendorId: string,
  fileName?: string
): CsvImportResult {
  text = text.replace(/^\uFEFF/, '')
  const lines = text.split(/\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row')
  }

  const separator = detectSeparator(lines[0])
  const rawHeaders = parseCSVLine(lines[0], separator)
  const headers = rawHeaders.map((h) => normalizeHeader(h))

  const skuIdx = headers.findIndex((h) =>
    /^(sku|productsku|productcode|plu|itemcode|code|codigo)$/.test(h)
  )
  const barcodeIdx = headers.findIndex((h) =>
    /^(barcode|ean|upc|gtin)$/.test(h)
  )
  const nameIdx = headers.findIndex((h) =>
    /^(productname|product_name|product|name|produto|nome|item|desc|descricao)$/.test(h)
  )
  const brandIdx = headers.findIndex((h) => /^(brand|marca)$/.test(h))
  const priceIdx = headers.findIndex((h) =>
    /^(price|preco|cost|custo|unitprice|valor)$/.test(h)
  )

  if (nameIdx === -1) {
    throw new Error('CSV must have a product name column (product_name, name, product, etc.)')
  }
  if (priceIdx === -1) {
    throw new Error('CSV must have a price column (price, cost, etc.)')
  }

  const store = useCatalogStore.getState()

  // Sync main store products into catalogStore so matching can find them
  const mainProducts = useStore.getState().products ?? []
  for (const p of mainProducts) {
    const key = p.sku || p.id
    if (!store.catalogProducts[key]) {
      store.upsertCatalogProduct({
        sku: key,
        name: p.name,
        brand: p.brand || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
  }

  const state = {
    catalogProducts: useCatalogStore.getState().catalogProducts,
    skuMappings: useCatalogStore.getState().skuMappings,
  }

  const rows: ImportRow[] = []
  let resolvedCount = 0
  let skippedCount = 0

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i], separator)
    const productName = preserveString(parts[nameIdx] ?? '')
    if (!productName) {
      skippedCount++
      continue
    }

    const priceRaw = parts[priceIdx] ?? ''
    const price = parsePrice(priceRaw)
    if (price === undefined || price < 0) {
      skippedCount++
      continue
    }

    const sku = skuIdx >= 0 ? preserveString(parts[skuIdx] ?? '') : undefined
    const barcode = barcodeIdx >= 0 ? preserveString(parts[barcodeIdx] ?? '') : undefined
    const brand = brandIdx >= 0 ? preserveString(parts[brandIdx] ?? '') : undefined

    const fingerprint = makeFingerprint(productName, brand || undefined)

    const rowId = uuid()
    const row: ImportRow = {
      id: rowId,
      uploadId: '', // set after upload created
      vendorId,
      sku: sku || undefined,
      barcode: barcode || undefined,
      productName,
      brand: brand || undefined,
      price,
      fingerprint,
      status: 'unresolved',
      confidence: 0,
      createdAt: now(),
      updatedAt: now(),
    }

    const result = resolveRow(
      {
        sku: row.sku,
        barcode: row.barcode,
        productName: row.productName,
        brand: row.brand,
        vendorId: row.vendorId,
        fingerprint,
      },
      state
    )

    if (result.status === 'resolved' && result.resolvedSku && result.confidence >= 92) {
      row.status = 'resolved'
      row.resolvedSku = result.resolvedSku
      row.confidence = result.confidence
      resolvedCount++

      if (result.createdProduct) {
        store.upsertCatalogProduct(result.createdProduct)
      }

      store.applyResolvedRowToVendorPrice({
        ...row,
        resolvedSku: result.resolvedSku,
        status: 'resolved',
      })

      const createMappings = true
      if (createMappings) {
        if (row.barcode?.trim()) {
          store.addSkuMapping({
            keyType: 'barcode',
            keyValue: row.barcode.trim(),
            sku: result.resolvedSku,
          })
        }
        store.addSkuMapping({
          keyType: 'name_fingerprint',
          keyValue: fingerprint,
          sku: result.resolvedSku,
          vendorId,
        })
        store.addAliasToSku(result.resolvedSku, row.productName)
      }

      state.catalogProducts = store.catalogProducts
      state.skuMappings = store.skuMappings
    } else {
      row.confidence = result.confidence
      row.proposedMatches = result.proposedMatches
      row.conflictNote = result.conflictNote
    }

    rows.push(row)
  }

  const uploadId = store.createImportUpload({
    vendorId,
    source: 'csv_upload',
    fileName,
    rowCount: rows.length,
    resolvedCount,
    unresolvedCount: rows.length - resolvedCount,
  })

  rows.forEach((r) => {
    r.uploadId = uploadId
  })

  store.addImportRows(rows)

  return {
    uploadId,
    rowCount: rows.length,
    resolvedCount,
    unresolvedCount: rows.length - resolvedCount,
    skippedCount,
  }
}
