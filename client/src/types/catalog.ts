export type VendorId = string

export type CatalogProduct = {
  sku: string
  name: string
  brand?: string
  barcode?: string
  aliases?: string[]
  createdAt: string
  updatedAt: string
}

export type CatalogVendorPrice = {
  vendorId: VendorId
  sku: string
  price: number
  lastSeenAt: string
  sourceUploadId: string
}

export type SkuMappingKeyType = 'barcode' | 'name_fingerprint' | 'vendor_sku'

export type SkuMapping = {
  id: string
  keyType: SkuMappingKeyType
  keyValue: string
  sku: string
  vendorId?: VendorId
  createdAt: string
}

export type ImportUpload = {
  id: string
  vendorId: VendorId
  source: 'csv_upload' | 'pdf_upload' | 'image_ocr' | 'manual_entry'
  fileName?: string
  createdAt: string
  rowCount: number
  resolvedCount: number
  unresolvedCount: number
  notes?: string
}

export type ImportRow = {
  id: string
  uploadId: string
  vendorId: VendorId
  sku?: string
  barcode?: string
  productName: string
  brand?: string
  price: number
  fingerprint: string
  status: 'resolved' | 'unresolved' | 'ignored'
  resolvedSku?: string
  confidence: number
  proposedMatches?: Array<{ sku: string; score: number }>
  conflictNote?: string
  createdAt: string
  updatedAt: string
}
