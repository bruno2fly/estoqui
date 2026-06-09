import type { Vendor, VendorStatus } from '@/types'

/**
 * Vendor Health Score (0-100):
 *   Freshness (0-50): 50 if within staleAfterDays, linear decay to 0 by day 30
 *   Coverage  (0-30): coveragePercent scaled to 30
 *   SKU Quality (0-20): hasSkuPercent scaled to 20
 */
export function computeVendorScore(
  vendor: Vendor,
  latestUpload?: { coveragePercent: number; hasSkuPercent: number }
): number {
  const staleAfterDays = vendor.staleAfterDays ?? 7
  const lastUpdate = vendor.lastPriceListAt ? new Date(vendor.lastPriceListAt) : null

  let freshness = 0
  if (lastUpdate) {
    const daysSince = Math.max(0, (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince <= staleAfterDays) {
      freshness = 50
    } else if (daysSince <= 30) {
      freshness = 50 * (1 - (daysSince - staleAfterDays) / (30 - staleAfterDays))
    }
  }

  const coverage = latestUpload ? (latestUpload.coveragePercent / 100) * 30 : 0

  const skuQuality = latestUpload ? (latestUpload.hasSkuPercent / 100) * 20 : 0

  return Math.round(Math.min(100, Math.max(0, freshness + coverage + skuQuality)))
}

export function computeVendorStatus(vendor: Vendor): VendorStatus {
  if (!vendor.lastPriceListAt) return 'inactive'
  const daysSince = (Date.now() - new Date(vendor.lastPriceListAt).getTime()) / (1000 * 60 * 60 * 24)
  const staleAfterDays = vendor.staleAfterDays ?? 7
  if (daysSince <= staleAfterDays) return 'active'
  if (daysSince <= 30) return 'probation'
  return 'inactive'
}

export function daysSinceUpdate(vendor: Vendor): number | null {
  if (!vendor.lastPriceListAt) return null
  return Math.floor((Date.now() - new Date(vendor.lastPriceListAt).getTime()) / (1000 * 60 * 60 * 24))
}

export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-success'
  if (score >= 40) return 'text-warning'
  return 'text-danger'
}

/** Check if a vendor's price list was updated during the current week (Mon–Sun). */
export function isUpdatedThisWeek(vendor: Vendor): boolean {
  if (!vendor.lastPriceListAt) return false
  const now = new Date()
  // Get Monday of current week
  const day = now.getDay() // 0=Sun, 1=Mon...
  const diff = day === 0 ? 6 : day - 1 // days since Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
  monday.setHours(0, 0, 0, 0)
  return new Date(vendor.lastPriceListAt) >= monday
}

export function getWeeklyBadge(vendor: Vendor): { label: string; className: string } {
  if (isUpdatedThisWeek(vendor)) {
    return { label: 'Updated', className: 'bg-success-bg text-success border border-success/30' }
  }
  return { label: 'Needs Update', className: 'bg-warning-bg text-warning border border-warning/30' }
}

export function getStatusBadge(status: VendorStatus | undefined): { label: string; className: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'bg-success-bg text-success border border-success/30' }
    case 'probation':
      return { label: 'Probation', className: 'bg-warning-bg text-warning border border-warning/30' }
    case 'inactive':
    default:
      return { label: 'Inactive', className: 'bg-danger-bg text-danger border border-danger/30' }
  }
}
