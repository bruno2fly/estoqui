/**
 * Zustand store for the product matching system.
 *
 * Separate from the main app store to keep concerns isolated.
 * Persists to localStorage under its own key with versioned migration.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CatalogMatchState,
  MasterProduct,
  Alias,
  RawPosRow,
  RawVendorRow,
} from '@/lib/catalogMatch/types'
import { DEFAULT_BRANDS } from '@/lib/catalogMatch/brand'
import { normalizeText } from '@/lib/catalogMatch/normalize'
import { parseProductName, parsePackaging } from '@/lib/catalogMatch/parse'
import { matchVendorBatch } from '@/lib/catalogMatch/match'

/* ── ID generator ────────────────────────────────────────────────────────── */

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/* ── Actions interface ───────────────────────────────────────────────────── */

interface CatalogMatchActions {
  importPosRows: (rows: RawPosRow[], sourceId: string) => void
  importVendorRows: (rows: RawVendorRow[], vendorSourceId: string) => void
  confirmMatch: (vendorRowId: string, masterProductId: string) => void
  createNewMasterFromVendor: (vendorRowId: string) => void
  clearMatchResults: () => void
  removeMasterProduct: (id: string) => void
  /** Learn a brand: normalized key -> display name. Persists for future imports. */
  learnBrand: (brandKey: string, display: string) => void
}

type Store = CatalogMatchState & CatalogMatchActions

/* ── Merged dict helper ──────────────────────────────────────────────────── */

/** Merge DEFAULT_BRANDS with user overrides. User entries win on conflict. */
function mergedBrandDict(userDict: Record<string, string>): Record<string, string> {
  return { ...DEFAULT_BRANDS, ...userDict }
}

/* ── Initial state ───────────────────────────────────────────────────────── */

const initialState: CatalogMatchState = {
  masterProducts: [],
  aliases: [],
  matchResults: [],
  brandDict: {},
  _catalogVersion: 2,
}

/* ── Store ───────────────────────────────────────────────────────────────── */

