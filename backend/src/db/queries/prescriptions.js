const { supabaseAdmin } = require('../supabase');

async function listPrescriptions(userId, { customer_id, is_fulfilled, page = 1, limit = 20 }) {
  let query = supabaseAdmin
    .from('prescriptions')
    .select('*, customers(name, phone), prescription_items(*)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (customer_id) query = query.eq('customer_id', customer_id);
  if (is_fulfilled !== undefined) query = query.eq('is_fulfilled', is_fulfilled === 'true');

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count, page, limit };
}

async function getPrescriptionById(userId, id) {
  const { data, error } = await supabaseAdmin
    .from('prescriptions')
    .select('*, customers(name, phone, email), prescription_items(*, medicines(name, selling_price, quantity))')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function createPrescription(userId, prescriptionData, items) {
  const { data: prescription, error } = await supabaseAdmin
    .from('prescriptions')
    .insert({ user_id: userId, ...prescriptionData })
    .select()
    .single();
  if (error) throw error;

  if (items && items.length > 0) {
    const itemRows = items.map(item => ({ prescription_id: prescription.id, ...item }));
    const { error: itemError } = await supabaseAdmin.from('prescription_items').insert(itemRows);
    if (itemError) throw itemError;
  }
  return prescription;
}

async function updatePrescription(userId, id, updates) {
  const { data, error } = await supabaseAdmin
    .from('prescriptions').update(updates).eq('id', id).eq('user_id', userId).select().single();
  if (error) throw error;
  return data;
}

module.exports = { listPrescriptions, getPrescriptionById, createPrescription, updatePrescription };
