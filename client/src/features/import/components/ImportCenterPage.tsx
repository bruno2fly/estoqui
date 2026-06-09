import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { useCatalogStore } from '@/store/catalogStore'
import { FileUpload, useToast } from '@/shared/components'
import { parseVendorCatalogCsv } from '@/lib/import/csvImport'
import { DataHealthPanel } from './DataHealthPanel'

export function ImportCenterPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const vendors = useStore((s) => s.vendors)
  const importUploads = useCatalogStore((s) => s.importUploads)

  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '')
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    if (!vendorId) {
      toast.show('Select a vendor first', 'error')
      return
    }
    setUploading(true)
    try {
      const text = await file.text()
      const result = parseVendorCatalogCsv(text, vendorId, file.name)
      toast.show(
        `Imported ${result.rowCount} rows: ${result.resolvedCount} resolved, ${result.unresolvedCount} need SKU` +
        (result.skippedCount > 0 ? `, ${result.skippedCount} skipped` : '')
      )
      navigate(`/imports/${result.uploadId}`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Import failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <DataHealthPanel />

      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-fg">Upload Vendor Catalog CSV</h2>
            <p className="text-xs text-fg-secondary">Import a vendor's full catalog and resolve to your products</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-fg mb-1.5">Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full max-w-xs bg-input-bg border border-input-border text-fg px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">Select vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <FileUpload
            accept=".csv"
            onFile={handleFile}
            label={uploading ? 'Processing...' : 'Drop CSV or click to upload'}
          />
        </div>
      </div>

      <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-semibold text-fg mb-5">Import History</h3>
        {importUploads.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">No imports yet</p>
        ) : (
          <div className="border border-surface-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider px-3 py-3 bg-surface-hover/40 border-b border-surface-border">Date</th>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider px-3 py-3 bg-surface-hover/40 border-b border-surface-border">Vendor</th>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider px-3 py-3 bg-surface-hover/40 border-b border-surface-border">File</th>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider px-3 py-3 bg-surface-hover/40 border-b border-surface-border">Rows</th>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider px-3 py-3 bg-surface-hover/40 border-b border-surface-border">Resolved</th>
                  <th className="text-left text-muted font-semibold text-[11px] uppercase tracking-wider px-3 py-3 bg-surface-hover/40 border-b border-surface-border">Unresolved</th>
                  <th className="text-right text-muted font-semibold text-[11px] uppercase tracking-wider px-3 py-3 bg-surface-hover/40 border-b border-surface-border"></th>
                </tr>
              </thead>
              <tbody>
                {importUploads.map((u) => {
                  const vendor = vendors.find((v) => v.id === u.vendorId)
                  return (
                    <tr
                      key={u.id}
                      className="border-t border-surface-border hover:bg-surface-hover transition-colors"
                    >
                      <td className="px-3 py-3 text-[13px] text-fg">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg">{vendor?.name ?? u.vendorId}</td>
                      <td className="px-3 py-3 text-[13px] text-fg-secondary truncate max-w-[140px]">
                        {u.fileName ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg tabular-nums">{u.rowCount}</td>
                      <td className="px-3 py-3 text-[13px] tabular-nums text-success">{u.resolvedCount}</td>
                      <td className="px-3 py-3 text-[13px] tabular-nums text-warning">{u.unresolvedCount}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/imports/${u.id}`)}
                          className="px-3 py-1.5 rounded-lg bg-surface border border-surface-border text-fg text-[11px] font-medium hover:bg-surface-hover hover:border-primary/40 transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
