import { useState, useMemo } from 'react'
import { useStore } from '@/store'
import { ConfirmDialog, InfoTip } from '@/shared/components'
import { useToast } from '@/shared/components'
import { VendorFormModal } from './VendorFormModal'
import { VendorDetailModal } from './VendorDetailModal'
import {
  computeVendorScore,
  computeVendorStatus,
  daysSinceUpdate,
  getScoreColor,
  getStatusBadge,
} from '../lib/vendorScore'
import type { Vendor, VendorStatus } from '@/types'

type SortKey = 'name' | 'score' | 'lastUpdate'
type SortDir = 'asc' | 'desc'

export function VendorsPage() {
  const toast = useToast()
  const vendors = useStore((s) => s.vendors)
  const vendorPrices = useStore((s) => s.vendorPrices)
  const vendorPriceUploads = useStore((s) => s.vendorPriceUploads)
  const addVendor = useStore((s) => s.addVendor)
  const updateVendor = useStore((s) => s.updateVendor)
  const deleteVendor = useStore((s) => s.deleteVendor)
  const addActivity = useStore((s) => s.addActivity)

  const [formModal, setFormModal] = useState<'add' | 'edit' | null>(null)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [detailVendorId, setDetailVendorId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [statusFilter, setStatusFilter] = useState<VendorStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const vendorRows = useMemo(() => {
    return vendors.map((v) => {
      const status = computeVendorStatus(v)
      const latestUpload = vendorPriceUploads.find((u) => u.vendorId === v.id)
      const score = computeVendorScore(v, latestUpload ?? undefined)
      const days = daysSinceUpdate(v)
      const priceCount = vendorPrices.filter((vp) => vp.vendorId === v.id).length
      return { vendor: v, status, score, days, priceCount, latestUpload }
    })
  }, [vendors, vendorPriceUploads, vendorPrices])

  const filtered = useMemo(() => {
    let rows = vendorRows
    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }
    rows.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'name') return dir * a.vendor.name.localeCompare(b.vendor.name)
      if (sortKey === 'score') return dir * (a.score - b.score)
      if (sortKey === 'lastUpdate') {
        const aD = a.days ?? 9999
        const bD = b.days ?? 9999
        return dir * (aD - bD)
      }
      return 0
    })
    return rows
  }, [vendorRows, statusFilter, sortKey, sortDir])

  const handleSaveVendor = (data: Partial<Vendor> & { name: string }) => {
    if (formModal === 'add') {
      addVendor({
        name: data.name,
        phone: data.phone ?? '',
        notes: data.notes ?? '',
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        preferredChannel: data.preferredChannel,
        updateCadence: data.updateCadence,
        staleAfterDays: data.staleAfterDays,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } else if (editingVendor) {
      updateVendor(editingVendor.id, { ...data, updatedAt: new Date().toISOString() })
    }
    setFormModal(null)
    setEditingVendor(null)
  }

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    const name = deleteTarget.name
    deleteVendor(deleteTarget.id)
    addActivity('system', `Vendor deleted: ${name}`)
    toast.show('Vendor deleted')
    setDeleteTarget(null)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return null
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  const avgScore = vendorRows.length > 0
    ? Math.round(vendorRows.reduce((s, r) => s + r.score, 0) / vendorRows.length)
    : 0
  const activeCount = vendorRows.filter((r) => r.status === 'active').length
  const probationCount = vendorRows.filter((r) => r.status === 'probation').length
  const inactiveCount = vendorRows.filter((r) => r.status === 'inactive').length

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {vendors.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Avg Score" value={avgScore} color={getScoreColor(avgScore)} tip="The average quality score of all your vendors. Higher is better — based on how often they update prices and how complete their product lists are." />
          <SummaryCard label="Active" value={activeCount} color="text-green-600 dark:text-green-400" tip="Vendors who are up to date. Their price lists are recent and ready to use." />
          <SummaryCard label="Probation" value={probationCount} color="text-amber-600 dark:text-amber-400" tip="Vendors whose price lists are getting old. They need to send you an updated list soon." />
          <SummaryCard label="Inactive" value={inactiveCount} color="text-red-600 dark:text-red-400" tip="Vendors who haven't sent a price list in a long time. You may want to contact them or remove them." />
        </div>
      )}

      {/* Vendor table */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            <span className="text-[13px] font-semibold text-fg">Vendor Compliance</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as VendorStatus | 'all')}
              className="bg-input-bg border border-input-border text-fg px-2.5 py-1.5 rounded-lg text-[12px] focus:outline-none focus:border-primary"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="probation">Probation</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              type="button"
              onClick={() => { setFormModal('add'); setEditingVendor(null) }}
              className="px-3.5 py-1.5 rounded-lg bg-fg text-background text-[12px] font-medium hover:opacity-80 transition-opacity"
            >
              + Add Vendor
            </button>
          </div>
        </div>

        {vendors.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted text-sm">No vendors registered</p>
          </div>
        ) : (
          <div className="border border-surface-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  <SortHeader label="Vendor" sortKey="name" current={sortKey} dir={sortDir} onClick={toggleSort} sortIcon={sortIcon} />
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">
                    <span className="inline-flex items-center gap-1">Status <InfoTip text="Shows if this vendor is Active (up to date), on Probation (getting old), or Inactive (very outdated)." /></span>
                  </th>
                  <SortHeader label="Score" sortKey="score" current={sortKey} dir={sortDir} onClick={toggleSort} sortIcon={sortIcon} />
                  <SortHeader label="Last Update" sortKey="lastUpdate" current={sortKey} dir={sortDir} onClick={toggleSort} sortIcon={sortIcon} />
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">
                    <span className="inline-flex items-center gap-1">Coverage <InfoTip text="How much of this vendor's product list matched your catalog. 100% means every item they sent was found in your products." /></span>
                  </th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">
                    <span className="inline-flex items-center gap-1">SKU% <InfoTip text="How many products from this vendor have a barcode (SKU). Barcodes help match products correctly." /></span>
                  </th>
                  <th className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3">Products</th>
                  <th className="text-right text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ vendor, status, score, days, priceCount, latestUpload }) => {
                  const badge = getStatusBadge(status)
                  const stale = (vendor.staleAfterDays ?? 7) < (days ?? 9999)
                  return (
                    <tr
                      key={vendor.id}
                      className="border-t border-surface-border hover:bg-surface-hover transition-colors cursor-pointer"
                      onClick={() => setDetailVendorId(vendor.id)}
                    >
                      <td className="px-3 py-3">
                        <div className="text-[13px] font-medium text-fg">{vendor.name}</div>
                        {vendor.updateCadence && (
                          <div className="text-[11px] text-muted capitalize">{vendor.updateCadence}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xl font-bold tabular-nums ${getScoreColor(score)}`}>
                          {score}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {days !== null ? (
                          <div className={stale ? 'text-red-500' : 'text-fg'}>
                            <span className="text-[13px]">{days === 0 ? 'Today' : `${days}d ago`}</span>
                            {stale && <span className="block text-[10px] text-red-500">STALE</span>}
                          </div>
                        ) : (
                          <span className="text-[13px] text-muted">Never</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg tabular-nums">
                        {latestUpload ? `${latestUpload.coveragePercent}%` : '-'}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg tabular-nums">
                        {latestUpload ? `${latestUpload.hasSkuPercent}%` : '-'}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg tabular-nums">
                        {priceCount}
                      </td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setDetailVendorId(vendor.id)}
                          className="px-3 py-1.5 rounded-md bg-fg text-background text-[11px] font-medium hover:opacity-80 transition-opacity"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <VendorFormModal
        open={formModal !== null}
        onClose={() => { setFormModal(null); setEditingVendor(null) }}
        mode={formModal === 'edit' ? 'edit' : 'add'}
        vendor={editingVendor}
        onSaved={handleSaveVendor}
      />

      <VendorDetailModal
        open={detailVendorId !== null}
        onClose={() => setDetailVendorId(null)}
        vendorId={detailVendorId}
        onEdit={(vendor) => {
          setDetailVendorId(null)
          setEditingVendor(vendor as Vendor)
          setFormModal('edit')
        }}
        onDelete={(vendor) => {
          setDetailVendorId(null)
          setDeleteTarget(vendor as Vendor)
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete vendor?"
        message={
          deleteTarget ? (
            <>
              Delete vendor &quot;{deleteTarget.name}&quot;?
              {vendorPrices.filter((vp) => vp.vendorId === deleteTarget.id).length > 0 && (
                <>
                  <br /><br />
                  This will also remove{' '}
                  {vendorPrices.filter((vp) => vp.vendorId === deleteTarget.id).length}{' '}
                  price entries for this vendor.
                </>
              )}
            </>
          ) : ''
        }
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}

function SummaryCard({ label, value, color, tip }: { label: string; value: number; color: string; tip?: string }) {
  return (
    <div className="bg-surface border border-surface-border rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="flex items-center justify-center gap-1.5 mt-1">
        <span className="text-[11px] text-muted uppercase tracking-wide">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
    </div>
  )
}

function SortHeader({
  label,
  sortKey: key,
  onClick,
  sortIcon,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onClick: (key: SortKey) => void
  sortIcon: (key: SortKey) => string | null
}) {
  return (
    <th
      className="text-left text-fg-secondary font-semibold text-[11px] uppercase px-3 py-3 cursor-pointer select-none hover:text-fg transition-colors"
      onClick={() => onClick(key)}
    >
      {label}{sortIcon(key)}
    </th>
  )
}
