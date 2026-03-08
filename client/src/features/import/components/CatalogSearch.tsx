import { useState, useMemo } from 'react'
import { SearchInput } from '@/shared/components'
import { useCatalogStore } from '@/store/catalogStore'
import type { CatalogProduct } from '@/types/catalog'

export interface CatalogSearchProps {
  onSelect: (product: CatalogProduct) => void
  placeholder?: string
}

export function CatalogSearch({ onSelect, placeholder = 'Search by SKU or name...' }: CatalogSearchProps) {
  const [query, setQuery] = useState('')
  const catalogProducts = useCatalogStore((s) => s.catalogProducts)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const products = Object.values(catalogProducts)
    return products.filter((p) => {
      const skuMatch = p.sku.toLowerCase() === q || p.sku.toLowerCase().includes(q)
      const nameMatch = p.name.toLowerCase().includes(q)
      const brandMatch = p.brand?.toLowerCase().includes(q)
      const aliasMatch = p.aliases?.some((a) => a.toLowerCase().includes(q))
      return skuMatch || nameMatch || brandMatch || aliasMatch
    }).slice(0, 20)
  }, [query, catalogProducts])

  return (
    <div className="space-y-2">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={placeholder}
        debounceMs={0}
      />
      {query.trim() && (
        <div className="border border-surface-border rounded-lg max-h-48 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-muted text-sm">No products found</p>
          ) : (
            <ul className="py-1">
              {results.map((p) => (
                <li key={p.sku}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-hover text-[13px] flex justify-between gap-2"
                  >
                    <span className="font-medium text-fg truncate">{p.name}</span>
                    <span className="text-fg-secondary shrink-0">
                      {p.sku} {p.brand ? `· ${p.brand}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
