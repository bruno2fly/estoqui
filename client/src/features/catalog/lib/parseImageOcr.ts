import type { ProductRow } from './productsCsv'
import { callOpenAIVision, parseJsonArray } from '@/shared/lib/openaiVision'

const SYSTEM_PROMPT = `You are a product catalog data extractor. The user will provide a screenshot of a product ordering app or catalog. Extract every product visible in the image.

For each product, return:
- sku: the numeric product ID/code shown (e.g. "10838")
- name: the full product name (e.g. "Xicara Cafe Espres Americano(511088) 12 X 90Ml")
- brand: the brand name if identifiable (e.g. "Fofo", "Mon Bijou", "Alumil"), otherwise empty string
- unitSize: the pack size if visible (e.g. "12X500ml", "6 X 1,7L"), otherwise empty string

Return ONLY a JSON array of objects. No markdown, no explanation. Example:
[{"sku":"10838","name":"Xicara Cafe Espres Americano 12 X 90Ml","brand":"","unitSize":"12 X 90Ml"}]

If you cannot find any products, return an empty array: []`

/**
 * Send an image to OpenAI GPT-4o vision and extract product data.
 */
export async function parseImageWithOpenAI(
  file: File,
  apiKey: string
): Promise<{ products: ProductRow[] } | { error: string }> {
  const result = await callOpenAIVision(
    file,
    apiKey,
    SYSTEM_PROMPT,
    'Extract all products from this catalog screenshot.'
  )
  if ('error' in result) return result

  const parsed = parseJsonArray(result.content)
  if ('error' in parsed) return parsed
  if (parsed.length === 0) return { error: 'No products found in the image.' }

  const products: ProductRow[] = (parsed as Record<string, unknown>[])
    .map((item) => ({
      sku: String(item.sku ?? '').trim(),
      name: String(item.name ?? '').trim(),
      brand: String(item.brand ?? '').trim(),
      category: String(item.category ?? '').trim(),
      unitSize: String(item.unitSize ?? item.unit_size ?? '').trim(),
      minStock: 10,
    }))
    .filter((p) => p.name.length > 0)

  if (products.length === 0) return { error: 'No valid products extracted from the image.' }
  return { products }
}
