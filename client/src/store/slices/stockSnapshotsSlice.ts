import type { StockSnapshot } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'

export const initialStockSnapshotsState = {
  stockSnapshots: [] as StockSnapshot[],
}

export function getStockSnapshotsActions(set: StateSetter, _get: StateGetter) {
  return {
    addStockSnapshot: (snapshot: Omit<StockSnapshot, 'id'>) => {
      const s: StockSnapshot = { ...snapshot, id: generateId() }
      set((state) => ({ stockSnapshots: [...state.stockSnapshots, s] }))
      return s.id
    },
    updateStockSnapshotRows: (snapshotId: string, updateRow: (row: StockSnapshot['rows'][number], index: number) => StockSnapshot['rows'][number]) => {
      set((s) => ({
        stockSnapshots: s.stockSnapshots.map((snap) =>
          snap.id === snapshotId
            ? { ...snap, rows: snap.rows.map((row, i) => updateRow(row, i)) }
            : snap
        ),
      }))
    },
    setMatchOnRow: (snapshotId: string, rowIndex: number, matchedProductId: string | null) => {
      set((s) => ({
        stockSnapshots: s.stockSnapshots.map((snap) =>
          snap.id === snapshotId
            ? {
                ...snap,
                rows: snap.rows.map((r, i) =>
                  i === rowIndex ? { ...r, matchedProductId } : r
                ),
              }
            : snap
        ),
      }))
    },
    deleteStockSnapshot: (snapshotId: string) => {
      set((s) => ({
        stockSnapshots: s.stockSnapshots.filter((snap) => snap.id !== snapshotId),
      }))
    },
  }
}
