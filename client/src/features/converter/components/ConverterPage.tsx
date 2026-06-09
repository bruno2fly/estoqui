import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { useStore } from '@/store'
import { Button } from '@/shared/components'
import { useToast } from '@/shared/components'
import { callOpenAIDocument } from '@/shared/lib/openaiVision'
import * as XLSX from 'xlsx'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface ExtractedRow {
  code: string
  name: string
  brand: string
  size: string
  packSize: string
  price: string
  confidence: 'high' | 'medium' | 'low'
}

type Step = 'upload' | 'processing' | 'edit' | 'done'

// ────────────────────────────────────────────────────────────────────────────
// Prompt — simple table extraction, returns TSV-like rows for max product count
// ────────────────────────────────────────────────────────────────────────────

const EXTRACT_PROMPT = `You are a structured data extraction engine. The user will provide a vendor document (image, PDF, spreadsheet screenshot, or text file) that contains product data.

Extract EVERY product row into a simple format. Do NOT skip any rows. If there are 50 products, return 50 rows. If there are 200, return 200.

For each product, extract these fields (use | as separator):
CODE | PRODUCT_NAME | BRAND | SIZE | PACK_SIZE | PRICE

Rules:
- CODE: product code/SKU/item number as shown, or empty
- PRODUCT_NAME: clean readable product name
- BRAND: brand if identifiable, or empty
- SIZE: unit size (e.g. "500ml", "1kg", "12oz"), or empty
- PACK_SIZE: case/pack notation (e.g. "24x", "12 units", "cx 24"), or empty if single unit
- PRICE: numeric price only (no $ or R$, use . for decimals), or empty if no price shown
- Do NOT confuse stock quantity, "on hand", "qty", or inventory counts with PRICE
- Do NOT include category headers, totals, notes, or empty rows
- EVERY field must be present (use empty string if missing)

Output format — one header line then one line per product:
CODE|PRODUCT_NAME|BRAND|SIZE|PACK_SIZE|PRICE
72022|Chavena & 1Pires Expresso Branca|Chavena||1+1|
16810|3 Coracoes Cafe Gourmet Dark Drip|3 Coracoes|10ct|12x|

No JSON, no markdown, no explanation. Just the pipe-separated lines.`

// ────────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ────────────────────────────────────────────────────────────────────────────

function parseResponse(text: string): ExtractedRow[] {
  const lines = text.trim().split('\n').filter((l) => l.trim())
  const rows: ExtractedRow[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Skip header line
    if (/^CODE\s*\|/i.test(line)) continue
    // Skip lines that look like markdown or explanations
    if (line.startsWith('#') || line.startsWith('```') || line.startsWith('---')) continue

    const parts = line.split('|').map((p) => p.trim())
    if (parts.length < 2) continue

    const name = parts[1] || ''
    if (!name) continue // Need at least a name

    rows.push({
      code: parts[0] || '',
      name,
      brand: parts[2] || '',
      size: parts[3] || '',
      packSize: parts[4] || '',
      price: parts[5] || '',
      confidence: 'high',
    })
  }
  return rows
}

