const TEMPLATE_HEADERS = 'sku,product_name,brand,unit_size,unit_type,price,available'
const TEMPLATE_ROWS = [
  '10006,Chocolate Drink Mix 370g,Nestle,370g,each,3.49,true',
  '00197,Chocolate Powder 200g,Dois Frades,200g,each,8.00,true',
  ',Rice Type 1 5kg,,5kg,bag,22.90,true',
]

export function generateVendorCsvTemplate(): string {
  return [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].join('\n')
}

export function downloadVendorCsvTemplate() {
  const csv = generateVendorCsvTemplate()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'vendor_price_list_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
