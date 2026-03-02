import { callOpenAIDocument, parseJsonArray } from '@/shared/lib/openaiVision'
import type { VendorPriceRow } from './vendorCsv'

const SYSTEM_PROMPT = `You are a vendor price list data extractor. The user will provide a file from a vendor/supplier — it could be a screenshot/image, a PDF price list, a CSV, TXT, HTML, or any other document format. Extract every product visible along with its price.

For each product, return:
- sku: the numeric product ID/code if shown (e.g. "10838"), otherwise empty string
- name: the full product name (e.g. "Amaciante Fofo Conc Azul Tudao 12X500ml")
- brand: the brand name if identifiable (e.g. "Fofo", "Mon Bijou"), otherwise empty string
- price: the unit price as a number (e.g. 39.99). If price shows as "$39.99" or "R$ 39,99", return just the number 39.99

Return ONLY a JSON array of objects. No markdown, no explanation. Example:
[{"sku":"10387","name":"Amaciante Fofo Conc Azul Tudao 12X500ml","brand":"Fofo","price":39.99}]

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
      return {
        sku: String(item.sku ?? '').trim(),
        name: String(item.name ?? '').trim(),
        brand: String(item.brand ?? '').trim(),
        unitSize: String(item.unit_size ?? item.unitSize ?? '').trim(),
        unitType: String(item.unit_type ?? item.unitType ?? '').trim(),
        price: Number.isNaN(price) ? 0 : price,
        available: true,
      }
    })
    .filter((p) => p.name.length > 0 && p.price > 0)

  if (prices.length === 0) return { error: 'No valid products with prices extracted from the file.' }
  return { prices }
}
