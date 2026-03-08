import { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { useCatalogStore } from '@/store/catalogStore'
import { AssignSkuModal } from './AssignSkuModal'
import { CatalogSearch } from './CatalogSearch'
import { ConfirmDialog } from '@/shared/components'
import type { ImportRow } from '@/types/catalog'
import type { CatalogProduct } from '@/types/catalog'

export function NeedsSkuQueuePage() {
  const vendors = useStore((s) => s.vendors)
  const importRows = useCatalogStore((s) => s.importRows)
  const resolveImportRow = useCatalogStore((s) => s.resolveImportRow)
  const ignoreImportRow = useCatalogStore((s) => s.ignoreImportRow)
  const upsertCatalogProduct = useCatalogStore((s) => s.upsertCatalogProduct)

  const [vendorFilter, setVendorFilter] = useState<string>('')
  const [hasBarcodeFilter, setHasBarcodeFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [brandFilter, setBrandFilter] = useState('')
  const [confidenceMin, setConfidenceMin] = useState<number | ''>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assignRow, setAssignRow] = useState<ImportRow | null>(null)
  const [drawerRow, setDrawerRow] = useState<ImportRow | null>(null)
  const [bulkSkuModal, setBulkSkuModal] = useState(false)
  const [bulkSku, setBulkSku] = useState('')
  const [ignoreConfirm, setIgnoreConfirm] = useState(false)

  const unresolved = useMemo(
    () => importRows.filter((r) => r.status === 'unresolved'),
    [importRows]
  )

  const filtered = useMemo(() => {
    let rows = unresolved
    if (vendorFilter) rows = rows.filter((r) => r.vendorId === vendorFilter)
    if (hasBarcodeFilter === 'yes') rows = rows.filter((r) => r.barcode?.trim())
    if (hasBarcodeFilter === 'no') rows = rows.filter((r) => !r.barcode?.trim())
    if (brandFilter.trim()) {
      const b = brandFilter.trim().toLowerCase()
      rows = rows.filter((r) => r.brand?.toLowerCase().includes(b))
    }
    if (confidenceMin !== '') {
      const min = Number(confidenceMin)
      if (!isNaN(min)) rows = rows.filter((r) => r.confidence >= min)
    }
    return rows
  }, [unresolved, vendorFilter, hasBarcodeFilter, brandFilter, confidenceMin])

  const toggleSelect = (id: string) => {
    setSelectedIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)))
    }
  }

  const handleBulkAssign = () => {
    if (!bulkSku.trim()) return
    const ids = Array.from(selectedIds)
    const rows = ids
      .map((id) => importRows.find((r) => r.id === id))
      .filter((r): r is ImportRow => r != null)
    const sku = bulkSku.trim()
    const catalogProducts = useCatalogStore.getState().catalogProducts
    const existingProduct = catalogProducts[sku]
    if (!existingProduct && rows[0]) {
      upsertCatalogProduct({
        sku,
        name: rows[0].productName,
        brand: rows[0].brand,
        barcode: rows[0].barcode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
    for (const row of rows) {
      resolveImportRow(row.id, sku, { createMappings: true })
    }
    setSelectedIds(new Set())
    setBulkSkuModal(false)
    setBulkSku('')
  }

  const handleBulkIgnore = () => {
    for (const id of selectedIds) {
      ignoreImportRow(id)
    }
    setSelectedIds(new Set())
    setIgnoreConfirm(false)
  }

  const handleMatchSelect = (product: CatalogProduct) => {
    if (!drawerRow) return
    resolveImportRow(drawerRow.id, product.sku, { createMappings: true })
    setDrawerRow(null)
  }

  const vendorOptions = useMemo(() => {
    const ids = new Set(unresolved.map((r) => r.vendorId))
    return vendors.filter((v) => ids.has(v.id))
  }, [vendors, unresolved])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="bg-input-bg border border-input-border text-fg px-2.5 py-1.5 rounded-lg text-[12px]"
        >
          <option value="">All vendors</option>
          {vendorOptions.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          value={hasBarcodeFilter}
          onChange={(e) => setHasBarcodeFilter(e.target.value as 'all' | 'yes' | 'no')}
          className="bg-input-bg border border-input-border text-fg px-2.5 py-1.5 rounded-lg text-[12px]"
        >
          <option value="all">Has barcode: any</option>
          <option value="yes">Has barcode: yes</option>
          <option value="no">Has barcode: no</option>
        </select>
        <input
          type="text"
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          placeholder="Filter by brand"
          className="bg-input-bg border border-input-border text-fg px-2.5 py-1.5 rounded-lg text-[12px] w-40"
        />
        <input
          type="number"
          value={confidenceMin}
          onChange={(e) => setConfidenceMin(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="Min confidence"
          min={0}
          max={100}
          className="bg-input-bg border border-input-border text-fg px-2.5 py-1.5 rounded-lg text-[12px] w-28"
        />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-surface-hover rounded-xl p-3">
          <span className="text-[13px] text-fg">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={() => setBulkSkuModal(true)}
            className="px-3 py-1.5 rounded-lg bg-fg text-background text-[12px] font-medium hover:opacity-80"
          >
            Assign same SKU
          </button>
          <button
            type="button"
            onClick={() => setIgnoreConfirm(true)}
            className="px-3 py-1.5 rounded-lg text-danger text-[12px] font-medium hover:bg-danger/10"
          >
            Ignore selected
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 rounded-lg text-fg-secondary text-[12px] hover:bg-surface-border"
          >
            Clear
          </button>
        </div>
      )}

      <div className="bg-surface border border-surface-border rounded-2xl p-5 flex gap-5">
        <div className="flex-1 min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Product</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Brand</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Barcode</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Price</th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Conf.</th>
                  <th className="text-right text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-surface-border hover:bg-surface-hover cursor-pointer"
                    onClick={() => setDrawerRow(r)}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-fg font-medium max-w-[180px] truncate">
                      {r.productName}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-fg-secondary">{r.brand ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums">{r.barcode ?? '—'}</td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums">R$ {r.price.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums">{r.confidence}%</td>
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setAssignRow(r)}
                        className="px-2 py-1 rounded bg-fg text-background text-[11px] font-medium hover:opacity-80"
                      >
                        Assign SKU
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="text-muted text-sm py-8 text-center">No unresolved rows</p>
          )}
        </div>

        {drawerRow && (
          <div className="w-80 shrink-0 border-l border-surface-border pl-5 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-[15px] font-semibold text-fg">Row details</h3>
              <button
                type="button"
                onClick={() => setDrawerRow(null)}
                className="text-muted hover:text-fg text-xl"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 text-[13px]">
              <p><span className="text-muted">Product:</span> {drawerRow.productName}</p>
              <p><span className="text-muted">Brand:</span> {drawerRow.brand ?? '—'}</p>
              <p><span className="text-muted">Barcode:</span> {drawerRow.barcode ?? '—'}</p>
              <p><span className="text-muted">Price:</span> R$ {drawerRow.price.toFixed(2)}</p>
              <p><span className="text-muted">Confidence:</span> {drawerRow.confidence}%</p>
              {drawerRow.proposedMatches && drawerRow.proposedMatches.length > 0 && (
                <div>
                  <p className="text-muted mb-1">Proposed matches:</p>
                  <div className="flex flex-wrap gap-1">
                    {drawerRow.proposedMatches.map((m) => (
                      <span
                        key={m.sku}
                        className="px-2 py-0.5 rounded bg-surface-hover text-[11px]"
                      >
                        {m.sku} ({m.score})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 space-y-2">
              <CatalogSearch onSelect={handleMatchSelect} placeholder="Match to product..." />
              <button
                type="button"
                onClick={() => { setAssignRow(drawerRow); setDrawerRow(null) }}
                className="w-full py-2 rounded-lg bg-fg text-background text-[12px] font-medium"
              >
                Assign SKU
              </button>
            </div>
          </div>
        )}
      </div>

      <AssignSkuModal
        open={assignRow !== null}
        onClose={() => setAssignRow(null)}
        row={assignRow}
      />

      {bulkSkuModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5">
          <div className="bg-surface border border-surface-border rounded-xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-fg mb-2">Assign SKU to {selectedIds.size} rows</h3>
            <input
              type="text"
              value={bulkSku}
              onChange={(e) => setBulkSku(e.target.value)}
              placeholder="Enter SKU"
              className="w-full bg-input-bg border border-input-border text-fg px-3 py-2 rounded-lg text-[13px] mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setBulkSkuModal(false); setBulkSku('') }}
                className="flex-1 py-2 rounded-lg text-fg-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkAssign}
                disabled={!bulkSku.trim()}
                className="flex-1 py-2 rounded-lg bg-fg text-background font-medium disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={ignoreConfirm}
        onClose={() => setIgnoreConfirm(false)}
        onConfirm={handleBulkIgnore}
        title="Ignore selected rows?"
        message={`This will ignore ${selectedIds.size} row(s). They will no longer appear in the Needs SKU queue.`}
        confirmLabel="Ignore"
        variant="danger"
      />
    </div>
  )
}
