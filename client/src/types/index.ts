// ─── Domain types (Phase 2) ───────────────────────────────────────────────

export type VendorStatus = 'active' | 'inactive' | 'probation'
export type VendorChannel = 'whatsapp' | 'email' | 'drive' | 'portal'
export type VendorCadence = 'weekly' | 'biweekly' | 'monthly' | 'ad-hoc'

export interface Vendor {
  id: string
  name: string
  phone: string
  notes: string
  status?: VendorStatus
  contactName?: string
  contactEmail?: string
  preferredChannel?: VendorChannel
  updateCadence?: VendorCadence
  expectedUpdateDayOfWeek?: number // 0-6
  lastPriceListAt?: string // ISO date
  staleAfterDays?: number // default 7
  score?: number // 0-100
  createdAt?: string // ISO date
  updatedAt?: string // ISO date
}

export interface Product {
  id: string
  name: string
  brand: string
  sku?: string
  category?: string
  unitSize?: string
  minStock: number
  stockQty?: number
  unitCost?: number
  unitPrice?: number
}

export type PackType = 'CASE' | 'UNIT'
export type PriceBasis = 'PER_CASE' | 'PER_UNIT'

export interface VendorPrice {
  vendorId: string
  productId: string
  unitPrice: number
  updatedAt: string // ISO date
  packType?: PackType
  unitsPerCase?: number           // default 1
  unitDescriptor?: string         // e.g. "12 oz bottle", "330ml"
  priceBasis?: PriceBasis         // default "PER_UNIT"
  parseVersion?: number           // migration version
  unitCost?: number               // derived: effective per-unit cost
}

export interface VendorPriceUpload {
  id: string
  vendorId: string
  source: 'csv_upload' | 'manual_entry' | 'whatsapp_parse' | 'drive_import'
  fileName: string
  parsedAt: string // ISO date
  rowCount: number
  validRowCount: number
  invalidRowCount: number
  coveragePercent: number // 0-100
  hasSkuPercent: number // 0-100
  createdAt: string // ISO date
}

export interface StockSnapshotRow {
  rawName: string
  rawBrand: string
  rawSku?: string
  rawVendor?: string
  stockQty: number
  matchedProductId: string | null
  unitCost?: number
  unitPrice?: number
  category?: string
}

export interface StockSnapshot {
  id: string
  uploadedAt: string // ISO date
  sourceFileName?: string
  sourceType?: string
  rows: StockSnapshotRow[]
}

export interface ReorderDraftLine {
  productId: string
  currentStock: number
  minStock: number
  suggestedQty: number
  chosenVendorId: string | null
  unitPrice: number                      // current display price (changes with toggle)
  priceUpdatedAt: string | null
  selected: boolean
  packType?: PackType
  unitsPerCase?: number
  // Original vendor pricing — preserved for CASE ↔ UNIT toggle recalculation
  vendorCasePrice?: number               // original case price from vendor
  vendorUnitsPerCase?: number            // original units per case from vendor
}

export interface ReorderDraft {
  snapshotId: string | null
  lines: ReorderDraftLine[]
}

export interface OrderLine {
  productId: string
  vendorId: string
  productName: string
  qty: number
  unitPrice: number
  lineTotal: number
  packType?: PackType
  unitsPerCase?: number
}

export interface Order {
  id: string
  createdAt: string // ISO date
  snapshotId?: string | null
  total: number
  totalsByVendor: Record<string, number>
  lines: OrderLine[]
}

export interface Activity {
  id: string
  type: string
  description: string
  date: string // ISO date
}

export interface AppSettings {
  storeName: string
  stalenessThreshold: number // days
  defaultMinStock: number
  openaiApiKey: string
}

// Match cache: key (e.g. "name|brand") -> productId
export type Matches = Record<string, string>

// ─── Persisted state shape (subset of store) ───────────────────────────────

export interface PersistedState {
  vendors: Vendor[]
  products: Product[]
  vendorPrices: VendorPrice[]
  vendorPriceUploads: VendorPriceUpload[]
  stockSnapshots: StockSnapshot[]
  matches: Matches
  reorderDraft: ReorderDraft
  orders: Order[]
  activity: Activity[]
  settings: AppSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  storeName: 'My Store',
  stalenessThreshold: 45,
  defaultMinStock: 10,
  openaiApiKey: '',
}
