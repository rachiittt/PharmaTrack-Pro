/**
 * Price previews shown while a bill or purchase is being built. The database
 * recomputes everything authoritatively (create_sale / receive_purchase);
 * these mirror its rounding so the preview and the final invoice agree.
 */
const round2 = (n) => Math.round(n * 100) / 100;

/** Retail sale: selling prices include GST (Indian MRP convention). */
export function previewTotals(lines) {
  let gross = 0; let discount = 0; let taxable = 0; let tax = 0;
  for (const l of lines) {
    const lineGross = round2((l.price || 0) * l.quantity);
    const net = round2(lineGross * (1 - (l.discount_pct || 0) / 100));
    const lineTaxable = round2(net / (1 + (l.gst_rate || 0) / 100));
    gross += lineGross;
    discount += lineGross - net;
    taxable += lineTaxable;
    tax += net - lineTaxable;
  }
  const net = taxable + tax;
  const total = Math.round(net);
  return { gross: round2(gross), discount: round2(discount), taxable: round2(taxable), tax: round2(tax), roundOff: round2(total - net), total };
}

/** Purchase line: supplier rates exclude GST. */
export function purchaseLineTotals(line) {
  const qty = Number(line.quantity) || 0;
  const rate = Number(line.purchase_price) || 0;
  const gst = Number(line.gst_rate) || 0;
  const taxable = round2(qty * rate);
  const tax = round2((taxable * gst) / 100);
  return { taxable, tax, total: round2(taxable + tax) };
}