export const useCatalogMatchStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState,

      /**
       * Import POS rows: each becomes a MasterProduct (or merges with existing)
       * and creates an alias for the raw name.
       */
      importPosRows: (rows: RawPosRow[], sourceId: string) => {
        const state = get()
        const dict = mergedBrandDict(state.brandDict)
        const newMasters: MasterProduct[] = [...state.masterProducts]
        const newAliases: Alias[] = [...state.aliases]

        for (const row of rows) {
          const parsed = parseProductName(row.name, row.brand, dict)
          const normalized = normalizeText(row.name)

          const existingAlias = newAliases.find((a) => a.normalizedName === normalized)
          if (existingAlias) continue

          let masterId: string | null = null
          if (row.barcode) {
            const byBarcode = newMasters.find((m) => m.barcode && m.barcode === row.barcode)
            if (byBarcode) masterId = byBarcode.id
          }

          if (!masterId) {
            const byName = newMasters.find(
              (m) => normalizeText(m.canonicalName) === normalized
            )
            if (byName) masterId = byName.id
          }

          if (!masterId) {
            const pkg = parsePackaging(row.name)
            const mp: MasterProduct = {
              id: genId(),
              canonicalName: row.name.trim(),
              brand: parsed.brand || (row.brand ?? ''),
              barcode: row.barcode,
              unitSizeValue: pkg.unitSizeValue,
              unitSizeUnit: pkg.unitSizeUnit,
              defaultPackCount: pkg.packCount > 1 ? pkg.packCount : undefined,
              createdAt: new Date().toISOString(),
            }
            newMasters.push(mp)
            masterId = mp.id
          }

          newAliases.push({
            id: genId(),
            sourceType: 'pos',
            sourceId,
            rawName: row.name,
            normalizedName: normalized,
            masterProductId: masterId,
            createdAt: new Date().toISOString(),
          })
        }

        set({ masterProducts: newMasters, aliases: newAliases })
      },

      /**
       * Import vendor rows: parse each, run matching against master catalog,
       * store results for review.
       */
      importVendorRows: (rows: RawVendorRow[], vendorSourceId: string) => {
        const state = get()
        const dict = mergedBrandDict(state.brandDict)

        const vendorRowsForMatching = rows.map((r) => ({
          id: genId(),
          rawName: r.name,
          brand: r.brand,
          barcode: r.barcode,
          casePrice: r.casePrice,
          vendorSku: r.vendorSku,
          _sourceId: vendorSourceId,
        }))

        const results = matchVendorBatch(
          vendorRowsForMatching,
          state.masterProducts,
          state.aliases,
          dict
        )

        const newAliases = [...state.aliases]
        for (const r of results) {
          if (r.status === 'auto' && r.selectedMasterProductId) {
            const normalized = normalizeText(r.parsed.originalName)
            const alreadyExists = newAliases.some((a) => a.normalizedName === normalized)
            if (!alreadyExists) {
              newAliases.push({
                id: genId(),
                sourceType: 'vendor',
                sourceId: vendorSourceId,
                rawName: r.parsed.originalName,
                normalizedName: normalized,
                masterProductId: r.selectedMasterProductId,
                createdAt: new Date().toISOString(),
              })
            }
          }
        }

        set({ matchResults: results, aliases: newAliases })
      },

      confirmMatch: (vendorRowId: string, masterProductId: string) => {
        const state = get()
        const result = state.matchResults.find((r) => r.vendorRowId === vendorRowId)
        if (!result) return

        const newAliases = [...state.aliases]
        const normalized = normalizeText(result.parsed.originalName)
        const alreadyExists = newAliases.some((a) => a.normalizedName === normalized)
        if (!alreadyExists) {
          newAliases.push({
            id: genId(),
            sourceType: 'vendor',
            sourceId: '',
            rawName: result.parsed.originalName,
            normalizedName: normalized,
            masterProductId,
            createdAt: new Date().toISOString(),
          })
        }

        const newResults = state.matchResults.map((r) =>
          r.vendorRowId === vendorRowId
            ? { ...r, selectedMasterProductId: masterProductId, status: 'confirmed' as const, confidence: 0.99 }
            : r
        )

        set({ matchResults: newResults, aliases: newAliases })
      },

      createNewMasterFromVendor: (vendorRowId: string) => {
        const state = get()
        const result = state.matchResults.find((r) => r.vendorRowId === vendorRowId)
        if (!result) return

        const parsed = result.parsed
        const mp: MasterProduct = {
          id: genId(),
          canonicalName: parsed.originalName.trim(),
          brand: parsed.brand,
          unitSizeValue: parsed.unitSizeValue,
          unitSizeUnit: parsed.unitSizeUnit,
          defaultPackCount: parsed.packCount > 1 ? parsed.packCount : undefined,
          createdAt: new Date().toISOString(),
        }

        const normalized = normalizeText(parsed.originalName)
        const alias: Alias = {
          id: genId(),
          sourceType: 'vendor',
          sourceId: '',
          rawName: parsed.originalName,
          normalizedName: normalized,
          masterProductId: mp.id,
          createdAt: new Date().toISOString(),
        }

        const newResults = state.matchResults.map((r) =>
          r.vendorRowId === vendorRowId
            ? { ...r, selectedMasterProductId: mp.id, status: 'new_product' as const, confidence: 1 }
            : r
        )

        set({
          masterProducts: [...state.masterProducts, mp],
          aliases: [...state.aliases, alias],
          matchResults: newResults,
        })
      },

      clearMatchResults: () => set({ matchResults: [] }),

      removeMasterProduct: (id: string) => {
        const state = get()
        set({
          masterProducts: state.masterProducts.filter((m) => m.id !== id),
          aliases: state.aliases.filter((a) => a.masterProductId !== id),
        })
      },

      learnBrand: (brandKey: string, display: string) => {
        const key = normalizeText(brandKey)
        const val = display.trim().toUpperCase()
        if (!key || !val) return
        const state = get()
        set({ brandDict: { ...state.brandDict, [key]: val } })
      },
    }),
    {
      name: 'estoqui-catalog-match',
      version: 2,
      partialize: (state): CatalogMatchState => ({
        masterProducts: state.masterProducts,
        aliases: state.aliases,
        matchResults: state.matchResults,
        brandDict: state.brandDict,
        _catalogVersion: state._catalogVersion,
      }),
      migrate: (persisted, version) => {
        const base = persisted as Record<string, unknown>
        if (version < 2) {
          return { ...initialState, ...base, brandDict: base.brandDict ?? {}, _catalogVersion: 2 }
        }
        return persisted as Store
      },
    }
  )
)
