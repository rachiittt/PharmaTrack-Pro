/**
 * Generate unique invoice number: SPMS-YYYYMMDD-XXXX
 */
export function generateInvoiceNo() {
  const now = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SPMS-${date}-${rand}`;
}
