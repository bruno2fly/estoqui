import type { StockSnapshot } from '@/types'
import type { StateSetter, StateGetter } from '../types'
import { generateId } from '../lib/generateId'
import { supabase } from '@/lib/supabase'
import { upsertStockSnapshot, deleteStockSnapshot as dbDeleteSnapshot } from '@/lib/supabase/stockSnapshots'

export const initialStockSnapshotsState = {
  stockSnapshots: [] as StockSnapshot[],
}

async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? ''
}

export function getStockSnapshotsActions(set: StateSetter, _get: StateGetter) {
  return {
    addStockSnapshot: (snapshot: Omit<StockSnapshot, 'id'>) => {
      const s: StockSnapshot = { ...snapshot, id: generateId() }
      set((state) => ({ stockSnapshots: [...state.stockSnapshots, s] }))
      getUid().then(uid => { if (uid) upsertStockSnapshot(s, uid).catch(console.error) })
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
      // Persist updated snapshot
      getUid().then(uid => {
        if (!uid) return
        const snap = _get().stockSnapshots.find(s => s.id === snapshotId)
        if (snap) upsertStockSnapshot(snap, uid).catch(console.error)
      })
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
      // Persist updated snapshot
      getUid().then(uid => {
        if (!uid) return
        const snap = _get().stockSnapshots.find(s => s.id === snapshotId)
        if (snap) upsertStockSnapshot(snap, uid).catch(console.error)
      })
    },
    deleteStockSnapshot: (snapshotId: string) => {
      set((s) => ({
        stockSnapshots: s.stockSnapshots.filter((snap) => snap.id !== snapshotId),
      }))
      dbDeleteSnapshot(snapshotId).catch(console.error)
    },
  }
}
