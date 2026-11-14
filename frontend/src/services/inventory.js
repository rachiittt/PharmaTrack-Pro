import { supabase, unwrap, rpc } from '../lib/supabase';

export const CATEGORIES = [
  'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Drops', 'Ointment', 'Cream', 'Gel',
  'Inhaler', 'Powder', 'Device', 'Surgical', 'Supplement', 'Personal Care', 'Other',
];
export const SCHEDULES = [
  { value: 'OTC', label: 'OTC — no prescription' },
  { value: 'G', label: 'Schedule G' },
  { value: 'H', label: 'Schedule H — prescription' },
  { value: 'H1', label: 'Schedule H1 — prescription + register' },
  { value: 'X', label: 'Schedule X — narcotic/psychotropic' },
];
export const PRESCRIPTION_SCHEDULES = ['H', 'H1', 'X'];
export const GST_RATES = [0, 5, 12, 18, 28];
export const ADJUSTMENT_TYPES = [
  { value: 'adjustment', label: 'Count correction' },
  { value: 'damage', label: 'Damaged / broken' },
  { value: 'expired_writeoff', label: 'Expired write-off' },
];

export function listInventory({ pharmacyId, branchId = null, search = '', category = null, status = 'all', limit = 50, offset = 0 }) {
  return rpc('inventory_list', {
    p_pharmacy_id: pharmacyId, p_branch_id: branchId, p_search: search || null,
    p_category: category || null, p_status: status, p_limit: limit, p_offset: offset,
  });
}

export async function getProduct(id) {
  return unwrap(await supabase.from('products').select('*, suppliers(id, name)').eq('id', id).single());
}

export async function listBatches(productId) {
  return unwrap(await supabase
    .from('medicine_batches')
    .select('*, branches(name), suppliers(name)')
    .eq('product_id', productId)
    .order('expiry_date'));
}

export async function listMovements(productId, limit = 50) {
  return unwrap(await supabase
    .from('stock_movements')
    .select('id, movement_type, quantity_change, balance_after, reason, reference_type, reference_id, created_at, medicine_batches(batch_no), profiles(full_name)')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit));
}

const PRODUCT_FIELDS = [
  'name', 'generic_name', 'composition', 'manufacturer', 'barcode', 'category', 'schedule', 'hsn_code',
  'gst_rate', 'unit', 'pack_size', 'min_stock_level', 'rack_location', 'default_supplier_id',
];

function cleanProduct(input) {
  const out = {};
  for (const key of PRODUCT_FIELDS) {
    if (!(key in input)) continue;
    const v = input[key];
    out[key] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  }
  return out;
}

export async function createProduct(pharmacyId, input) {
  return unwrap(await supabase.from('products').insert({ pharmacy_id: pharmacyId, ...cleanProduct(input) }).select().single());
}

export async function updateProduct(id, input) {
  return unwrap(await supabase.from('products').update(cleanProduct(input)).eq('id', id).select().single());
}

export async function setArchived(id, archived) {
  return unwrap(await supabase.from('products').update({ is_archived: archived }).eq('id', id).select().single());
}

export function addOpeningStock({ productId, branchId, batchNo, expiryDate, mfgDate, quantity, purchasePrice, sellingPrice, mrp, supplierId }) {
  return rpc('add_opening_stock', {
    p_product_id: productId, p_branch_id: branchId, p_batch_no: batchNo, p_expiry_date: expiryDate,
    p_quantity: Number(quantity), p_purchase_price: Number(purchasePrice), p_selling_price: Number(sellingPrice),
    p_mrp: Number(mrp), p_mfg_date: mfgDate || null, p_supplier_id: supplierId || null,
  });
}

export function adjustStock(batchId, quantityChange, type, reason) {
  return rpc('adjust_stock', { p_batch_id: batchId, p_quantity_change: Number(quantityChange), p_type: type, p_reason: reason });
}

export async function updateBatchPrices(batchId, { selling_price, mrp }) {
  return unwrap(await supabase.from('medicine_batches')
    .update({ selling_price: Number(selling_price), mrp: Number(mrp) }).eq('id', batchId).select().single());
}

export function lookupBarcode(pharmacyId, code, branchId = null) {
  return rpc('lookup_barcode', { p_pharmacy_id: pharmacyId, p_code: code, p_branch_id: branchId });
}

export function posSearch(pharmacyId, branchId, query) {
  return rpc('pos_search', { p_pharmacy_id: pharmacyId, p_branch_id: branchId, p_query: query });
}

/** Lightweight catalogue for pickers (purchase lines etc). */
export async function listProductOptions(pharmacyId, search = '') {
  let q = supabase.from('products')
    .select('id, name, generic_name, barcode, gst_rate, default_supplier_id, unit')
    .eq('pharmacy_id', pharmacyId).eq('is_archived', false).order('name').limit(25);
  if (search) q = q.or(`name.ilike.%${search.replace(/[%,()]/g, ' ')}%,barcode.eq.${search.replace(/[^0-9A-Za-z.-]/g, '')}`);
  return unwrap(await q);
}
