import { supabase, unwrap, rpc, AppError } from '../lib/supabase';

export async function listPurchases({ pharmacyId, supplierId, status, page = 1, pageSize = 25 }) {
  let q = supabase.from('purchases')
    .select('id, reference_no, supplier_invoice_no, invoice_date, due_date, total_amount, amount_paid, payment_status, created_at, suppliers(id, name)', { count: 'exact' })
    .eq('pharmacy_id', pharmacyId)
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (supplierId) q = q.eq('supplier_id', supplierId);
  if (status) q = q.eq('payment_status', status);
  const { data, count } = unwrap(await q);
  return { rows: data, total: count ?? 0 };
}

export async function getPurchase(id) {
  const purchase = unwrap(await supabase.from('purchases')
    .select('*, suppliers(id, name, phone, gstin), branches(name), purchase_items(*, products(name, unit)), supplier_payments(id, amount, method, paid_on, reference)')
    .eq('id', id).single());
  purchase.purchase_items.sort((a, b) => a.products.name.localeCompare(b.products.name));
  return purchase;
}

/**
 * Receive stock against a supplier invoice. Batches are created or topped up,
 * the stock ledger and payable are written, all in one database transaction.
 */
export function receivePurchase({ pharmacyId, branchId, supplierId, invoiceNo, invoiceDate, dueDate, items, amountPaid, paymentMethod, notes, invoiceFilePath }) {
  return rpc('receive_purchase', {
    p_pharmacy_id: pharmacyId,
    p_branch_id: branchId,
    p_supplier_id: supplierId,
    p_supplier_invoice_no: invoiceNo,
    p_invoice_date: invoiceDate,
    p_items: items.map((i) => ({
      product_id: i.product_id,
      batch_no: i.batch_no,
      mfg_date: i.mfg_date || null,
      expiry_date: i.expiry_date,
      quantity: Number(i.quantity),
      free_quantity: Number(i.free_quantity || 0),
      purchase_price: Number(i.purchase_price),
      selling_price: Number(i.selling_price),
      mrp: Number(i.mrp),
      gst_rate: i.gst_rate === '' || i.gst_rate == null ? null : Number(i.gst_rate),
    })),
    p_amount_paid: Number(amountPaid || 0),
    p_payment_method: paymentMethod || 'cash',
    p_due_date: dueDate || null,
    p_notes: notes || null,
    p_invoice_file_path: invoiceFilePath || null,
  });
}

export function recordPayment({ purchaseId, amount, method, reference }) {
  return rpc('record_supplier_payment', {
    p_purchase_id: purchaseId, p_amount: Number(amount), p_method: method, p_reference: reference || null,
  });
}

const ALLOWED = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Upload a scanned supplier invoice to private storage under the pharmacy's folder. */
export async function uploadInvoiceFile(pharmacyId, file) {
  const ext = ALLOWED[file.type];
  if (!ext) throw new AppError('Upload a PDF, PNG, JPG or WEBP file.');
  if (file.size > 10 * 1024 * 1024) throw new AppError('Invoice files must be under 10 MB.');
  const path = `${pharmacyId}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${ext}`;
  unwrap(await supabase.storage.from('purchase-invoices').upload(path, file, { contentType: file.type, upsert: false }));
  return path;
}

export async function invoiceFileUrl(path) {
  const { signedUrl } = unwrap(await supabase.storage.from('purchase-invoices').createSignedUrl(path, 300));
  return signedUrl;
}

export { purchaseLineTotals } from '../lib/pricing';
