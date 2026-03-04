import type { Product } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'
import { supabase } from '@/lib/supabase'
import { upsertProduct, deleteProduct as dbDeleteProduct, upsertProducts } from '@/lib/supabase/products'
import { emitSupabaseError } from '@/lib/supabase/errorEmitter'

export const initialProductsState = {
  products: [] as Product[],
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? ''
}

export function getProductsActions(set: StateSetter, _get: StateGetter) {
  return {
    addProduct: (product: Omit<Product, 'id'>) => {
      const p: Product = { ...product, id: generateId() }
      set((s) => ({ products: [...s.products, p] }))
      getUid().then(uid => { if (uid) upsertProduct(p, uid).catch((e) => emitSupabaseError('Save product', e)) })
      return p.id
    },
        addProductsBatch: (products: Omit<Product, 'id'>[]) => {
      const newProducts: Product[] = products.map((p) => ({ ...p, id: generateId() }))
      set((s) => ({ products: [...s.products, ...newProducts] }))
      getUid().then(uid => { if (uid) upsertProducts(newProducts, uid).catch((e) => emitSupabaseError('Save products batch', e)) })
      return newProducts
    },
    updateProduct: (id: string, updates: Partial<Omit<Product, 'id'>>) => {
      set((s) => ({
        products: s.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }))
      getUid().then(uid => {
        if (!uid) return
        const product = _get().products.find(p => p.id === id)
        if (product) upsertProduct(product, uid).catch((e) => emitSupabaseError('Save product', e))
      })
    },
    deleteProduct: (id: string) => {
      set((s) => {
        const newMatches = { ...s.matches }
        for (const key of Object.keys(newMatches)) {
          if (newMatches[key] === id) delete newMatches[key]
        }
        return {
          products: s.products.filter((p) => p.id !== id),
          vendorPrices: s.vendorPrices.filter((vp) => vp.productId !== id),
          matches: newMatches,
          reorderDraft: {
            ...s.reorderDraft,
            lines: s.reorderDraft.lines.filter((l) => l.productId !== id),
          },
        }
      })
      dbDeleteProduct(id).catch((e) => emitSupabaseError('Save product', e))
    },
  }
}
