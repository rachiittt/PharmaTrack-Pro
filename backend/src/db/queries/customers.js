const { supabaseAdmin } = require('../supabase');

async function listCustomers(userId, { search, page = 1, limit = 20 }) {
  let query = supabaseAdmin
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count, page, limit };
}

async function getCustomerById(userId, id) {
  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  // Get purchase history
  const { data: purchases } = await supabaseAdmin
    .from('sales')
    .select('id, invoice_no, total_amount, payment_method, created_at, sale_items(quantity, medicines(name))')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Get prescriptions
  const { data: prescriptions } = await supabaseAdmin
    .from('prescriptions')
    .select('*')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  return { ...customer, purchases: purchases || [], prescriptions: prescriptions || [] };
}

async function createCustomer(userId, customerData) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({ ...customerData, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateCustomer(userId, id, updates) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = { listCustomers, getCustomerById, createCustomer, updateCustomer };
