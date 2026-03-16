import { callOpenAIDocument, parseJsonArray } from '@/shared/lib/openaiVision'
import { parsePackFromText } from '@/lib/pack/parsePack'
import type { VendorPriceRow } from './vendorCsv'

const SYSTEM_PROMPT = `You are a vendor price list data extractor. The user will provide a file from a vendor/supplier — it could be a screenshot/image, a PDF price list, a CSV, TXT, HTML, or any other document format. Extract every product visible along with its price.

IMPORTANT: Vendors sell products by CASE (multiple units bundled together). Pay close attention to case/pack notation in product names.

For each product, return:
- sku: the product ID/code if shown (e.g. "10838", "B0010"), otherwise empty string
- name: the FULL product name exactly as shown, including any case/pack info (e.g. "La Cascada Fresa / Strawberry 24 x 12 oz Bottle", "Detergente Ype Coco Fr 24 X 500Ml")
- brand: the brand name if identifiable (e.g. "La Cascada", "Ype"), otherwise empty string
- price: the price as a number (e.g. 15.50). This is typically the CASE price. If price shows as "$15.50" or "R$ 39,99", return just the number
- units_per_case: if the name contains case notation like "24 x", "12x", "6 X", extract the number of units per case (e.g. 24). If sold as single unit, return 1
- unit_size: the individual unit size if shown (e.g. "12 oz", "500ml", "2 Lts"), otherwise empty string

Return ONLY a JSON array of objects. No markdown, no explanation. Example:
[{"sku":"B0010","name":"La Cascada Fresa / Strawberry 24 x 12 oz Bottle","brand":"La Cascada","price":15.50,"units_per_case":24,"unit_size":"12 oz"}]

If you cannot find any products with prices, return an empty array: []`

/**
 * Send any file (image, PDF, CSV, TXT, etc.) to OpenAI GPT-4o and extract vendor price data.
 */
export async function parseVendorPriceImageWithOpenAI(
  file: File,
  apiKey: string
): Promise<{ prices: VendorPriceRow[] } | { error: string }> {
  const result = await callOpenAIDocument(
    file,
    apiKey,
    SYSTEM_PROMPT,
    'Extract all products and their prices from this vendor price list / catalog.'
  )
  if ('error' in result) return result

  const parsed = parseJsonArray(result.content)
  if ('error' in parsed) return parsed
  if (parsed.length === 0) return { error: 'No products with prices found in the file.' }

  const prices: VendorPriceRow[] = (parsed as Record<string, unknown>[])
    .map((item) => {
      const priceRaw = item.price ?? item.unitPrice ?? item.unit_price ?? 0
      const price = typeof priceRaw === 'number'
        ? priceRaw
        : parseFloat(String(priceRaw).replace(/[R$,]/g, '.').replace(/\.(?=.*\.)/g, ''))
      const name = String(item.name ?? '').trim()

      // Use AI-extracted units_per_case if available, otherwise detect from name
      const aiUnits = Number(item.units_per_case ?? item.unitsPerCase ?? 0)
      const pack = parsePackFromText(name)
      const unitsPerCase = aiUnits > 1 ? aiUnits : pack.unitsPerCase
      const packType = unitsPerCase > 1 ? 'CASE' as const : 'UNIT' as const
      const priceBasis = packType === 'CASE' ? 'PER_CASE' as const : 'PER_UNIT' as const

      return {
        sku: String(item.sku ?? '').trim(),
        name,
        brand: String(item.brand ?? '').trim(),
        unitSize: String(item.unit_size ?? item.unitSize ?? '').trim(),
        unitType: String(item.unit_type ?? item.unitType ?? '').trim(),
        price: Number.isNaN(price) ? 0 : price,
        available: true,
        packType,
        unitsPerCase,
        unitDescriptor: pack.unitDescriptor,
        priceBasis,
      }
    })
    .filter((p) => p.name.length > 0 && p.price > 0)

  if (prices.length === 0) return { error: 'No valid products with prices extracted from the file.' }
  return { prices }
}
