import type { ReorderDraft, ReorderDraftLine } from '@/types'
import type { StateSetter, StateGetter } from '../types'

export const initialReorderDraftState: { reorderDraft: ReorderDraft } = {
  reorderDraft: { snapshotId: null, lines: [] },
}

export function getReorderDraftActions(set: StateSetter, get: StateGetter) {
  return {
    setReorderDraft: (draft: ReorderDraft) => {
      set(() => ({ reorderDraft: draft }))
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
