import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { useCatalogStore } from '@/store/catalogStore'
import { AssignSkuModal } from './AssignSkuModal'
import { CatalogSearch } from './CatalogSearch'
import type { ImportRow } from '@/types/catalog'
import type { CatalogProduct } from '@/types/catalog'

export function ImportUploadDetailPage() {
  const { uploadId } = useParams<{ uploadId: string }>()
  const navigate = useNavigate()
  const vendors = useStore((s) => s.vendors)
  const importUploads = useCatalogStore((s) => s.importUploads)
  const importRows = useCatalogStore((s) => s.importRows)
  const resolveImportRow = useCatalogStore((s) => s.resolveImportRow)
  const ignoreImportRow = useCatalogStore((s) => s.ignoreImportRow)
  const upsertCatalogProduct = useCatalogStore((s) => s.upsertCatalogProduct)

  const [tab, setTab] = useState<'resolved' | 'unresolved'>('unresolved')
  const [assignRow, setAssignRow] = useState<ImportRow | null>(null)
  const [matchRow, setMatchRow] = useState<ImportRow | null>(null)
  const [createRow, setCreateRow] = useState<ImportRow | null>(null)

  const upload = importUploads.find((u) => u.id === uploadId)
  const rows = importRows.filter((r) => r.uploadId === uploadId)
  const resolved = rows.filter((r) => r.status === 'resolved')
  const unresolved = rows.filter((r) => r.status === 'unresolved')
  const vendor = vendors.find((v) => v.id === upload?.vendorId)

  const handleAssignSku = (row: ImportRow) => setAssignRow(row)
  const handleMatchProduct = (row: ImportRow) => setMatchRow(row)
  const handleCreateProduct = (row: ImportRow) => setCreateRow(row)
  const handleIgnore = (row: ImportRow) => {
    ignoreImportRow(row.id)
  }

  const handleMatchSelect = (product: CatalogProduct) => {
    if (!matchRow) return
    resolveImportRow(matchRow.id, product.sku, { createMappings: true })
    setMatchRow(null)
  }

  const handleCreateWithSku = (sku: string) => {
    if (!createRow) return
    upsertCatalogProduct({
      sku,
      name: createRow.productName,
      brand: createRow.brand,
      barcode: createRow.barcode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    resolveImportRow(createRow.id, sku, { createMappings: true })
    setCreateRow(null)
  }

  if (!upload) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted">Upload not found</p>
        <button
          type="button"
          onClick={() => navigate('/imports')}
          className="mt-2 text-primary underline"
        >
          Back to imports
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/imports')}
          className="text-fg-secondary hover:text-fg text-[13px]"
        >
          ← Back
        </button>
        <div>
          <h2 className="text-lg font-semibold text-fg">
            {upload.fileName ?? 'Import'} · {vendor?.name ?? upload.vendorId}
          </h2>
          <p className="text-[12px] text-muted">
            {upload.rowCount} rows · {upload.resolvedCount} resolved · {upload.unresolvedCount} need SKU
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-surface-border">
        <button
          type="button"
          onClick={() => setTab('unresolved')}
          className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            tab === 'unresolved'
              ? 'border-primary text-fg'
              : 'border-transparent text-fg-secondary hover:text-fg'
          }`}
        >
          Unresolved ({unresolved.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('resolved')}
          className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
            tab === 'resolved'
              ? 'border-primary text-fg'
              : 'border-transparent text-fg-secondary hover:text-fg'
          }`}
        >
          Resolved ({resolved.length})
        </button>
      </div>

      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        {tab === 'resolved' ? (
          <ResolvedTable rows={resolved} />
        ) : (
          <UnresolvedTable
            rows={unresolved}
            onAssign={handleAssignSku}
            onMatch={handleMatchProduct}
            onCreate={handleCreateProduct}
            onIgnore={handleIgnore}
          />
        )}
      </div>

      <AssignSkuModal
        open={assignRow !== null}
        onClose={() => setAssignRow(null)}
        row={assignRow}
        onResolved={() => {}}
      />

      {matchRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
          <div className="bg-surface border border-surface-border rounded-xl w-full max-w-md p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-fg mb-2">Match to existing product</h3>
            <p className="text-[13px] text-fg-secondary mb-4">{matchRow.productName}</p>
            <CatalogSearch onSelect={handleMatchSelect} />
            <button
              type="button"
              onClick={() => setMatchRow(null)}
              className="mt-4 w-full py-2 rounded-lg text-fg-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {createRow && (
        <CreateProductModal
          row={createRow}
          onClose={() => setCreateRow(null)}
          onCreated={handleCreateWithSku}
        />
      )}
    </div>
  )
}

