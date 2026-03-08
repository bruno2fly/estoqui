import type { ReorderDraftLine, OrderLine, Order, StockSnapshot, StockSnapshotRow, Product, Activity } from '@/types'
import { findProductMatch } from '@/shared/lib/matching'
import { computeBestVendor } from '../selectors/vendorPrices'
import { generateId } from '../lib/generateId'
import type { StateSetter } from '../types'
import type { PersistedState } from '@/types'
import { supabase } from '@/lib/supabase'
import { upsertProducts } from '@/lib/supabase/products'
import { upsertStockSnapshot } from '@/lib/supabase/stockSnapshots'
import { createActivity as dbCreateActivity } from '@/lib/supabase/activity'
import { emitSupabaseError } from '@/lib/supabase/errorEmitter'

const MAX_ACTIVITY = 50

type StoreWithActions = PersistedState & {
  addActivity: (type: string, description: string) => void
  addOrder: (order: Omit<Order, 'id'>) => string
}

export interface OrderGroup {
  vendorId: string
  vendor: { id: string; name: string }
  lines: OrderLine[]
  subtotal: number
}

export interface CreateOrderResult {
  success: boolean
  order?: Order
  byVendor?: Record<string, OrderGroup>
  error?: string
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? ''
}

/** Session-level state for the active order view (survives navigation, not persisted to DB) */
export interface ActiveOrderView {
  order: Order
  byVendor: Record<string, OrderGroup>
}

