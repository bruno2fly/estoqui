import type { ReorderDraft, ReorderDraftLine } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { computeBestVendor } from '../selectors/vendorPrices'

export const initialReorderDraftState: { reorderDraft: ReorderDraft } = {
  reorderDraft: { snapshotId: null, lines: [] },
}

export function getReorderDraftActions(set: StateSetter, get: StateGetter) {
  return {
    setReorderDraft: (draft: ReorderDraft) => {
      set(() => ({ reorderDraft: draft }))
    },
    /**
     * Manually add a catalog product to the current reorder draft — for items
     * that aren't on a shelf scan / CSV (e.g. re-adding one the user removed).
     * No-ops if the product is already on the list (caller shows the toast).
     */
    addReorderLine: (productId: string, qty?: number) => {
      const state = get()
      // Duplicate guard — same productId can never appear twice.
      if (state.reorderDraft.lines.some((l) => l.productId === productId)) return
      const product = state.products.find((p) => p.id === productId)
      if (!product) return

      const best = computeBestVendor(state, productId)
      const vp = best
        ? state.vendorPrices.find(
            (p) => p.vendorId === best.vendorId && p.productId === productId
          )
        : null

      const line: ReorderDraftLine = {
        productId,
        currentStock: product.stockQty ?? 0,
        minStock: product.minStock ?? 10,
        suggestedQty: Math.max(1, Math.round(qty ?? 1)),
        chosenVendorId: best?.vendorId ?? null,
        unitPrice: vp ? vp.unitPrice : 0,
        priceUpdatedAt: vp ? vp.updatedAt : null,
        selected: true,
        packType: vp?.packType ?? 'CASE',
        unitsPerCase: vp?.unitsPerCase ?? 1,
        vendorCasePrice: vp ? vp.unitPrice : 0,
        vendorUnitsPerCase: vp?.unitsPerCase,
      }

      set((s) => ({
        reorderDraft: { ...s.reorderDraft, lines: [...s.reorderDraft.lines, line] },
      }))
    },
    clearReorderDraft: () => {
      set(() => ({ reorderDraft: { snapshotId: null, lines: [] } }))
    },
    updateReorderLine: (
      lineIndex: number,
      field: keyof ReorderDraftLine,
      value: string | number | boolean
    ) => {
      set((s) => {
        const lines = [...s.reorderDraft.lines]
        const line = lines[lineIndex]
        if (!line) return s
        if (field === 'selected') {
          lines[lineIndex] = { ...line, selected: value as boolean }
        } else if (field === 'suggestedQty' || field === 'currentStock' || field === 'minStock') {
          lines[lineIndex] = { ...line, [field]: Math.max(0, Number(value) || 0) }
        } else if (field === 'chosenVendorId') {
          const vendorId = value as string
          const state = get()
          const vp = state.vendorPrices.find(
            (p) => p.vendorId === vendorId && p.productId === line.productId
          )
          const vpPackType = vp?.packType ?? 'CASE'
          const vpUnits = vp?.unitsPerCase ?? 1
          lines[lineIndex] = {
            ...line,
            chosenVendorId: vendorId || null,
            unitPrice: vp ? vp.unitPrice : 0,
            priceUpdatedAt: vp ? vp.updatedAt : null,
            packType: vpPackType,
            unitsPerCase: vpUnits,
            // Store vendor's original case data for CASE ↔ UNIT toggle
            vendorCasePrice: vp ? vp.unitPrice : 0,
            vendorUnitsPerCase: vpUnits,
          }
        } else {
          lines[lineIndex] = { ...line, [field]: value }
        }
        return { reorderDraft: { ...s.reorderDraft, lines } }
      })
    },
    toggleReorderLineSelected: (lineIndex: number) => {
      set((s) => {
        const lines = [...s.reorderDraft.lines]
        const line = lines[lineIndex]
        if (!line) return s
        lines[lineIndex] = { ...line, selected: !line.selected }
        return { reorderDraft: { ...s.reorderDraft, lines } }
      })
    },
    toggleReorderLinePackType: (lineIndex: number) => {
      set((s) => {
        const lines = [...s.reorderDraft.lines]
        const line = lines[lineIndex]
        if (!line) return s

        const newPackType = line.packType === 'CASE' ? 'UNIT' : 'CASE'
        const origUnits = line.vendorUnitsPerCase ?? line.unitsPerCase ?? 1
        const origCasePrice = line.vendorCasePrice ?? line.unitPrice

        let newPrice = line.unitPrice
        let newUnitsPerCase = line.unitsPerCase ?? 1

        if (newPackType === 'UNIT') {
          // Switching to UNIT: show per-unit price
          newUnitsPerCase = 1
          newPrice = origUnits > 1
            ? Math.round((origCasePrice / origUnits) * 100) / 100
            : origCasePrice
        } else {
          // Switching to CASE: restore original case price
          newUnitsPerCase = origUnits
          newPrice = origCasePrice
        }

        lines[lineIndex] = {
          ...line,
          packType: newPackType,
          unitsPerCase: newUnitsPerCase,
          unitPrice: newPrice,
          // Preserve originals for future toggles
          vendorCasePrice: origCasePrice,
          vendorUnitsPerCase: origUnits,
        }
        return { reorderDraft: { ...s.reorderDraft, lines } }
      })
    },
  }
}