function ResolvedTable({ rows }: { rows: ImportRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted text-sm py-8 text-center">No resolved rows</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Product</th>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Brand</th>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">SKU</th>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-surface-border">
              <td className="px-3 py-2.5 text-[13px] text-fg">{r.productName}</td>
              <td className="px-3 py-2.5 text-[13px] text-fg-secondary">{r.brand ?? '—'}</td>
              <td className="px-3 py-2.5 text-[13px] tabular-nums">{r.resolvedSku ?? r.sku ?? '—'}</td>
              <td className="px-3 py-2.5 text-[13px] tabular-nums">R$ {r.price.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UnresolvedTable({
  rows,
  onAssign,
  onMatch,
  onCreate,
  onIgnore,
}: {
  rows: ImportRow[]
  onAssign: (r: ImportRow) => void
  onMatch: (r: ImportRow) => void
  onCreate: (r: ImportRow) => void
  onIgnore: (r: ImportRow) => void
}) {
  if (rows.length === 0) {
    return <p className="text-muted text-sm py-8 text-center">No unresolved rows</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Product</th>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Brand</th>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Barcode</th>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Price</th>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Confidence</th>
            <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Proposed</th>
            <th className="text-right text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-surface-border hover:bg-surface-hover">
              <td className="px-3 py-2.5 text-[13px] text-fg font-medium max-w-[200px] truncate" title={r.productName}>
                {r.productName}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-fg-secondary">{r.brand ?? '—'}</td>
              <td className="px-3 py-2.5 text-[13px] tabular-nums">{r.barcode ?? '—'}</td>
              <td className="px-3 py-2.5 text-[13px] tabular-nums">R$ {r.price.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-[13px] tabular-nums">{r.confidence}%</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {r.proposedMatches?.slice(0, 3).map((m) => (
                    <span
                      key={m.sku}
                      className="inline-block px-2 py-0.5 rounded bg-surface-hover text-[11px] text-fg-secondary"
                    >
                      {m.sku} ({m.score})
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right">
                <div className="flex gap-1 justify-end flex-wrap">
                  <button
                    type="button"
                    onClick={() => onAssign(r)}
                    className="px-2 py-1 rounded bg-fg text-background text-[11px] font-medium hover:opacity-80"
                  >
                    Assign SKU
                  </button>
                  <button
                    type="button"
                    onClick={() => onMatch(r)}
                    className="px-2 py-1 rounded bg-surface-hover text-fg text-[11px] font-medium hover:bg-surface-border"
                  >
                    Match
                  </button>
                  <button
                    type="button"
                    onClick={() => onCreate(r)}
                    className="px-2 py-1 rounded bg-surface-hover text-fg text-[11px] font-medium hover:bg-surface-border"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => onIgnore(r)}
                    className="px-2 py-1 rounded text-danger text-[11px] font-medium hover:bg-danger/10"
                  >
                    Ignore
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateProductModal({
  row,
  onClose,
  onCreated,
}: {
  row: ImportRow
  onClose: () => void
  onCreated: (sku: string) => void
}) {
  const [sku, setSku] = useState('')
  const handleSave = () => {
    if (sku.trim()) {
      onCreated(sku.trim())
      onClose()
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
      <div className="bg-surface border border-surface-border rounded-xl w-full max-w-md p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-fg mb-2">Create new product</h3>
        <p className="text-[13px] text-fg-secondary mb-4">{row.productName}</p>
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Enter SKU"
          className="w-full bg-input-bg border border-input-border text-fg px-3 py-2 rounded-lg text-[13px] mb-4 focus:outline-none focus:border-primary"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-fg-secondary hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!sku.trim()}
            className="flex-1 py-2 rounded-lg bg-fg text-background font-medium disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
