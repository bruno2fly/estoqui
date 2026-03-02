import { useState } from 'react'
import { useStore } from '@/store'
import { Modal, Button, Input } from '@/shared/components'
import { useToast } from '@/shared/components'
import { matchKey } from '@/shared/lib/matching'
import type { Vendor } from '@/types'

export function AddProductToVendorModal({
  open,
  onClose,
  vendor,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  vendor: Vendor | null
  onAdded: () => void
}) {
  const toast = useToast()
  const products = useStore((s) => s.products)
  const settings = useStore((s) => s.settings)
  const addProduct = useStore((s) => s.addProduct)
  const setMatch = useStore((s) => s.setMatch)
  const setVendorPrice = useStore((s) => s.setVendorPrice)

  const [useExisting, setUseExisting] = useState(true)
  const [existingProductId, setExistingProductId] = useState('')
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newUnitSize, setNewUnitSize] = useState('')
  const [newMinStock, setNewMinStock] = useState(
    String(settings?.defaultMinStock ?? 10)
  )
  const [unitPrice, setUnitPrice] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendor) return
    const price = parseFloat(unitPrice)
    if (Number.isNaN(price) || price <= 0) {
      toast.show('Enter a valid unit price', 'error')
      return
    }

    let productId: string
    if (useExisting) {
      productId = existingProductId
      if (!productId) {
        toast.show('Select a product', 'error')
        return
      }
    } else {
      const n = newName.trim()
      const b = newBrand.trim()
      if (!n || !b) {
        toast.show('Name and brand required', 'error')
        return
      }
      const key = matchKey(n, b)
      const existing = products.find((p) => matchKey(p.name, p.brand) === key)
      if (existing) {
        productId = existing.id
      } else {
        productId = addProduct({
          name: n,
          brand: b,
          category: newCategory.trim(),
          unitSize: newUnitSize.trim(),
          minStock: Math.max(0, parseInt(newMinStock, 10) || 10),
        })
        setMatch(key, productId)
      }
    }

    const now = new Date().toISOString()
    setVendorPrice({
      vendorId: vendor.id,
      productId,
      unitPrice: price,
      updatedAt: now,
    })
    toast.show('Product added to price list!')
    onAdded()
    onClose()
    setUnitPrice('')
    setExistingProductId('')
    setNewName('')
    setNewBrand('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Product to Vendor">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-4 mb-4 text-fg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="action"
              checked={useExisting}
              onChange={() => setUseExisting(true)}
            />
            Existing Product
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="action"
              checked={!useExisting}
              onChange={() => setUseExisting(false)}
            />
            Create New Product
          </label>
        </div>

        {useExisting ? (
          <div className="form-group">
            <label className="block text-sm text-fg-secondary mb-1">Select Product</label>
            <select
              required={useExisting}
              value={existingProductId}
              onChange={(e) => setExistingProductId(e.target.value)}
              className="w-full bg-input-bg border border-input-border text-fg px-2.5 py-2 rounded-lg text-sm"
            >
              <option value="">Select...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku ? `[${p.sku}] ` : ''}{p.name} {p.brand}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <Input
              label="Product Name *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required={!useExisting}
            />
            <Input
              label="Brand *"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              required={!useExisting}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <Input
                label="Size/Unit"
                value={newUnitSize}
                onChange={(e) => setNewUnitSize(e.target.value)}
              />
            </div>
            <Input
              label="Min Stock"
              type="number"
              value={newMinStock}
              onChange={(e) => setNewMinStock(e.target.value)}
              min={1}
            />
          </>
        )}

        <Input
          label="Unit Price *"
          type="number"
          step="0.01"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          required
        />

        <div className="flex gap-2 pt-2">
          <Button type="submit">Save</Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
