/**
 * Bulk screenshot processing: sends batches of images to GPT-4o vision,
 * merges results, and deduplicates by SKU.
 */
import type { VendorPriceRow } from './vendorCsv'
import { parsePackFromText } from '@/lib/pack/parsePack'

/** The same structured extraction prompt from vendorImageParse.ts */
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

export interface BulkParseProgress {
  currentBatch: number
  totalBatches: number
  productsFound: number
  status: 'processing' | 'deduplicating' | 'done' | 'error'
  errorMessage?: string
}

export interface BulkExtractedRow extends VendorPriceRow {
  confidence: 'high' | 'medium' | 'low'
  rawText: string
  sourceCode: string
  sourceImage: string // filename of the source screenshot
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Send a batch of images to GPT-4o in a single API call with multiple image_url entries.
 */
async function processBatch(
  images: File[],
  apiKey: string
): Promise<BulkExtractedRow[]> {
  // Build content array with all images
  const imageContents: unknown[] = []
  for (const img of images) {
    const base64 = await fileToBase64(img)
    imageContents.push({ type: 'image_url', image_url: { url: base64, detail: 'high' } })
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Extract all products and their prices from these ${images.length} vendor catalog screenshots. Each screenshot shows a grid of products with codes, names, prices, and stock info.`,
        },
        ...imageContents,
      ],
    },
  ]

  const body = {
    model: 'gpt-4o',
    messages,
    max_tokens: 16384, // Larger limit for bulk extractions
    temperature: 0,
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    if (response.status === 401) throw new Error('Invalid OpenAI API key.')
    if (response.status === 429) throw new Error('Rate limit reached. Wait a moment and try again.')
    throw new Error(`OpenAI API error (${response.status}): ${text.slice(0, 200)}`)
  }

  const json = await response.json()
  const content: string = json?.choices?.[0]?.message?.content ?? ''

  // Parse the response
  const cleaned = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  let items: Record<string, unknown>[]
  try {
    const obj = JSON.parse(cleaned)
    if (obj && Array.isArray(obj.products)) {
      items = obj.products
    } else if (Array.isArray(obj)) {
      items = obj
    } else {
      return []
    }
  } catch {
    return []
  }

  // Map to BulkExtractedRow
  const fileNames = images.map((f) => f.name).join(', ')
  return items
    .map((item): BulkExtractedRow | null => {
      const priceRaw = item.price ?? 0
      const price =
        typeof priceRaw === 'number'
          ? priceRaw
          : parseFloat(String(priceRaw).replace(/[R$,]/g, '.').replace(/\.(?=.*\.)/g, ''))

      const name = String(item.product_name ?? item.name ?? '').trim()
      if (!name) return null

      const rawSku = String(item.sku ?? '').trim()
      const sku = rawSku === 'missing' ? '' : rawSku
      const brand = String(item.brand ?? '').trim()

      const sizeVal = item.size_value ?? null
      const sizeUnit = String(item.size_unit ?? '').trim()
      const unitSize = sizeVal != null && sizeUnit ? `${sizeVal}${sizeUnit}` : sizeUnit || ''

      const aiCaseQty = Number(item.case_quantity ?? 0)
      const rawText = String(item.raw_text ?? name)
      const pack = parsePackFromText(rawText)
      const unitsPerCase = aiCaseQty > 0 ? aiCaseQty : pack.unitsPerCase
      const packType = unitsPerCase > 1 ? ('CASE' as const) : ('UNIT' as const)
      const priceBasis = packType === 'CASE' ? ('PER_CASE' as const) : ('PER_UNIT' as const)

      const confidence = (['high', 'medium', 'low'].includes(String(item.confidence))
        ? String(item.confidence)
        : 'medium') as 'high' | 'medium' | 'low'

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
        confidence,
        rawText,
        sourceCode: String(item.source_code ?? '').trim(),
        sourceImage: fileNames,
      }
    })
    .filter((r): r is BulkExtractedRow => r !== null)
}

/**
 * Deduplicate rows by SKU (or by name+price if no SKU).
 * Keeps the first occurrence (highest confidence preferred).
 */
export function deduplicateRows(rows: BulkExtractedRow[]): BulkExtractedRow[] {
  // Sort by confidence: high > medium > low
  const confidenceOrder = { high: 0, medium: 1, low: 2 }
  const sorted = [...rows].sort(
    (a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
  )

  const seen = new Map<string, BulkExtractedRow>()
  for (const row of sorted) {
    // Primary key: SKU if available
    const key = row.sku
      ? `sku:${row.sku.toUpperCase()}`
      : `name:${row.name.toLowerCase().replace(/\s+/g, ' ').trim()}|${row.price}`

    if (!seen.has(key)) {
      seen.set(key, row)
    }
  }
  return Array.from(seen.values())
}

/**
 * Main bulk processing function. Processes image batches sequentially,
 * calling onProgress after each batch.
 */
export async function processBulkScreenshots(
  batches: File[][],
  apiKey: string,
  onProgress: (progress: BulkParseProgress) => void
): Promise<BulkExtractedRow[]> {
  const allRows: BulkExtractedRow[] = []

  for (let i = 0; i < batches.length; i++) {
    onProgress({
      currentBatch: i + 1,
      totalBatches: batches.length,
      productsFound: allRows.length,
      status: 'processing',
    })

    try {
      const batchRows = await processBatch(batches[i], apiKey)
      allRows.push(...batchRows)
    } catch (err) {
      // If rate limited, wait and retry once
      if (err instanceof Error && err.message.includes('Rate limit')) {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        try {
          const retryRows = await processBatch(batches[i], apiKey)
          allRows.push(...retryRows)
        } catch (retryErr) {
          onProgress({
            currentBatch: i + 1,
            totalBatches: batches.length,
            productsFound: allRows.length,
            status: 'error',
            errorMessage: `Batch ${i + 1} failed: ${retryErr instanceof Error ? retryErr.message : 'Unknown error'}`,
          })
          // Continue with remaining batches instead of stopping
          continue
        }
      } else {
        onProgress({
          currentBatch: i + 1,
          totalBatches: batches.length,
          productsFound: allRows.length,
          status: 'error',
          errorMessage: `Batch ${i + 1} failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        })
        continue
      }
    }
  }

  // Deduplication phase
  onProgress({
    currentBatch: batches.length,
    totalBatches: batches.length,
    productsFound: allRows.length,
    status: 'deduplicating',
  })

  const deduped = deduplicateRows(allRows)

  onProgress({
    currentBatch: batches.length,
    totalBatches: batches.length,
    productsFound: deduped.length,
    status: 'done',
  })

  return deduped
}
