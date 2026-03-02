import { useState, useCallback } from 'react'
import { useCatalogMatchStore } from '@/store/catalogMatchStore'
import { useToast, FileUpload } from '@/shared/components'
import { VendorMatchReviewTable } from './VendorMatchReviewTable'
import type { RawPosRow, RawVendorRow } from '@/lib/catalogMatch/types'

type ImportMode = 'vendor' | 'pos'

/**
 * Simple CSV line parser that handles quoted fields.
 */
function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; continue }
      if (ch === '"') { inQuotes = false; continue }
      current += ch
    } else {
      if (ch === '"') { inQuotes = true; continue }
      if (ch === sep) { result.push(current.trim()); current = ''; continue }
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function detectSep(header: string): string {
  if (header.includes('\t')) return '\t'
  if (header.includes(';')) return ';'
  return ','
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function parsePrice(raw: string): number {
  return parseFloat(raw.replace(/[R$\s]/g, '').replace(',', '.')) || 0
}

export function MatchingPage() {
  const toast = useToast()
  const masterProducts = useCatalogMatchStore((s) => s.masterProducts)
  const matchResults = useCatalogMatchStore((s) => s.matchResults)
  const aliases = useCatalogMatchStore((s) => s.aliases)
  const importPosRows = useCatalogMatchStore((s) => s.importPosRows)
  const importVendorRows = useCatalogMatchStore((s) => s.importVendorRows)
  const clearMatchResults = useCatalogMatchStore((s) => s.clearMatchResults)

  const [mode, setMode] = useState<ImportMode>('vendor')

  const handlePosFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const lines = text.replace(/^\uFEFF/, '').split('\n').filter((l) => l.trim())
      if (lines.length < 2) { toast.show('CSV must have header + data', 'error'); return }

      const sep = detectSep(lines[0])
      const headers = parseCsvLine(lines[0], sep).map(norm)

      const nameIdx = headers.findIndex((h) => /\b(name|produto|nome|product|descri)\b/.test(h))
      const brandIdx = headers.findIndex((h) => /\b(brand|marca)\b/.test(h))
      const barcodeIdx = headers.findIndex((h) => /\b(barcode|ean|gtin|codigo|code)\b/.test(h))
      const priceIdx = headers.findIndex((h) => /\b(price|preco|unit|valor)\b/.test(h))
      const qtyIdx = headers.findIndex((h) => /\b(qty|qtd|stock|estoque|quantity)\b/.test(h))

      if (nameIdx === -1) { toast.show('CSV needs a Name/Product column', 'error'); return }

      const rows: RawPosRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const parts = parseCsvLine(lines[i], sep)
        const name = parts[nameIdx]?.trim()
        if (!name) continue
        rows.push({
          name,
          brand: brandIdx >= 0 ? parts[brandIdx]?.trim() : undefined,
          barcode: barcodeIdx >= 0 ? parts[barcodeIdx]?.trim() : undefined,
          unitPrice: priceIdx >= 0 ? parsePrice(parts[priceIdx] ?? '0') : undefined,
          stockQty: qtyIdx >= 0 ? parseFloat(parts[qtyIdx] ?? '0') || undefined : undefined,
        })
      }

      if (rows.length === 0) { toast.show('No valid rows found', 'error'); return }
      importPosRows(rows, 'pos-import')
      toast.show(`${rows.length} POS items imported into master catalog`)
    }
    reader.readAsText(file)
  }, [importPosRows, toast])

  const handleVendorFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const lines = text.replace(/^\uFEFF/, '').split('\n').filter((l) => l.trim())
      if (lines.length < 2) { toast.show('CSV must have header + data', 'error'); return }

      const sep = detectSep(lines[0])
      const headers = parseCsvLine(lines[0], sep).map(norm)

      const nameIdx = headers.findIndex((h) => /\b(name|produto|nome|product|descri)\b/.test(h))
      const brandIdx = headers.findIndex((h) => /\b(brand|marca)\b/.test(h))
      const skuIdx = headers.findIndex((h) => /\b(sku|codigo|code)\b/.test(h))
      const priceIdx = headers.findIndex((h) => /\b(price|preco|valor|case|caixa)\b/.test(h))
      const barcodeIdx = headers.findIndex((h) => /\b(barcode|ean|gtin)\b/.test(h))

      if (nameIdx === -1 || priceIdx === -1) {
        toast.show('CSV needs Name and Price columns', 'error')
        return
      }

      const rows: RawVendorRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const parts = parseCsvLine(lines[i], sep)
        const name = parts[nameIdx]?.trim()
        const price = parsePrice(parts[priceIdx] ?? '0')
        if (!name || price <= 0) continue
        rows.push({
          name,
          brand: brandIdx >= 0 ? parts[brandIdx]?.trim() : undefined,
          vendorSku: skuIdx >= 0 ? parts[skuIdx]?.trim() : undefined,
          casePrice: price,
          barcode: barcodeIdx >= 0 ? parts[barcodeIdx]?.trim() : undefined,
        })
      }

      if (rows.length === 0) { toast.show('No valid vendor rows found', 'error'); return }
      importVendorRows(rows, 'vendor-import')
      toast.show(`${rows.length} vendor items matched against catalog`)
    }
    reader.readAsText(file)
  }, [importVendorRows, toast])

  const reviewCount = matchResults.filter((r) => r.status === 'needs_review').length

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Master Products" value={masterProducts.length} />
        <StatCard label="Aliases" value={aliases.length} />
        <StatCard label="Match Results" value={matchResults.length} />
        <StatCard label="Needs Review" value={reviewCount} highlight={reviewCount > 0} />
      </div>

      {/* Import section */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-[13px] font-semibold text-fg">Import & Match</span>
          </div>
          {matchResults.length > 0 && (
            <button
              type="button"
              onClick={clearMatchResults}
              className="px-3 py-1.5 rounded-lg border border-surface-border text-[11px] font-medium text-fg-secondary hover:bg-surface-hover transition-colors"
            >
              Clear Results
            </button>
          )}
        </div>

        <div className="flex gap-2 border-b border-surface-border pb-2 mb-4">
          <button
            type="button"
            onClick={() => setMode('pos')}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              mode === 'pos' ? 'bg-fg text-background' : 'text-muted hover:text-fg'
            }`}
          >
            1. Import POS / Master Catalog
          </button>
          <button
            type="button"
            onClick={() => setMode('vendor')}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              mode === 'vendor' ? 'bg-fg text-background' : 'text-muted hover:text-fg'
            }`}
          >
            2. Import Vendor Price List
          </button>
        </div>

        {mode === 'pos' ? (
          <div>
            <p className="text-[12px] text-fg-secondary mb-3">
              Import your POS inventory or master product list first. Each row becomes a master product
              that vendor items will match against. Columns: Name (required), Brand, Barcode, Price, Qty.
            </p>
            <FileUpload accept=".csv,.tsv,.txt" onFile={handlePosFile} label="Upload POS / Master CSV" />
          </div>
        ) : (
          <div>
            <p className="text-[12px] text-fg-secondary mb-3">
              Import a vendor price list to match against your master catalog.
              Columns: Name (required), Price (required), Brand, SKU, Barcode.
              Pack patterns like "12 x 360 grs" are auto-detected.
            </p>
            <FileUpload accept=".csv,.tsv,.txt" onFile={handleVendorFile} label="Upload Vendor Price List CSV" />
          </div>
        )}
      </div>

      {/* Review table */}
      {matchResults.length > 0 && (
        <div className="bg-surface border border-surface-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span className="text-[13px] font-semibold text-fg">Match Review</span>
          </div>
          <VendorMatchReviewTable />
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="border border-surface-border rounded-xl p-3.5">
      <p className="text-[11px] text-fg-secondary leading-tight">{label}</p>
      <p className={`text-[22px] font-bold leading-none tabular-nums mt-0.5 ${highlight ? 'text-amber-500' : 'text-fg'}`}>
        {String(value).padStart(2, '0')}
      </p>
    </div>
  )
}
