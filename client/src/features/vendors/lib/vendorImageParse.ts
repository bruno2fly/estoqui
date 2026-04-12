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
* CRITICAL: extract EVERY SINGLE product row visible. Do not stop early. If there are 50 products, return all 50. If there are 200 products, return all 200. Never truncate the list.

OUTPUT
Return ONLY a JSON array (no wrapper object, no markdown). Use SHORT keys to save tokens:
[{"r":"raw text","sc":"source code","s":"sku","n":"product name","b":"brand","sv":null,"su":"","cq":null,"p":null,"cf":"high"}]

Key mapping: r=raw_text, sc=source_code, s=sku, n=product_name, b=brand, sv=size_value, su=size_unit, cq=case_quantity, p=price, cf=confidence

If you cannot find any products, return: []`

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

  // Parse response — supports bare array (short keys) or {products:[...]} wrapper
  let items: Record<string, unknown>[]
  const content = result.content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  try {
    const obj = JSON.parse(content)
    if (Array.isArray(obj)) {
      items = obj as Record<string, unknown>[]
    } else if (obj && Array.isArray(obj.products)) {
      items = obj.products as Record<string, unknown>[]
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
      // Support both short keys (n, p, s, b, sv, su, cq, r) and long keys
      // --- Price ---
      const priceRaw = item.p ?? item.price ?? 0
      const price = typeof priceRaw === 'number'
        ? priceRaw
        : parseFloat(String(priceRaw).replace(/[R$,]/g, '.').replace(/\.(?=.*\.)/g, ''))

      // --- Name ---
      const name = String(item.n ?? item.product_name ?? item.name ?? '').trim()

      // --- SKU ---
      const rawSku = String(item.s ?? item.sku ?? '').trim()
      const sku = rawSku === 'missing' ? '' : rawSku

      // --- Brand ---
      const brand = String(item.b ?? item.brand ?? '').trim()

      // --- Size ---
      const sizeVal = item.sv ?? item.size_value ?? item.sizeValue ?? null
      const sizeUnit = String(item.su ?? item.size_unit ?? item.sizeUnit ?? '').trim()
      const unitSize = sizeVal != null && sizeUnit
        ? `${sizeVal}${sizeUnit}`
        : sizeUnit || ''

      // --- Case quantity ---
      const aiCaseQty = Number(item.cq ?? item.case_quantity ?? item.caseQuantity ?? 0)
      // Fallback to regex detection from the full product name / raw_text
      const rawText = String(item.r ?? item.raw_text ?? item.rawText ?? name)
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
