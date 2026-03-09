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
    return item.unitsPerCase && item.unitsPerCase > 1 ? `cx(${item.unitsPerCase}u)` : 'cx'
  }
  return 'un'
}

export function formatWhatsAppMessage(
  storeName: string,
  vendorName: string,
  items: OrderExportItem[],
  subtotal: number
): string {
  const date = new Date().toLocaleDateString('pt-BR')
  let text = `*Pedido — ${storeName}*\n`
  text += `*Para: ${vendorName}*\n`
  text += `*Data: ${date}*\n\n`
  items.forEach((item, i) => {
    text += `${i + 1}. ${item.qty}x (${packLabel(item)}) ${item.name} — R$ ${item.unitPrice.toFixed(2)} = R$ ${item.lineTotal.toFixed(2)}\n`
  })
  text += `\n*Total: R$ ${subtotal.toFixed(2)}*`
  text += `\n*Itens: ${items.length}*`
  text += `\n\nFavor confirmar disponibilidade. Obrigado!`
  return text
}

export function formatOrderCSV(
  lines: { productName: string; qty: number; unitPrice: number; lineTotal: number; packType?: 'CASE' | 'UNIT'; unitsPerCase?: number }[],
  total: number
): string {
  let csv = 'Produto,Qtd,Tipo,Preço Unitário,Total\n'
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
    text += `${line.qty}x (${packLabel(line)}) ${line.productName} - R$ ${line.unitPrice.toFixed(2)} = R$ ${line.lineTotal.toFixed(2)}\n`
  })
  text += `\nTotal: R$ ${total.toFixed(2)}\n\n`
  text += `Thank you,\n${storeName}`
  return text
}
