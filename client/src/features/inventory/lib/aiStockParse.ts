import { callOpenAIDocument, parseJsonArray } from '@/shared/lib/openaiVision'
import type { StockSnapshotRow } from '@/types'

const SYSTEM_PROMPT = `You are a POS (Point of Sale) stock report data extractor. The user will provide a file exported from a POS system (could be CSV, TSV, TXT, XLS text, HTML, or a screenshot/image of a report). The file format and column names will vary between different POS systems.

Your job is to extract every product with its stock, cost, price, and category from the data.

For each product, return:
- name: the product name/description
- brand: the brand if identifiable, otherwise empty string
- sku: the SKU, product code, PLU, UPC, item code, or barcode if available (string), otherwise null
- stockQty: current stock quantity as a number (integer). If stock is negative, return 0.
- unitCost: the unit cost / cost price if available (number), otherwise null
- unitPrice: the unit sale price if available (number), otherwise null
- category: the product category/section/department if available (string), otherwise null. Look for section headers, category columns, or department groupings.

IMPORTANT RULES:
- Look for columns/fields that represent product name, description, item name, etc.
- Look for columns/fields that represent SKU, product code, item code, PLU, UPC, or barcode.
- Look for columns/fields that represent current stock, quantity on hand, inventory count, qty, estoque, etc.
- Look for cost columns ($ Cost, Unit Cost, Custo) and sale price columns ($ Sale, Unit Price, Preco Venda).
- If a section header or category grouping is visible (e.g. "Achocolatados", "Acucar", "Bebidas"), assign that category to products under it.
- If there's a brand column, use it. Otherwise try to infer brand from the product name or leave empty.
- Ignore headers, totals, subtotals, and summary rows.
- If stock quantity is not clearly a number, skip that row.
- Return ONLY a valid JSON array of objects. No markdown, no explanation.

Example output:
[{"name":"Leite Condensado 395g","brand":"Nestlé","sku":"LC395","stockQty":24,"unitCost":3.50,"unitPrice":5.99,"category":"Mercearia"},{"name":"Amaciante Fofo 500ml","brand":"Fofo","sku":null,"stockQty":12,"unitCost":null,"unitPrice":null,"category":null}]

If you cannot find any products with stock data, return an empty array: []`

/**
 * Send any document (CSV, TXT, image, etc.) to OpenAI GPT-4o and extract stock data.
 */
export async function parseStockWithOpenAI(
  file: File,
  apiKey: string
): Promise<{ rows: StockSnapshotRow[] } | { error: string }> {
  const result = await callOpenAIDocument(
    file,
    apiKey,
    SYSTEM_PROMPT,
    'Extract all products and their stock quantities from this POS report.'
  )
  if ('error' in result) return result

  const parsed = parseJsonArray(result.content)
  if ('error' in parsed) return parsed
  if (parsed.length === 0) return { error: 'No products with stock data found in the file.' }

  const rows: StockSnapshotRow[] = (parsed as Record<string, unknown>[])
    .map((item) => {
      const stockRaw = item.stockQty ?? item.stock_qty ?? item.stock ?? item.qty ?? 0
      const stockQty = typeof stockRaw === 'number'
        ? Math.max(0, Math.floor(stockRaw))
        : Math.max(0, Math.floor(parseFloat(String(stockRaw).replace(/[^\d.-]/g, '')) || 0))

      const costRaw = item.unitCost ?? item.unit_cost ?? item.cost ?? null
      const priceRaw = item.unitPrice ?? item.unit_price ?? item.price ?? item.salePrice ?? null
      const unitCost = costRaw !== null ? parseFloat(String(costRaw).replace(/[^\d.-]/g, '')) || undefined : undefined
      const unitPrice = priceRaw !== null ? parseFloat(String(priceRaw).replace(/[^\d.-]/g, '')) || undefined : undefined
      const category = item.category ? String(item.category).trim() : undefined
      const skuRaw = item.sku ?? item.SKU ?? item.product_code ?? item.code ?? item.plu ?? item.barcode ?? null
      const rawSku = skuRaw ? String(skuRaw).trim() : undefined

      return {
        rawName: String(item.name ?? item.product ?? item.description ?? '').trim(),
        rawBrand: String(item.brand ?? '').trim(),
        rawSku: rawSku || undefined,
        stockQty,
        matchedProductId: null,
        unitCost: unitCost && unitCost > 0 ? unitCost : undefined,
        unitPrice: unitPrice && unitPrice > 0 ? unitPrice : undefined,
        category: category || undefined,
      }
    })
    .filter((r) => r.rawName.length > 0)

  if (rows.length === 0) return { error: 'No valid products extracted from the file.' }
  return { rows }
}
