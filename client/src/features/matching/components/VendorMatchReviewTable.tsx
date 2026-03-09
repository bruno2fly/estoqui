import { useState, useMemo, useCallback } from 'react'
import { useCatalogMatchStore } from '@/store/catalogMatchStore'
import type { MatchResult, MatchStatus } from '@/lib/catalogMatch/types'
import { deriveBrandKeyFromName, DEFAULT_BRANDS } from '@/lib/catalogMatch/brand'

type FilterStatus = 'all' | MatchStatus

export function VendorMatchReviewTable() {
  const matchResults = useCatalogMatchStore((s) => s.matchResults)
  const masterProducts = useCatalogMatchStore((s) => s.masterProducts)
  const confirmMatch = useCatalogMatchStore((s) => s.confirmMatch)
  const createNewMaster = useCatalogMatchStore((s) => s.createNewMasterFromVendor)
  const learnBrand = useCatalogMatchStore((s) => s.learnBrand)

  const brandDict = useCatalogMatchStore((s) => s.brandDict)

  const handleLearnBrand = useCallback((rawName: string, brandDisplay: string) => {
    if (!brandDisplay.trim()) return
    const mergedDict = { ...DEFAULT_BRANDS, ...brandDict }
    const key = deriveBrandKeyFromName(rawName, mergedDict)
    if (key) learnBrand(key, brandDisplay.trim())
  }, [learnBrand, brandDict])

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')

  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const r of matchResults) {
      if (r.parsed.brand) set.add(r.parsed.brand)
    }
    return Array.from(set).sort()
  }, [matchResults])

  const filtered = useMemo(() => {
    let rows = matchResults
    if (filterStatus !== 'all') {
      rows = rows.filter((r) => r.status === filterStatus)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((r) =>
        r.parsed.originalName.toLowerCase().includes(q) ||
        r.parsed.brand.includes(q)
      )
    }
    if (brandFilter) {
      rows = rows.filter((r) => r.parsed.brand === brandFilter)
    }
    return rows
  }, [matchResults, filterStatus, search, brandFilter])

  const statusCounts = useMemo(() => {
    const c = { all: matchResults.length, auto: 0, needs_review: 0, confirmed: 0, new_product: 0 }
    for (const r of matchResults) c[r.status]++
    return c
  }, [matchResults])

  if (matchResults.length === 0) {
    return (
      <div className="text-center py-12 text-fg-secondary text-[13px]">
        No vendor rows imported yet. Import a vendor price list above to start matching.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {([
            ['all', `All (${statusCounts.all})`],
            ['needs_review', `Needs Review (${statusCounts.needs_review})`],
            ['auto', `Auto (${statusCounts.auto})`],
            ['confirmed', `Confirmed (${statusCounts.confirmed})`],
            ['new_product', `New (${statusCounts.new_product})`],
          ] as [FilterStatus, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                filterStatus === key
                  ? 'bg-fg text-background'
                  : 'text-fg-secondary hover:bg-surface-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search product name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-input-bg border border-input-border text-fg px-3 py-1.5 rounded-lg text-[12px] w-52"
        />
        {brands.length > 0 && (
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="bg-input-bg border border-input-border text-fg px-2 py-1.5 rounded-lg text-[12px]"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="border border-surface-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Vendor Product', 'Brand', 'Pack', 'Unit Size', 'Case Price', 'Unit Cost', 'Confidence', 'Match', 'Actions'].map((h) => (
                  <th key={h} className="text-left text-fg font-semibold text-[12px] px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((result) => (
                <MatchRow
                  key={result.vendorRowId}
                  result={result}
                  masterProducts={masterProducts}
                  onConfirm={confirmMatch}
                  onCreateNew={createNewMaster}
                  onLearnBrand={handleLearnBrand}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[13px] text-muted">
                    No results match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── Single row ──────────────────────────────────────────────────────────── */

function MatchRow({
  result,
  masterProducts,
  onConfirm,
  onCreateNew,
  onLearnBrand,
}: {
  result: MatchResult
  masterProducts: { id: string; canonicalName: string; brand: string }[]
  onConfirm: (vendorRowId: string, masterProductId: string) => void
  onCreateNew: (vendorRowId: string) => void
  onLearnBrand: (rawName: string, brandDisplay: string) => void
}) {
  const [selectedId, setSelectedId] = useState(result.selectedMasterProductId ?? '')
  const [editBrand, setEditBrand] = useState(result.parsed.brand)
  const isDone = result.status === 'confirmed' || result.status === 'new_product'

  const sizeLabel = result.parsed.unitSizeValue !== null
    ? `${result.parsed.unitSizeValue}${result.parsed.unitSizeUnit ?? ''}`
    : '—'

  const confidencePct = Math.round(result.confidence * 100)
  const confidenceColor =
    confidencePct >= 88 ? 'text-success' :
    confidencePct >= 60 ? 'text-amber-500' :
    'text-danger'

  const statusBadge = {
    auto: { label: 'Auto', cls: 'bg-success/10 text-success' },
    confirmed: { label: 'Confirmed', cls: 'bg-primary/10 text-primary' },
    needs_review: { label: 'Review', cls: 'bg-amber-500/10 text-amber-600' },
    new_product: { label: 'New', cls: 'bg-purple-500/10 text-purple-600' },
  }[result.status]

  const handleBrandBlur = () => {
    const trimmed = editBrand.trim()
    if (trimmed && trimmed !== result.parsed.brand) {
      onLearnBrand(result.parsed.originalName, trimmed)
    }
  }

  return (
    <tr className="border-t border-surface-border hover:bg-surface-hover transition-colors">
      <td className="px-4 py-3">
        <div className="max-w-[260px]">
          <p className="text-[13px] text-fg font-medium truncate" title={result.parsed.originalName}>
            {result.parsed.originalName}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={editBrand}
          onChange={(e) => setEditBrand(e.target.value)}
          onBlur={handleBrandBlur}
          className="bg-input-bg border border-input-border text-fg px-2 py-1 rounded-md text-[11px] w-24"
          placeholder="Brand"
          title="Edit to teach the system this brand"
        />
      </td>
      <td className="px-4 py-3 text-[13px] text-fg tabular-nums">
        {result.parsed.packCount > 1 ? `${result.parsed.packCount}x` : '1x'}
      </td>
      <td className="px-4 py-3 text-[13px] text-fg tabular-nums">{sizeLabel}</td>
      <td className="px-4 py-3 text-[13px] text-fg tabular-nums">
        $ {result.casePrice.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-[13px] text-fg tabular-nums">
        {result.derivedUnitCost !== null ? `$ ${result.derivedUnitCost.toFixed(2)}` : '—'}
      </td>
      <td className="px-4 py-3">
        <span className={`text-[13px] font-semibold tabular-nums ${confidenceColor}`}>
          {confidencePct}%
        </span>
      </td>
      <td className="px-4 py-3">
        {isDone ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-input-bg border border-input-border text-fg px-2 py-1.5 rounded-lg text-[11px] min-w-[200px]"
          >
            <option value="">Select match...</option>
            {result.candidates.map((c) => {
              const mp = masterProducts.find((m) => m.id === c.masterProductId)
              return (
                <option key={c.masterProductId} value={c.masterProductId}>
                  {mp?.canonicalName ?? 'Unknown'} ({Math.round(c.score * 100)}%)
                </option>
              )
            })}
            <option disabled>────────────</option>
            {masterProducts
              .filter((mp) => !result.candidates.some((c) => c.masterProductId === mp.id))
              .slice(0, 20)
              .map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.canonicalName} {mp.brand ? `(${mp.brand})` : ''}
                </option>
              ))}
          </select>
        )}
      </td>
      <td className="px-4 py-3">
        {!isDone && (
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!selectedId}
              onClick={() => { if (selectedId) onConfirm(result.vendorRowId, selectedId) }}
              className="px-2.5 py-1.5 rounded-md bg-fg text-background text-[11px] font-medium hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => onCreateNew(result.vendorRowId)}
              className="px-2.5 py-1.5 rounded-md border border-surface-border text-[11px] font-medium text-fg-secondary hover:bg-surface-hover transition-colors"
            >
              New
            </button>
          </div>
        )}
        {isDone && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        )}
      </td>
    </tr>
  )
}
