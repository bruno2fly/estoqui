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

      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <h3 className="text-[15px] font-semibold text-fg mb-4">Upload Vendor Catalog CSV</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-fg mb-1.5">Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full max-w-xs bg-input-bg border border-input-border text-fg px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:border-primary"
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

      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <h3 className="text-[15px] font-semibold text-fg mb-4">Import History</h3>
        {importUploads.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">No imports yet</p>
        ) : (
          <div className="border border-surface-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Date</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Vendor</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">File</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Rows</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Resolved</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Unresolved</th>
                  <th className="text-right text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3"></th>
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
                      <td className="px-3 py-3 text-[13px] tabular-nums">{u.rowCount}</td>
                      <td className="px-3 py-3 text-[13px] tabular-nums text-emerald-600">{u.resolvedCount}</td>
                      <td className="px-3 py-3 text-[13px] tabular-nums text-amber-600">{u.unresolvedCount}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/imports/${u.id}`)}
                          className="px-3 py-1.5 rounded-md bg-fg text-background text-[11px] font-medium hover:opacity-80"
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
