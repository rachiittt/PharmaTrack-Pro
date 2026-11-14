import { supabase, unwrap, rpc } from '../lib/supabase';

export async function listSuppliers(pharmacyId, { activeOnly = false } = {}) {
  let q = supabase.from('suppliers').select('*').eq('pharmacy_id', pharmacyId).order('name');
  if (activeOnly) q = q.eq('is_active', true);
  return unwrap(await q);
}

export function supplierSummary(pharmacyId) {
  return rpc('supplier_summary', { p_pharmacy_id: pharmacyId });
}

const FIELDS = ['name', 'contact_person', 'phone', 'email', 'gstin', 'drug_license_no', 'address', 'payment_terms_days', 'notes', 'is_active'];

function clean(input) {
  const out = {};
  for (const k of FIELDS) {
    if (!(k in input)) continue;
    const v = input[k];
    out[k] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  }
  if (out.gstin) out.gstin = out.gstin.toUpperCase();
  if (out.payment_terms_days != null) out.payment_terms_days = Number(out.payment_terms_days);
  return out;
}

export async function createSupplier(pharmacyId, input) {
  return unwrap(await supabase.from('suppliers').insert({ pharmacy_id: pharmacyId, ...clean(input) }).select().single());
}

export async function updateSupplier(id, input) {
  return unwrap(await supabase.from('suppliers').update(clean(input)).eq('id', id).select().single());
}
