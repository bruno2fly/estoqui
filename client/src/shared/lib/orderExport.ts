export interface OrderExportItem {
  qty: number
  name: string
  unitPrice: number
  lineTotal: number
  packType?: 'CASE' | 'UNIT'
  unitsPerCase?: number
}

function packLabel(item: { packType?: 'CASE' | 'UNIT'; unitsPerCase?: number }): string {
  if (item.packType === 'CASE') {
    return item.unitsPerCase && item.unitsPerCase > 1 ? `case(${item.unitsPerCase}u)` : 'case'
  }
  return 'unit'
}

export function formatWhatsAppMessage(
  storeName: string,
  vendorName: string,
  items: OrderExportItem[],
  subtotal: number
): string {
  const date = new Date().toLocaleDateString('en-US')
  let text = `*Order — ${storeName}*\n`
  text += `*To: ${vendorName}*\n`
  text += `*Date: ${date}*\n\n`
  items.forEach((item, i) => {
    text += `${i + 1}. ${item.qty}x (${packLabel(item)}) ${item.name} — $ ${item.unitPrice.toFixed(2)} = $ ${item.lineTotal.toFixed(2)}\n`
  })
  text += `\n*Total: $ ${subtotal.toFixed(2)}*`
  text += `\n*Items: ${items.length}*`
  text += `\n\nPlease confirm availability. Thank you!`
  return text
}

export function formatOrderCSV(
  lines: { productName: string; qty: number; unitPrice: number; lineTotal: number; packType?: 'CASE' | 'UNIT'; unitsPerCase?: number }[],
  total: number
): string {
  let csv = 'Product,Qty,Type,Unit Price,Total\n'
  lines.forEach((line) => {
    const tipo = packLabel(line).toUpperCase()
    csv += `"${(line.productName || '').replace(/"/g, '""')}",${line.qty},${tipo},${line.unitPrice.toFixed(2)},${line.lineTotal.toFixed(2)}\n`
  })
  csv += `\nTotal,,,,${total.toFixed(2)}\n`
  return csv
}

export function formatOrderEmail(
  vendorName: string,
  lines: { productName: string; qty: number; unitPrice: number; lineTotal: number; packType?: 'CASE' | 'UNIT'; unitsPerCase?: number }[],
  total: number,
  storeName: string = 'Store'
): string {
  let text = `Dear ${vendorName},\n\n`
  text += `Please find below our weekly order:\n\n`
  lines.forEach((line) => {
    text += `${line.qty}x (${packLabel(line)}) ${line.productName} - $ ${line.unitPrice.toFixed(2)} = $ ${line.lineTotal.toFixed(2)}\n`
  })
  text += `\nTotal: $ ${total.toFixed(2)}\n\n`
  text += `Thank you,\n${storeName}`
  return text
}
