/**
 * Build WhatsApp reorder message for a supplier
 */
export function buildReorderMessage(pharmacyName, supplierName, medicines) {
  const lines = medicines.map(m => `• ${m.name} — Qty: ${m.quantity} ${m.unit || 'strips'}`);
  const msg = `Hello ${supplierName},\n\nThis is ${pharmacyName}. We need to reorder the following medicines:\n\n${lines.join('\n')}\n\nPlease confirm availability and delivery timeline.\n\nThank you!`;
  return msg;
}

/**
 * Build WhatsApp receipt message
 */
export function buildReceiptMessage(pharmacyName, sale) {
  const items = (sale.sale_items || []).map(i => `• ${i.medicines?.name || 'Item'} x${i.quantity} = ₹${i.subtotal}`);
  return `Receipt from ${pharmacyName}\nInvoice: ${sale.invoice_no}\nDate: ${new Date(sale.created_at).toLocaleDateString('en-IN')}\n\n${items.join('\n')}\n\nSubtotal: ₹${sale.subtotal}\nDiscount: ${sale.discount_pct}%\nTax: ₹${sale.tax_amount}\nTotal: ₹${sale.total_amount}\nPayment: ${sale.payment_method?.toUpperCase()}\n\nThank you for your purchase!`;
}

/**
 * Open WhatsApp with pre-filled message
 */
export function openWhatsApp(phone, message) {
  const cleanPhone = phone?.replace(/[^0-9]/g, '');
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
}