export function getInventoryActions(
  set: StateSetter,
  get: () => StoreWithActions & { activeOrderView: ActiveOrderView | null }
) {
  return {
    activeOrderView: null as ActiveOrderView | null,

    setActiveOrderView(view: ActiveOrderView | null) {
      set({ activeOrderView: view } as any)
    },

    clearActiveOrderView() {
      set({ activeOrderView: null } as any)
    },
    buildReorderDraftFromSnapshot(snapshotId: string) {
      const state = get()
      const snapshot = state.stockSnapshots.find((s) => s.id === snapshotId)
      if (!snapshot) return

      const stockByProduct: Record<string, number> = {}
      snapshot.rows.forEach((row) => {
        const productId =
          row.matchedProductId ??
          findProductMatch(
            row.rawName,
            row.rawBrand,
            state.products,
            state.matches,
            row.rawSku
          )
        if (!productId) return
        stockByProduct[productId] = (stockByProduct[productId] ?? 0) + row.stockQty
      })

      const lines: ReorderDraftLine[] = []
      for (const [productId, totalStock] of Object.entries(stockByProduct)) {
        const product = state.products.find((p) => p.id === productId)
        if (!product) continue

        const currentStock = totalStock
        const minStock = product.minStock ?? 10
        if (currentStock >= minStock) continue

        const suggestedQty = minStock - currentStock
        const best = computeBestVendor(state, productId)
        const vp = best
          ? state.vendorPrices.find(
              (p) =>
                p.vendorId === best.vendorId && p.productId === productId
            )
          : null

        lines.push({
          productId,
          currentStock,
          minStock,
          suggestedQty,
          chosenVendorId: best?.vendorId ?? null,
          unitPrice: vp ? vp.unitPrice : 0,
          priceUpdatedAt: vp ? vp.updatedAt : null,
          selected: true,
          packType: vp?.packType,
          unitsPerCase: vp?.unitsPerCase,
        })
      }

      set({
        reorderDraft: { snapshotId, lines },
      })
      get().addActivity(
        'reorder_generated',
        `Reorder list generated from snapshot (${lines.length} items below minStock)`
      )
    },

    createOrderFromDraft(): CreateOrderResult {
      const state = get()
      const draft = state.reorderDraft
      const selected = draft.lines.filter(
        (l) =>
          l.selected &&
          l.chosenVendorId &&
          l.suggestedQty > 0 &&
          l.unitPrice > 0
      )

      if (selected.length === 0) {
        return {
          success: false,
          error:
            'Select at least one item with vendor, quantity > 0, and valid price',
        }
      }

      const byVendor: Record<string, OrderGroup> = {}
      for (const line of selected) {
        const product = state.products.find((p) => p.id === line.productId)
        const vendor = state.vendors.find((v) => v.id === line.chosenVendorId)
        if (!product || !vendor || !line.unitPrice) continue

        const vendorId = line.chosenVendorId!
        if (!byVendor[vendorId]) {
          byVendor[vendorId] = {
            vendorId,
            vendor: { id: vendor.id, name: vendor.name },
            lines: [],
            subtotal: 0,
          }
        }

        const lineTotal = line.unitPrice * line.suggestedQty
        byVendor[vendorId].lines.push({
          productId: line.productId,
          vendorId,
          productName: `${product.name} ${product.brand}`,
          qty: line.suggestedQty,
          unitPrice: line.unitPrice,
          lineTotal,
        })
        byVendor[vendorId].subtotal += lineTotal
      }

      const totalsByVendor: Record<string, number> = {}
      let total = 0
      for (const [vid, group] of Object.entries(byVendor)) {
        totalsByVendor[vid] = group.subtotal
        total += group.subtotal
      }

      get().addOrder({
        createdAt: new Date().toISOString(),
        snapshotId: draft.snapshotId,
        total,
        totalsByVendor,
        lines: Object.values(byVendor).flatMap((g) => g.lines),
      })

      const vendorNames = Object.values(byVendor)
        .map((g) => g.vendor.name)
        .join(', ')
      get().addActivity(
        'order_created',
        `Created orders for ${vendorNames} — Total R$ ${total.toFixed(2)}`
      )
      // Don't clear reorderDraft here — user will "Archive Order" when done

      const order = get().orders[0]

      // Persist order view in store so it survives page navigation
      set({ activeOrderView: { order, byVendor } } as any)

      return { success: true, order, byVendor }
    },

    /**
     * Atomic stock import: adds snapshot + merges matches + patches products
     * + adds activity in a SINGLE set() call. Then persists to Supabase.
     */
    commitStockImport(payload: {
      uploadedAt: string
      sourceFileName: string
      sourceType: string
      rows: StockSnapshotRow[]
      newMatches: Record<string, string>
      productPatches: Record<string, { stockQty?: number; unitCost?: number; unitPrice?: number; category?: string }>
    }): string {
      const state = get()
      const snapshotId = generateId()

      const snapshot: StockSnapshot = {
        id: snapshotId,
        uploadedAt: payload.uploadedAt,
        sourceFileName: payload.sourceFileName,
        sourceType: payload.sourceType,
        rows: payload.rows,
      }

      const updatedProducts = state.products.map((p) => {
        const patch = payload.productPatches[p.id]
        if (!patch) return p
        const updates: Partial<Product> = {}
        if (patch.stockQty != null) updates.stockQty = patch.stockQty
        if (patch.unitCost) updates.unitCost = patch.unitCost
        if (patch.unitPrice) updates.unitPrice = patch.unitPrice
        if (patch.category) updates.category = patch.category
        return { ...p, ...updates }
      })

      const matchedCount = payload.rows.filter((r) => r.matchedProductId).length
      const activity: Activity = {
        id: generateId(),
        type: 'stock_uploaded',
        description: `Stock snapshot uploaded: ${payload.sourceFileName} (${payload.rows.length} items, ${matchedCount} matched)`,
        date: new Date().toISOString(),
      }

      set({
        stockSnapshots: [...state.stockSnapshots, snapshot],
        matches: { ...state.matches, ...payload.newMatches },
        products: updatedProducts,
        activity: [activity, ...state.activity].slice(0, MAX_ACTIVITY),
      })

      // Persist to Supabase
      getUid().then(uid => {
        if (!uid) return
        upsertStockSnapshot(snapshot, uid).catch((e) => emitSupabaseError('Inventory sync', e))
        // Batch update patched products
        const patchedProducts = updatedProducts.filter(p => payload.productPatches[p.id])
        if (patchedProducts.length > 0) {
          upsertProducts(patchedProducts, uid).catch((e) => emitSupabaseError('Inventory sync', e))
        }
        dbCreateActivity(activity, uid).catch((e) => emitSupabaseError('Inventory sync', e))
      })

      return snapshotId
    },

    /**
     * Atomic bulk create: generates all products + matches + snapshot row
     * updates + activity in a SINGLE set() call. Then persists to Supabase.
     */
    bulkCreateProductsFromSnapshot(payload: {
      snapshotId: string
      items: Array<{
        snapshotRowIndex: number
        product: Omit<Product, 'id'>
        matchKey: string
      }>
    }): void {
      const state = get()

      const newProducts: Product[] = payload.items.map((item) => ({
        ...item.product,
        id: generateId(),
      }))

      const newMatches: Record<string, string> = {}
      const rowToProductId = new Map<number, string>()
      payload.items.forEach((item, i) => {
        newMatches[item.matchKey] = newProducts[i].id
        rowToProductId.set(item.snapshotRowIndex, newProducts[i].id)
      })

      const updatedSnapshots = state.stockSnapshots.map((snap) => {
        if (snap.id !== payload.snapshotId) return snap
        return {
          ...snap,
          rows: snap.rows.map((r, i) => {
            const pid = rowToProductId.get(i)
            return pid ? { ...r, matchedProductId: pid } : r
          }),
        }
      })

      const activity: Activity = {
        id: generateId(),
        type: 'product_created',
        description: `Bulk created ${newProducts.length} products from stock import`,
        date: new Date().toISOString(),
      }

      set({
        products: [...state.products, ...newProducts],
        matches: { ...state.matches, ...newMatches },
        stockSnapshots: updatedSnapshots,
        activity: [activity, ...state.activity].slice(0, MAX_ACTIVITY),
      })

      // Persist to Supabase
      getUid().then(uid => {
        if (!uid) return
        upsertProducts(newProducts, uid).catch((e) => emitSupabaseError('Inventory sync', e))
        const updatedSnap = updatedSnapshots.find(s => s.id === payload.snapshotId)
        if (updatedSnap) upsertStockSnapshot(updatedSnap, uid).catch((e) => emitSupabaseError('Inventory sync', e))
        dbCreateActivity(activity, uid).catch((e) => emitSupabaseError('Inventory sync', e))
      })
    },
  }
}
