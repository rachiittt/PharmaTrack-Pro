import { supabase, unwrap, rpc } from '../lib/supabase';

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'credit', label: 'Credit' },
];
export const RETURN_REASONS = [
  { value: 'customer_request', label: 'Customer request', restock: true },
  { value: 'wrong_item', label: 'Wrong item billed', restock: true },
  { value: 'damaged', label: 'Damaged', restock: false },
  { value: 'expired', label: 'Expired', restock: false },
  { value: 'adverse_reaction', label: 'Adverse reaction', restock: false },
  { value: 'other', label: 'Other', restock: true },
];

/**
 * Complete a sale. Stock allocation (FEFO), prices, tax and the invoice
 * number are decided by the database in one transaction. The idempotency key
 * makes retries after a network failure safe.
 */
export function createSale({ pharmacyId, branchId, items, paymentMethod, idempotencyKey, customerName, customerPhone, doctorName, notes }) {
  return rpc('create_sale', {
    p_pharmacy_id: pharmacyId,
    p_branch_id: branchId,
    p_items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, discount_pct: i.discount_pct || 0 })),
    p_payment_method: paymentMethod,
    p_idempotency_key: idempotencyKey,
    p_customer_name: customerName || null,
    p_customer_phone: customerPhone || null,
    p_doctor_name: doctorName || null,
    p_notes: notes || null,
  });
}

export function getSale(id) {
  return rpc('get_sale', { p_sale_id: id });
}

export async function listSales({ pharmacyId, branchId, from, to, status, paymentMethod, search, page = 1, pageSize = 25 }) {
  let q = supabase.from('sales')
    .select('id, invoice_no, customer_name, customer_phone, total_amount, refunded_amount, payment_method, status, created_at, branch_id, profiles!sales_created_by_fkey(full_name)', { count: 'exact' })
    .eq('pharmacy_id', pharmacyId)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (branchId) q = q.eq('branch_id', branchId);
  if (from) q = q.gte('created_at', new Date(`${from}T00:00:00`).toISOString());
  if (to) q = q.lte('created_at', new Date(`${to}T23:59:59`).toISOString());
  if (status) q = q.eq('status', status);
  if (paymentMethod) q = q.eq('payment_method', paymentMethod);
  if (search) {
    const s = search.replace(/[%,()]/g, ' ').trim();
    q = q.or(`invoice_no.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
  }
  const { data, count } = unwrap(await q);
  return { rows: data, total: count ?? 0 };
}

export function processReturn({ saleId, items, reason, refundMethod, notes }) {
  return rpc('process_return', {
    p_sale_id: saleId, p_items: items, p_reason: reason, p_refund_method: refundMethod, p_notes: notes || null,
  });
}

export function cancelSale(saleId, reason) {
  return rpc('cancel_sale', { p_sale_id: saleId, p_reason: reason });
}

export { previewTotals } from '../lib/pricing';