function rowsToCsv(rows: ExtractedRow[]): string {
  const header = 'item,product_name,brand,unit_size,pack_size,price'
  const dataLines = rows.map((r) => {
    const escape = (s: string) => {
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    return [r.code, r.name, r.brand, r.size, r.packSize, r.price].map(escape).join(',')
  })
  return [header, ...dataLines].join('\n')
}

function rowsToExcel(rows: ExtractedRow[]): ArrayBuffer {
  const data = [
    ['item', 'product_name', 'brand', 'unit_size', 'pack_size', 'price'],
    ...rows.map((r) => [r.code, r.name, r.brand, r.size, r.packSize, r.price]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // item
    { wch: 40 }, // product_name
    { wch: 18 }, // brand
    { wch: 10 }, // unit_size
    { wch: 12 }, // pack_size
    { wch: 10 }, // price
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Products')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function ConverterPage() {
  const toast = useToast()
  const settings = useStore((s) => s.settings)
  const apiKey = settings?.openaiApiKey ?? ''

  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [rows, setRows] = useState<ExtractedRow[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // --- File handling ---
  const handleFile = useCallback((f: File) => {
    setFile(f)
    setErrorMsg('')
  }, [])

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  // --- Process file ---
  const processFile = async () => {
    if (!file || !apiKey) return
    setStep('processing')
    setErrorMsg('')

    try {
      const result = await callOpenAIDocument(
        file,
        apiKey,
        EXTRACT_PROMPT,
        'Extract all products from this vendor document. Return every single product row.',
        16384
      )

      if ('error' in result) {
        setErrorMsg(result.error)
        setStep('upload')
        return
      }

      const parsed = parseResponse(result.content)
      if (parsed.length === 0) {
        setErrorMsg('No products found in the file. Try a different file format.')
        setStep('upload')
        return
      }

      setRows(parsed)
      setStep('edit')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process file')
      setStep('upload')
    }
  }

  // --- Edit handlers ---
  const updateCell = (idx: number, field: keyof ExtractedRow, value: string) => {
    setRows((prev) => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      return copy
    })
  }

  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { code: '', name: '', brand: '', size: '', packSize: '', price: '', confidence: 'medium' },
    ])
  }

  // --- Download ---
  const downloadCsv = () => {
    const csv = rowsToCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const baseName = file?.name?.replace(/\.[^.]+$/, '') ?? 'converted'
    a.download = `${baseName}_products.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.show(`Downloaded ${rows.length} products as CSV!`)
    setStep('done')
  }

  const downloadExcel = () => {
    const buffer = rowsToExcel(rows)
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const baseName = file?.name?.replace(/\.[^.]+$/, '') ?? 'converted'
    a.download = `${baseName}_products.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toast.show(`Downloaded ${rows.length} products as Excel!`)
    setStep('done')
  }

  // --- Reset ---
  const reset = () => {
    setStep('upload')
    setFile(null)
    setRows([])
    setErrorMsg('')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
            <polyline points="21 16 21 21 16 21" />
            <line x1="15" y1="15" x2="21" y2="21" />
            <line x1="4" y1="4" x2="9" y2="9" />
          </svg>
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-fg">File Converter</h1>
          <p className="text-sm text-fg-secondary mt-0.5">
            Drop any vendor file (screenshot, PDF, Excel, image) and convert it to a clean CSV or Excel file ready for import.
          </p>
        </div>
      </div>

      {/* API key warning */}
      {!apiKey && (
        <div className="flex items-start gap-3 bg-warning-bg border border-warning/40 rounded-xl px-4 py-3 text-sm text-warning-foreground">
          <svg className="size-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            OpenAI API key required for image/PDF conversion. Go to <strong>Settings</strong> to add your key.
            <span className="block text-xs opacity-80 mt-0.5">Excel and CSV files don't need AI — they'll be converted directly.</span>
          </div>
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            className={`
              flex flex-col items-center justify-center border-2 border-dashed rounded-2xl px-6 py-12 cursor-pointer transition-colors text-center
              ${dragging
                ? 'border-primary bg-primary/5'
                : 'border-surface-border hover:border-primary/40 hover:bg-surface-hover'}
            `}
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground mb-4">
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 12 15 15" />
              </svg>
            </span>
            <p className="text-base text-fg font-semibold">
              Drop any vendor file here
            </p>
            <p className="text-sm text-muted mt-1">
              Screenshots, PDF, Excel, CSV, images — anything with product data
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.csv,.tsv,.xlsx,.xls,.xlsm,.txt,.html,.htm"
            onChange={handleChange}
            className="hidden"
          />

          {file && (
            <div className="bg-surface border border-surface-border rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium text-fg">{file.name}</p>
                  <p className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs font-medium text-danger hover:text-danger/80 px-2.5 py-1 rounded-lg hover:bg-danger-bg transition-colors"
              >
                Remove
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="bg-danger-bg border border-danger/30 text-danger text-sm p-3 rounded-xl">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={processFile} disabled={!file || (!apiKey && isImageOrPdf(file))}>
              Convert to CSV
            </Button>
          </div>

          {/* How it works */}
          <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-fg">How it works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs text-fg-secondary">
              <div className="space-y-2">
                <div className="size-8 rounded-xl bg-accent flex items-center justify-center text-accent-foreground font-bold text-sm">1</div>
                <p className="font-medium text-fg">Upload any file</p>
                <p>Screenshot from WhatsApp, PDF price list, Excel spreadsheet, or any image with product data.</p>
              </div>
              <div className="space-y-2">
                <div className="size-8 rounded-xl bg-accent flex items-center justify-center text-accent-foreground font-bold text-sm">2</div>
                <p className="font-medium text-fg">AI extracts the data</p>
                <p>GPT-4o reads the file and pulls out product codes, names, brands, sizes, packs, and prices.</p>
              </div>
              <div className="space-y-2">
                <div className="size-8 rounded-xl bg-accent flex items-center justify-center text-accent-foreground font-bold text-sm">3</div>
                <p className="font-medium text-fg">Review & download</p>
                <p>Edit any mistakes in the table, then download as CSV or Excel. Import it into any vendor.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Processing */}
      {step === 'processing' && (
        <div className="space-y-4 py-12 text-center bg-surface border border-surface-border rounded-2xl shadow-sm">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-accent">
            <svg className="size-6 text-accent-foreground animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-fg">Analyzing your file...</p>
          <p className="text-sm text-muted">AI is reading {file?.name} and extracting product data</p>
          <div className="max-w-xs mx-auto h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* STEP 3: Edit table */}
      {step === 'edit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-fg">
              <strong>{rows.length}</strong> products extracted from <strong>{file?.name}</strong>. Edit anything below, then download.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addRow}
                className="text-xs text-primary hover:text-primary/80 font-medium"
              >
                + Add row
              </button>
            </div>
          </div>

          <div className="border border-surface-border rounded-2xl overflow-hidden shadow-sm">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-surface-hover/80 backdrop-blur z-10">
                  <tr className="border-b border-surface-border">
                    <th className="py-2.5 px-2 text-left text-muted font-semibold uppercase tracking-wider w-8">#</th>
                    <th className="py-2.5 px-2 text-left text-muted font-semibold uppercase tracking-wider w-[100px]">Code</th>
                    <th className="py-2.5 px-2 text-left text-muted font-semibold uppercase tracking-wider">Product Name</th>
                    <th className="py-2.5 px-2 text-left text-muted font-semibold uppercase tracking-wider w-[120px]">Brand</th>
                    <th className="py-2.5 px-2 text-left text-muted font-semibold uppercase tracking-wider w-[80px]">Size</th>
                    <th className="py-2.5 px-2 text-left text-muted font-semibold uppercase tracking-wider w-[80px]">Pack</th>
                    <th className="py-2.5 px-2 text-right text-muted font-semibold uppercase tracking-wider w-[80px]">Price</th>
                    <th className="py-2.5 px-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-surface-border hover:bg-surface-hover/50">
                      <td className="py-1 px-2 text-muted">{i + 1}</td>
                      <td className="py-1 px-1">
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-surface-border focus:border-primary text-fg px-1.5 py-1 rounded-md text-xs outline-none transition-colors"
                          value={row.code}
                          onChange={(e) => updateCell(i, 'code', e.target.value)}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-surface-border focus:border-primary text-fg px-1.5 py-1 rounded-md text-xs outline-none transition-colors"
                          value={row.name}
                          onChange={(e) => updateCell(i, 'name', e.target.value)}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-surface-border focus:border-primary text-fg px-1.5 py-1 rounded-md text-xs outline-none transition-colors"
                          value={row.brand}
                          onChange={(e) => updateCell(i, 'brand', e.target.value)}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-surface-border focus:border-primary text-fg px-1.5 py-1 rounded-md text-xs outline-none transition-colors"
                          value={row.size}
                          onChange={(e) => updateCell(i, 'size', e.target.value)}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-surface-border focus:border-primary text-fg px-1.5 py-1 rounded-md text-xs outline-none transition-colors"
                          value={row.packSize}
                          onChange={(e) => updateCell(i, 'packSize', e.target.value)}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <input
                          className="w-full bg-transparent border border-transparent hover:border-surface-border focus:border-primary text-fg px-1.5 py-1 rounded text-xs text-right outline-none"
                          value={row.price}
                          onChange={(e) => updateCell(i, 'price', e.target.value)}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <button
                          type="button"
                          onClick={() => deleteRow(i)}
                          className="text-danger/60 hover:text-danger"
                          title="Delete row"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Download buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={downloadCsv}>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download CSV
              </span>
            </Button>
            <Button variant="secondary" onClick={downloadExcel}>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Excel
              </span>
            </Button>
            <Button variant="secondary" onClick={reset}>
              Convert another file
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Done */}
      {step === 'done' && (
        <div className="text-center py-12 space-y-4 bg-surface border border-surface-border rounded-2xl shadow-sm">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-success-bg">
            <svg className="size-7 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-fg">File converted successfully!</p>
          <p className="text-sm text-muted">
            {rows.length} products exported. You can now import this file in the Vendors page using "Import CSV / Excel".
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={reset}>Convert another file</Button>
            <Button variant="secondary" onClick={() => { setStep('edit') }}>
              Back to table
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function isImageOrPdf(file: File | null): boolean {
  if (!file) return false
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  return imageTypes.includes(file.type) || /\.(png|jpe?g|webp|gif|pdf)$/i.test(file.name)
}
