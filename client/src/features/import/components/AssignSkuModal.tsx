import { useState } from 'react'
import { Modal, useToast } from '@/shared/components'
import { useCatalogStore } from '@/store/catalogStore'
import type { ImportRow } from '@/types/catalog'

export interface AssignSkuModalProps {
  open: boolean
  onClose: () => void
  row: ImportRow | null
  onResolved?: () => void
}

export function AssignSkuModal({ open, onClose, row, onResolved }: AssignSkuModalProps) {
  const toast = useToast()
  const [sku, setSku] = useState('')
  const [createMappings, setCreateMappings] = useState(true)

  const catalogProducts = useCatalogStore((s) => s.catalogProducts)
  const upsertCatalogProduct = useCatalogStore((s) => s.upsertCatalogProduct)
  const resolveImportRow = useCatalogStore((s) => s.resolveImportRow)

  const skuExists = sku.trim() && catalogProducts[sku.trim()]
  const skuValid = sku.trim().length > 0

  const handleSave = () => {
    if (!row || !sku.trim()) return
    const trimmedSku = sku.trim()

    if (!catalogProducts[trimmedSku] && row.productName) {
      upsertCatalogProduct({
        sku: trimmedSku,
        name: row.productName,
        brand: row.brand,
        barcode: row.barcode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    resolveImportRow(row.id, trimmedSku, { createMappings })
    toast.show('Row resolved')
    setSku('')
    onResolved?.()
    onClose()
  }

  const handleClose = () => {
    setSku('')
    onClose()
  }

  if (!row) return null

  return (
    <Modal open={open} onClose={handleClose} title="Assign SKU" maxWidth="480px">
      <div className="space-y-4">
        <div>
          <p className="text-[13px] text-fg-secondary mb-1">Product</p>
          <p className="text-fg font-medium">{row.productName}</p>
          {row.brand && <p className="text-[12px] text-muted">{row.brand}</p>}
        </div>

        <div>
          <label className="block text-[13px] font-medium text-fg mb-1.5">SKU</label>
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Enter SKU"
            className="w-full bg-input-bg border border-input-border text-fg px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:border-primary"
          />
          {skuExists && (
            <p className="text-[12px] text-emerald-600 mt-1">Will link to existing product</p>
          )}
          {sku.trim() && !skuExists && (
            <p className="text-[12px] text-amber-600 mt-1">Will create new product with this SKU</p>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={createMappings}
            onChange={(e) => setCreateMappings(e.target.checked)}
            className="rounded border-input-border"
          />
          <span className="text-[13px] text-fg">Create mappings (barcode + fingerprint)</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-[13px] text-fg-secondary hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!skuValid}
            className="px-4 py-2 rounded-lg bg-fg text-background text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}
