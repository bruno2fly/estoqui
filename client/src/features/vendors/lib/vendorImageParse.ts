import { callOpenAIDocument, parseJsonArray } from '@/shared/lib/openaiVision'
import { parsePackFromText } from '@/lib/pack/parsePack'
import type { VendorPriceRow } from './vendorCsv'

const SYSTEM_PROMPT = `You are a structured data extraction engine for Estoqui, a SaaS platform used by Brazilian grocery stores in the USA.
You are NOT a general assistant. You must behave like a strict parser.
The input is a vendor document (PDF, image, screenshot, or text) that may contain:
* messy layouts
* mixed Portuguese and English
* OCR errors
* inconsistent columns
* repeated sections
* category headers
Your goal is to extract product rows into structured JSON with high precision.

CRITICAL: TWO-STAGE PROCESS

Stage 1 — Detect valid product rows
A valid row must contain:
* a product name AND at least one of:
  * product code (SKU)
  * price
  * size
  * packaging
Ignore:
* categories (Padaria, Sobremesa, etc.)
* headers
* totals
* notes
* empty rows
Do NOT output anything yet.

Stage 2 — Extract fields
For each valid row:

raw_text
* preserve original row text exactly

source_code
* any visible product code or barcode as-is (no strict validation)

sku
* extract a cleaned product identifier using:
  * only A-Z and 0-9
  * remove spaces, dashes, symbols
  * uppercase
* only accept if length is between 8 and 12 characters
* otherwise: "missing"

product_name
* clean readable name
* remove noise
* keep variant info

brand
* extract if clear, else ""

size_value / size_unit
Normalize:
* kg → g (multiply value by 1000)
* g → g
* L → ml (multiply value by 1000)
* ml → ml
If missing: null / ""

case_quantity
* "12 x 350ml" → 12
* "cx 24" → 24
* "c/12" → 12
* "fardo 6" → 6
* single item → 1
* unclear → null

price
* numeric only
* convert comma decimals
* if missing → null
* IMPORTANT: some vendor documents are catalogs/inventory lists WITHOUT prices. Still extract the products — set price to null. Do NOT confuse stock quantity, "on hand", "qty", or inventory counts with price.

confidence
* high: clear structured row
* medium: minor inference
* low: uncertain or OCR issues

STRICT RULES
* do not invent data
* do not hallucinate SKU
* do not include categories
* do not merge rows

OUTPUT
Return only JSON:
{"products":[{"raw_text":"","source_code":"","sku":"","product_name":"","brand":"","size_value":null,"size_unit":"","case_quantity":null,"price":null,"confidence":""}]}

If you cannot find any products, return: {"products":[]}`

/**
 * Send any file (image, PDF, CSV, TXT, etc.) to OpenAI GPT-4o and extract vendor price data.
 * Uses a two-stage structured extraction prompt optimized for Brazilian vendor documents.
 */
export async function parseVendorPriceImageWithOpenAI(
  file: File,
  apiKey: string
): Promise<{ prices: VendorPriceRow[] } | { error: string }> {
  const result = await callOpenAIDocument(
    file,
    apiKey,
    SYSTEM_PROMPT,
    'Extract all products and their prices from this vendor price list / catalog.',
    16384 // Large token limit to handle vendor lists with 100+ products
  )
  if ('error' in result) return result

  // The new prompt returns { "products": [...] } instead of a bare array
  let items: Record<string, unknown>[]
  const content = result.content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  try {
    const obj = JSON.parse(content)
    if (obj && Array.isArray(obj.products)) {
      items = obj.products as Record<string, unknown>[]
    } else if (Array.isArray(obj)) {
      // Fallback: bare array (in case model ignores wrapper)
      items = obj as Record<string, unknown>[]
    } else {
      return { error: 'Response is not in expected format.' }
    }
  } catch {
    // Last resort: try parseJsonArray for bare arrays
    const parsed = parseJsonArray(result.content)
    if ('error' in parsed) return parsed
    items = parsed as Record<string, unknown>[]
  }

  if (items.length === 0) return { error: 'No products found in the file.' }

  const prices: VendorPriceRow[] = items
    .map((item) => {
      // --- Price ---
      const priceRaw = item.price ?? 0
      const price = typeof priceRaw === 'number'
        ? priceRaw
        : parseFloat(String(priceRaw).replace(/[R$,]/g, '.').replace(/\.(?=.*\.)/g, ''))

      // --- Name (prefer product_name from new prompt, fallback to name) ---
      const name = String(item.product_name ?? item.name ?? '').trim()

      // --- SKU (new prompt returns "missing" when not valid 8-12 chars) ---
      const rawSku = String(item.sku ?? '').trim()
      const sku = rawSku === 'missing' ? '' : rawSku

      // --- Brand ---
      const brand = String(item.brand ?? '').trim()

      // --- Size: new prompt returns size_value (number) and size_unit (normalized) ---
      const sizeVal = item.size_value ?? item.sizeValue ?? null
      const sizeUnit = String(item.size_unit ?? item.sizeUnit ?? '').trim()
      const unitSize = sizeVal != null && sizeUnit
        ? `${sizeVal}${sizeUnit}`
        : sizeUnit || ''

      // --- Case quantity: new prompt returns case_quantity directly ---
      const aiCaseQty = Number(item.case_quantity ?? item.caseQuantity ?? 0)
      // Fallback to regex detection from the full product name / raw_text
      const rawText = String(item.raw_text ?? item.rawText ?? name)
      const pack = parsePackFromText(rawText)
      const unitsPerCase = aiCaseQty > 0 ? aiCaseQty : pack.unitsPerCase
      const packType = unitsPerCase > 1 ? 'CASE' as const : 'UNIT' as const
      const priceBasis = packType === 'CASE' ? 'PER_CASE' as const : 'PER_UNIT' as const

      return {
        sku,
        name,
        brand,
        unitSize,
        unitType: sizeUnit,
        price: Number.isNaN(price) ? 0 : price,
        available: true,
        packType,
        unitsPerCase,
        unitDescriptor: pack.unitDescriptor || (sizeVal != null ? `${sizeVal} ${sizeUnit}` : ''),
        priceBasis,
      }
    })
    // Only require a name — products without prices are still valid (catalog imports)
    .filter((p) => p.name.length > 0)

  if (prices.length === 0) return { error: 'No valid products extracted from the file.' }
  return { prices }
}
