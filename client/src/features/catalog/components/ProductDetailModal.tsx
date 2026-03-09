import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { getVendorPricesForProduct } from '@/store/selectors/vendorPrices'
import { getStalenessThreshold } from '@/store/selectors/settings'
import { Modal, Button, Input, Badge } from '@/shared/components'
import { useToast } from '@/shared/components'

export function ProductDetailModal({
  open,
  onClose,
  productId,
}: {
  open: boolean
  onClose: () => void
  productId: string | null
}) {
  const toast = useToast()
  const state = useStore((s) => s)
  const product = useStore((s) =>
    productId ? s.products.find((p) => p.id === productId) : null
  )
  const updateProduct = useStore((s) => s.updateProduct)

  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const [unitSize, setUnitSize] = useState('')
  const [minStock, setMinStock] = useState('10')

  useEffect(() => {
    if (product) {
      setSku(product.sku ?? '')
      setCategory(product.category ?? '')
      setUnitSize(product.unitSize ?? '')
      setMinStock(String(product.minStock ?? 10))
    }
  }, [product])

  if (!product) return null

  const vendorPrices = getVendorPricesForProduct(state, product.id)
  const sortedPrices = [...vendorPrices].sort((a, b) => a.unitPrice - b.unitPrice)
  const threshold = getStalenessThreshold(state)

  const handleUpdate = () => {
    updateProduct(product.id, {
      sku: sku.trim() || undefined,
      category: category.trim(),
      unitSize: unitSize.trim(),
      minStock: Math.max(0, parseInt(minStock, 10) || 10),
    })
    toast.show('Product updated!')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${product.sku ? `[${product.sku}] ` : ''}${product.name} ${product.brand}`}
    >
      <div className="space-y-6">
        <div>
          <Input
            label="SKU"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Optional product code"
            className="mb-4"
          />
          <div className="grid grid-cols-2 gap-4 mb-4">
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
          <Button className="mt-3" onClick={handleUpdate}>
            Update Product
          </Button>
        </div>

        <div>
          <h3 className="text-fg font-semibold mb-3">Vendor Prices</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left text-muted font-semibold py-2">Vendor</th>
                  <th className="text-left text-muted font-semibold py-2">Unit Price</th>
                  <th className="text-left text-muted font-semibold py-2">Updated</th>
                  <th className="text-left text-muted font-semibold py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedPrices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted text-sm">
                      No prices registered
                    </td>
                  </tr>
                ) : (
                  sortedPrices.map((vp) => {
                    const daysAgo = Math.floor(
                      (Date.now() - new Date(vp.updatedAt).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                    const isFresh = daysAgo <= threshold
                    return (
                      <tr
                        key={`${vp.vendorId}-${vp.productId}`}
                        className="border-b border-surface-border"
                      >
                        <td className="py-2">{vp.vendor?.name ?? '-'}</td>
                        <td className="py-2">
                          $ {vp.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-2">{daysAgo} days ago</td>
                        <td className="py-2">
                          <Badge variant={isFresh ? 'fresh' : 'stale'}>
                            {isFresh ? 'FRESH' : 'STALE'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
