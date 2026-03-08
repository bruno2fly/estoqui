import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CatalogProduct,
  CatalogVendorPrice,
  SkuMapping,
  ImportUpload,
  ImportRow,
} from '@/types/catalog'
import { resolveRow } from '@/lib/catalogMatch/resolve'

function uuid() {
  return crypto.randomUUID()
}

function now() {
  return new Date().toISOString()
}

type CatalogState = {
  catalogProducts: Record<string, CatalogProduct>
  catalogVendorPrices: CatalogVendorPrice[]
  skuMappings: SkuMapping[]
  importUploads: ImportUpload[]
  importRows: ImportRow[]
}

type CatalogActions = {
  upsertCatalogProduct: (product: CatalogProduct) => void
  setBarcodeForSku: (sku: string, barcode: string) => void
  addAliasToSku: (sku: string, alias: string) => void
  addSkuMapping: (mapping: Omit<SkuMapping, 'id' | 'createdAt'>) => void
  createImportUpload: (upload: Omit<ImportUpload, 'id' | 'createdAt'>) => string
  addImportRows: (rows: ImportRow[]) => void
  resolveImportRow: (rowId: string, resolvedSku: string, options?: { createMappings?: boolean }) => void
  ignoreImportRow: (rowId: string) => void
  applyResolvedRowToVendorPrice: (row: ImportRow) => void
  runAutoResolveForUpload: (uploadId: string) => void
  getState: () => CatalogState & CatalogActions
}

const initialState: CatalogState = {
  catalogProducts: {},
  catalogVendorPrices: [],
  skuMappings: [],
  importUploads: [],
  importRows: [],
}

export const useCatalogStore = create<CatalogState & CatalogActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      upsertCatalogProduct: (product) => {
        set((s) => ({
          catalogProducts: {
            ...s.catalogProducts,
            [product.sku]: {
              ...product,
              updatedAt: now(),
            },
          },
        }))
      },

      setBarcodeForSku: (sku, barcode) => {
        set((s) => {
          const p = s.catalogProducts[sku]
          if (!p) return s
          return {
            catalogProducts: {
              ...s.catalogProducts,
              [sku]: { ...p, barcode, updatedAt: now() },
            },
          }
        })
        get().addSkuMapping({
          keyType: 'barcode',
          keyValue: barcode,
          sku,
        })
      },

      addAliasToSku: (sku, alias) => {
        set((s) => {
          const p = s.catalogProducts[sku]
          if (!p) return s
          const aliases = [...(p.aliases ?? [])]
          if (!aliases.includes(alias)) aliases.push(alias)
          return {
            catalogProducts: {
              ...s.catalogProducts,
              [sku]: { ...p, aliases, updatedAt: now() },
            },
          }
        })
      },

      addSkuMapping: (mapping) => {
        const m: SkuMapping = {
          ...mapping,
          id: uuid(),
          createdAt: now(),
        }
        set((s) => ({
          skuMappings: [...s.skuMappings, m],
        }))
      },

      createImportUpload: (upload) => {
        const id = uuid()
        const u: ImportUpload = {
          ...upload,
          id,
          createdAt: now(),
        }
        set((s) => ({
          importUploads: [u, ...s.importUploads],
        }))
        return id
      },

      addImportRows: (rows) => {
        set((s) => ({
          importRows: [...s.importRows, ...rows],
        }))
      },

      resolveImportRow: (rowId, resolvedSku, options = {}) => {
        const { createMappings = true } = options
        const state = get()
        const row = state.importRows.find((r) => r.id === rowId)
        if (!row) return

        set((s) => ({
          importRows: s.importRows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  status: 'resolved' as const,
                  resolvedSku,
                  updatedAt: now(),
                }
              : r
          ),
        }))

        // Update upload counts
        set((s) => {
          const rows = s.importRows.filter((r) => r.uploadId === row.uploadId)
          const resolved = rows.filter((r) => r.status === 'resolved').length
          const unresolved = rows.filter((r) => r.status === 'unresolved').length
          return {
            importUploads: s.importUploads.map((u) =>
              u.id === row.uploadId
                ? { ...u, resolvedCount: resolved, unresolvedCount: unresolved }
                : u
            ),
          }
        })

        if (createMappings) {
          if (row.barcode?.trim()) {
            get().addSkuMapping({
              keyType: 'barcode',
              keyValue: row.barcode.trim(),
              sku: resolvedSku,
            })
          }
          get().addSkuMapping({
            keyType: 'name_fingerprint',
            keyValue: row.fingerprint,
            sku: resolvedSku,
            vendorId: row.vendorId,
          })
          get().addAliasToSku(resolvedSku, row.productName)
        }

        get().applyResolvedRowToVendorPrice({ ...row, resolvedSku, status: 'resolved' })
      },

      ignoreImportRow: (rowId) => {
        set((s) => ({
          importRows: s.importRows.map((r) =>
            r.id === rowId ? { ...r, status: 'ignored' as const, updatedAt: now() } : r
          ),
        }))
      },

      applyResolvedRowToVendorPrice: (row) => {
        const sku = row.resolvedSku ?? row.sku
        if (!sku) return
        const vp: CatalogVendorPrice = {
          vendorId: row.vendorId,
          sku,
          price: row.price,
          lastSeenAt: now(),
          sourceUploadId: row.uploadId,
        }
        set((s) => {
          const rest = s.catalogVendorPrices.filter(
            (p) => !(p.vendorId === row.vendorId && p.sku === sku)
          )
          return { catalogVendorPrices: [vp, ...rest] }
        })
      },

      runAutoResolveForUpload: (uploadId) => {
        const state = get()
        const rows = state.importRows.filter(
          (r) => r.uploadId === uploadId && r.status === 'unresolved'
        )
        const resolveState = {
          catalogProducts: state.catalogProducts,
          skuMappings: state.skuMappings,
        }

        for (const row of rows) {
          const result = resolveRow(
            {
              sku: row.sku,
              barcode: row.barcode,
              productName: row.productName,
              brand: row.brand,
              vendorId: row.vendorId,
              fingerprint: row.fingerprint,
            },
            resolveState
          )

          if (result.status === 'resolved' && result.resolvedSku && result.confidence >= 92) {
            if (result.createdProduct) {
              get().upsertCatalogProduct(result.createdProduct)
            }
            get().resolveImportRow(row.id, result.resolvedSku, { createMappings: true })
            resolveState.catalogProducts = get().catalogProducts
            resolveState.skuMappings = get().skuMappings
          } else {
            set((s) => ({
              importRows: s.importRows.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      confidence: result.confidence,
                      proposedMatches: result.proposedMatches,
                      conflictNote: result.conflictNote,
                    }
                  : r
              ),
            }))
          }
        }
      },

      getState: () => get(),
    }),
    {
      name: 'estoqui:catalog:v1',
      partialize: (s) => ({
        catalogProducts: s.catalogProducts,
        catalogVendorPrices: s.catalogVendorPrices,
        skuMappings: s.skuMappings,
        importUploads: s.importUploads,
        importRows: s.importRows,
      }),
    }
  )
)
