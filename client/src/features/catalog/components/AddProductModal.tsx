import { useState } from 'react'
import { useStore } from '@/store'
import { useCatalogMatchStore } from '@/store/catalogMatchStore'
import { Modal, Button, Input, FileUpload } from '@/shared/components'
import { useToast } from '@/shared/components'
import { matchKey } from '@/shared/lib/matching'
import { deriveBrandKeyFromName, DEFAULT_BRANDS } from '@/lib/catalogMatch/brand'
import { parseProductsCSV, type ProductRow } from '../lib/productsCsv'
import { parseImageWithOpenAI } from '../lib/parseImageOcr'

type Mode = 'single' | 'csv' | 'image'

interface ReviewRow extends ProductRow {
  selected: boolean
}

export function AddProductModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const toast = useToast()
  const products = useStore((s) => s.products)
  const settings = useStore((s) => s.settings)
  const addProduct = useStore((s) => s.addProduct)
  const addProductsBatch = useStore((s) => s.addProductsBatch)
  const setMatch = useStore((s) => s.setMatch)
  const addActivity = useStore((s) => s.addActivity)
  const learnBrand = useCatalogMatchStore((s) => s.learnBrand)

  const [mode, setMode] = useState<Mode>('single')
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const [unitSize, setUnitSize] = useState('')
  const [minStock, setMinStock] = useState(
    String(settings?.defaultMinStock ?? 10)
  )
  const [csvLoading, setCsvLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    const b = brand.trim()
    if (!n || !b) return

    const key = matchKey(n, b)
    const existing = products.find((p) => matchKey(p.name, p.brand) === key)
    if (existing) {
      toast.show(
        `Product "${existing.name} ${existing.brand}" already exists`,
        'error'
      )
      return
    }

    const productId = addProduct({
      name: n,
      brand: b,
      sku: sku.trim() || undefined,
      category: category.trim(),
      unitSize: unitSize.trim(),
      minStock: Math.max(0, parseInt(minStock, 10) || 10),
    })
    setMatch(key, productId)
    addActivity('product_created', `Product created: ${n} ${b}`)

    if (b) {
      const mergedDict = { ...DEFAULT_BRANDS, ...useCatalogMatchStore.getState().brandDict }
      const brandKey = deriveBrandKeyFromName(n, mergedDict)
      if (brandKey) learnBrand(brandKey, b)
    }

    toast.show('Product added!')
    onAdded()
    onClose()
    resetForm()
  }

  const resetForm = () => {
    setName('')
    setBrand('')
    setSku('')
    setCategory('')
    setUnitSize('')
    setMinStock(String(settings?.defaultMinStock ?? 10))
    setReviewRows(null)
  }

  const handleClose = () => {
    resetForm()
    setMode('single')
    setCsvLoading(false)
    setImageLoading(false)
    onClose()
  }

  const applyParsedProducts = (
    rows: { name: string; brand: string; sku?: string; category?: string; unitSize?: string; minStock?: number }[]
  ) => {
    const defaultMin = settings?.defaultMinStock ?? 10
    const keysAddedThisBatch = new Set<string>()
    const existingKeys = new Set(products.map((p) => matchKey(p.name, p.brand)))

    // Collect new products (without id — addProductsBatch generates them) and brands to learn
    const productsToAdd: { name: string; brand: string; sku?: string; category?: string; unitSize?: string; minStock: number }[] = []
    const brandsToLearn: Record<string, string> = {}
    let skipped = 0

    for (const row of rows) {
      const key = matchKey(row.name, row.brand)
      if (existingKeys.has(key) || keysAddedThisBatch.has(key)) {
        skipped++
        continue
      }
      keysAddedThisBatch.add(key)
      productsToAdd.push({
        name: row.name,
        brand: row.brand,
        sku: (row.sku ?? '').trim() || undefined,
        category: (row.category ?? '').trim(),
        unitSize: (row.unitSize ?? '').trim(),
        minStock: row.minStock ?? defaultMin,
      })

      if (row.brand) {
        const mergedDict = { ...DEFAULT_BRANDS, ...useCatalogMatchStore.getState().brandDict }
        const bk = deriveBrandKeyFromName(row.name, mergedDict)
        if (bk) brandsToLearn[bk] = row.brand
      }
    }

    const added = productsToAdd.length
    if (added > 0) {
      // Persist to Supabase via addProductsBatch (updates local state + upsertProducts)
      const createdProducts = addProductsBatch(productsToAdd)
      for (const p of createdProducts) {
        setMatch(matchKey(p.name, p.brand), p.id)
      }
      addActivity('product_created', `Bulk import: ${added} product${added !== 1 ? 's' : ''} added`)

      if (Object.keys(brandsToLearn).length > 0) {
        const catalogState = useCatalogMatchStore.getState()
        useCatalogMatchStore.setState({
          brandDict: { ...catalogState.brandDict, ...brandsToLearn },
        })
      }
    }

    const msg =
      skipped === 0
        ? `${added} product${added !== 1 ? 's' : ''} added`
        : `${added} product${added !== 1 ? 's' : ''} added, ${skipped} skipped (duplicates)`
    toast.show(msg, added ? 'success' : 'error')
    if (added) {
      onAdded()
      handleClose()
    }
  }

  const handleCsvFile = (file: File) => {
    setCsvLoading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const text = (reader.result as string) ?? ''
      // Detect binary / non-CSV: .numbers is Zip, produces garbage when read as text
      const hasNullBytes = /\x00/.test(text)
      const looksBinary = hasNullBytes || (text.length > 0 && (text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g)?.length ?? 0) / text.length > 0.05)
      if (looksBinary || file.name.toLowerCase().endsWith('.numbers')) {
        toast.show(
          'Apple Numbers (.numbers) files cannot be read directly. Export as CSV: File → Export To → CSV in Numbers, then upload the .csv file.',
          'error'
        )
        setCsvLoading(false)
        return
      }
      const result = parseProductsCSV(text)
      if ('error' in result) {
        toast.show(result.error, 'error')
        setCsvLoading(false)
        return
      }
      applyParsedProducts(result.products)
      setCsvLoading(false)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleImageFile = async (file: File) => {
    const apiKey = settings?.openaiApiKey ?? ''
    if (!apiKey) {
      toast.show('OpenAI API key required. Add it in Settings → AI / Image Import.', 'error')
      return
    }

    setImageLoading(true)
    try {
      const result = await parseImageWithOpenAI(file, apiKey)
      if ('error' in result) {
        toast.show(result.error, 'error')
        setImageLoading(false)
        return
      }
      setReviewRows(result.products.map((p) => ({ ...p, selected: true })))
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Failed to process image',
        'error'
      )
    }
    setImageLoading(false)
  }

  const handleReviewRowChange = (index: number, field: keyof ProductRow, value: string) => {
    setReviewRows((prev) => {
      if (!prev) return prev
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: field === 'minStock' ? parseInt(value, 10) || 10 : value }
      return copy
    })
  }

  const handleReviewToggle = (index: number) => {
    setReviewRows((prev) => {
      if (!prev) return prev
      const copy = [...prev]
      copy[index] = { ...copy[index], selected: !copy[index].selected }
      return copy
    })
  }

  const handleReviewImport = () => {
    if (!reviewRows) return
    const selected = reviewRows.filter((r) => r.selected && r.name.trim())
    if (selected.length === 0) {
      toast.show('No products selected', 'error')
      return
    }
    applyParsedProducts(selected)
  }

  const handleRemoveRow = (index: number) => {
    setReviewRows((prev) => {
      if (!prev) return prev
      return prev.filter((_, i) => i !== index)
    })
  }

  const tabBtn = (label: string, tabMode: Mode) => (
    <button
      type="button"
      onClick={() => { setMode(tabMode); setReviewRows(null) }}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        mode === tabMode
          ? 'bg-primary text-white'
          : 'text-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  )

  const selectedCount = reviewRows?.filter((r) => r.selected).length ?? 0

  return (
    <Modal open={open} onClose={handleClose} title="Add Product">
      <div className="space-y-4">
        <div className="flex gap-2 border-b border-surface-border pb-2">
          {tabBtn('Single product', 'single')}
          {tabBtn('Upload CSV', 'csv')}
          {tabBtn('Upload image', 'image')}
        </div>

        {mode === 'single' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Product Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                label="Brand *"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
              />
            </div>
            <Input
              label="SKU"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Optional product code"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <Input
                label="Size/Unit"
                value={unitSize}
                onChange={(e) => setUnitSize(e.target.value)}
              />
            </div>
            <Input
              label="Min Stock"
              type="number"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              min={1}
            />
            <div className="flex gap-2 pt-2">
              <Button type="submit">Save Product</Button>
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </form>
        ) : mode === 'csv' ? (
          <div className="space-y-4">
            <FileUpload
              accept=".csv"
              onFile={handleCsvFile}
              label="Drag a CSV file or click to select"
              hint="Columns: Product Name (required). Optional: Brand, SKU or Barcode, Category, Size/Unit, Min Stock. Brand is auto-detected when empty."
            />
            {csvLoading && (
              <p className="text-sm text-muted">Processing CSV…</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        ) : reviewRows ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-secondary">
              {reviewRows.length} product{reviewRows.length !== 1 ? 's' : ''} found.
              Review and edit before importing. Uncheck rows to skip.
            </p>
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
              {reviewRows.map((row, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border ${
                    row.selected ? 'border-surface-border bg-surface' : 'border-surface-border bg-surface-hover opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => handleReviewToggle(i)}
                      className="accent-primary"
                    />
                    <span className="text-xs text-muted">#{i + 1}</span>
                    {row.sku && <span className="text-xs text-primary">SKU: {row.sku}</span>}
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(i)}
                      className="ml-auto text-xs text-red-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full"
                      placeholder="Product Name *"
                      value={row.name}
                      onChange={(e) => handleReviewRowChange(i, 'name', e.target.value)}
                    />
                    <input
                      className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full"
                      placeholder="Brand"
                      value={row.brand}
                      onChange={(e) => handleReviewRowChange(i, 'brand', e.target.value)}
                    />
                    <input
                      className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full"
                      placeholder="SKU"
                      value={row.sku}
                      onChange={(e) => handleReviewRowChange(i, 'sku', e.target.value)}
                    />
                    <input
                      className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-lg text-sm w-full"
                      placeholder="Size/Unit"
                      value={row.unitSize}
                      onChange={(e) => handleReviewRowChange(i, 'unitSize', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleReviewImport}>
                Import {selectedCount} product{selectedCount !== 1 ? 's' : ''}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setReviewRows(null)}>
                Back
              </Button>
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!settings?.openaiApiKey && (
              <div className="bg-amber-50 dark:bg-yellow-900/30 border border-amber-200 dark:border-yellow-700/50 rounded-lg px-3 py-2 text-sm text-amber-700 dark:text-yellow-200">
                OpenAI API key required. Go to <strong>Settings → AI / Image Import</strong> to add your key.
              </div>
            )}
            <FileUpload
              accept="image/png,image/jpeg,image/webp"
              onFile={handleImageFile}
              label="Drag a catalog screenshot or click to select"
              hint="Uses GPT-4o to extract products from the image. You can review and edit before importing."
            />
            {imageLoading && (
              <div className="space-y-2">
                <p className="text-sm text-muted">Analyzing image with AI… This may take 5–15 seconds.</p>
                <div className="h-1 bg-surface-border rounded overflow-hidden">
                  <div className="h-full bg-primary animate-pulse rounded" style={{ width: '100%' }} />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
