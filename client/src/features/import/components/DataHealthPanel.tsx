import { useCatalogStore } from '@/store/catalogStore'
import { exportCatalogProductsCsv, exportVendorPricesCsv } from '@/lib/import/exportCatalog'

export function DataHealthPanel() {
  const catalogProducts = useCatalogStore((s) => s.catalogProducts)
  const catalogVendorPrices = useCatalogStore((s) => s.catalogVendorPrices)
  const importRows = useCatalogStore((s) => s.importRows)

  const products = Object.values(catalogProducts)
  const missingBarcode = products.filter((p) => !p.barcode?.trim()).length
  const unresolvedCount = importRows.filter((r) => r.status === 'unresolved').length

  const barcodeToSkus = new Map<string, string[]>()
  for (const p of products) {
    if (p.barcode?.trim()) {
      const list = barcodeToSkus.get(p.barcode) ?? []
      list.push(p.sku)
      barcodeToSkus.set(p.barcode, list)
    }
  }
  const duplicateBarcodeConflicts = [...barcodeToSkus.values()].filter((arr) => arr.length > 1).length

  const handleExportCatalog = () => {
    const csv = exportCatalogProductsCsv(catalogProducts)
    downloadCsv(csv, 'catalog-products.csv')
  }

  const handleExportPrices = () => {
    const csv = exportVendorPricesCsv(catalogVendorPrices)
    downloadCsv(csv, 'vendor-prices.csv')
  }

  return (
    <div className="bg-surface border border-surface-border rounded-2xl p-5">
      <h3 className="text-[15px] font-semibold text-fg mb-4">Data Health</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="bg-surface-hover rounded-xl p-4">
          <div className="text-2xl font-bold tabular-nums text-fg">{missingBarcode}</div>
          <div className="text-[11px] text-muted uppercase tracking-wide mt-1">Products missing barcode</div>
        </div>
        <div className="bg-surface-hover rounded-xl p-4">
          <div className="text-2xl font-bold tabular-nums text-amber-600">{unresolvedCount}</div>
          <div className="text-[11px] text-muted uppercase tracking-wide mt-1">Unresolved rows</div>
        </div>
        <div className="bg-surface-hover rounded-xl p-4">
          <div className="text-2xl font-bold tabular-nums text-red-500">{duplicateBarcodeConflicts}</div>
          <div className="text-[11px] text-muted uppercase tracking-wide mt-1">Duplicate barcode conflicts</div>
        </div>
        <div className="bg-surface-hover rounded-xl p-4">
          <div className="text-2xl font-bold tabular-nums text-fg">{products.length}</div>
          <div className="text-[11px] text-muted uppercase tracking-wide mt-1">Catalog products</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExportCatalog}
          className="px-3 py-1.5 rounded-lg bg-fg text-background text-[12px] font-medium hover:opacity-80"
        >
          Export catalog CSV
        </button>
        <button
          type="button"
          onClick={handleExportPrices}
          className="px-3 py-1.5 rounded-lg bg-surface-hover text-fg text-[12px] font-medium hover:bg-surface-border"
        >
          Export vendor prices CSV
        </button>
      </div>
    </div>
  )
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
