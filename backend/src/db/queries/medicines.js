const { supabaseAdmin } = require('../supabase');

// ============================================
// Expiry status CASE expression (reusable)
// ============================================
const EXPIRY_STATUS_SELECT = `
  *,
  CASE
    WHEN expiry_date < CURRENT_DATE THEN 'expired'
    WHEN expiry_date <= CURRENT_DATE + INTERVAL '10 days' THEN 'critical'
    WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'warning'
    WHEN expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'upcoming'
    ELSE 'healthy'
  END AS expiry_status,
  (expiry_date - CURRENT_DATE) AS days_until_expiry
`;

/**
 * List medicines with expiry status, pagination, filters
 */
async function listMedicines(userId, { search, category, status, supplier_id, low_stock, page = 1, limit = 20 }) {
  let query = supabaseAdmin
    .from('medicines')
    .select('*, suppliers(name, phone, whatsapp_number)', { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('expiry_date', { ascending: true });

  if (search) {
    query = query.or(`name.ilike.%${search}%,generic_name.ilike.%${search}%,batch_no.ilike.%${search}%,barcode.ilike.%${search}%`);
  }
  if (category) query = query.eq('category', category);
  if (supplier_id) query = query.eq('supplier_id', supplier_id);

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  // Compute expiry status in JS (Supabase doesn't support CASE in select)
  const now = new Date();
  const enriched = (data || []).map(med => {
    const expiryDate = new Date(med.expiry_date);
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let expiry_status;
    if (diffDays < 0) expiry_status = 'expired';
    else if (diffDays <= 10) expiry_status = 'critical';
    else if (diffDays <= 30) expiry_status = 'warning';
    else if (diffDays <= 60) expiry_status = 'upcoming';
    else expiry_status = 'healthy';

    const is_low_stock = med.quantity <= med.min_stock_level;

    return { ...med, expiry_status, days_until_expiry: diffDays, is_low_stock };
  });

  // Apply post-query filters
  let filtered = enriched;
  if (status && status !== 'all') {
    filtered = filtered.filter(m => m.expiry_status === status);
  }
  if (low_stock === 'true' || low_stock === true) {
    filtered = filtered.filter(m => m.is_low_stock);
  }

  return { data: filtered, total: count, page, limit };
}

/**
 * Get single medicine by ID
 */
async function getMedicineById(userId, id) {
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .select('*, suppliers(name, phone, whatsapp_number, email)')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a single medicine
 */
async function createMedicine(userId, medicineData) {
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .insert({ ...medicineData, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a medicine
 */
async function updateMedicine(userId, id, updates) {
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Soft delete (archive) a medicine
 */
async function archiveMedicine(userId, id) {
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Lookup medicine by barcode (for POS)
 */
async function findByBarcode(userId, barcode) {
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .select('*, suppliers(name)')
    .eq('user_id', userId)
    .eq('barcode', barcode)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Lookup barcode across all users (for add medicine flow)
 */
async function lookupBarcode(barcode) {
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .select('name, generic_name, manufacturer, category, mrp, hsn_code, cost_price, selling_price, barcode')
    .eq('barcode', barcode)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Bulk import medicines — uses a single batch insert for efficiency.
 * Falls back to row-by-row on conflict errors so valid rows still succeed.
 */
async function bulkImport(userId, medicines) {
  const rows = medicines.map((m, i) => ({ ...m, user_id: userId, _rowIndex: i }));
  const results = { imported: 0, skipped: 0, errors: [] };

  // Attempt batch insert first (single round trip)
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .insert(rows.map(({ _rowIndex, ...m }) => m))
    .select();

  if (!error) {
    results.imported = data?.length || rows.length;
    return results;
  }

  // If batch fails (e.g., duplicate batch_no), fall back to row-by-row
  for (let i = 0; i < rows.length; i++) {
    const { _rowIndex, ...row } = rows[i];
    const { error: rowError } = await supabaseAdmin
      .from('medicines')
      .insert(row)
      .select()
      .single();

    if (rowError) {
      results.skipped++;
      results.errors.push({ row: i + 1, field: 'general', message: rowError.message });
    } else {
      results.imported++;
    }
  }

  return results;
}

/**
 * Get expiry alert summary counts
 */
async function getAlertSummary(userId) {
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .select('expiry_date, quantity, min_stock_level')
    .eq('user_id', userId)
    .eq('is_archived', false);

  if (error) throw error;

  const now = new Date();
  const summary = { expired: 0, critical: 0, warning: 0, upcoming: 0, low_stock: 0 };

  (data || []).forEach(med => {
    const expiryDate = new Date(med.expiry_date);
    const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) summary.expired++;
    else if (diffDays <= 10) summary.critical++;
    else if (diffDays <= 30) summary.warning++;
    else if (diffDays <= 60) summary.upcoming++;

    if (med.quantity <= med.min_stock_level) summary.low_stock++;
  });

  return summary;
}

/**
 * Increment quantity for existing medicine (restock)
 */
async function incrementQuantity(userId, id, additionalQty) {
  const existing = await getMedicineById(userId, id);
  if (!existing) throw new Error('Medicine not found');
  
  const { data, error } = await supabaseAdmin
    .from('medicines')
    .update({ 
      quantity: existing.quantity + additionalQty,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  listMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  archiveMedicine,
  findByBarcode,
  lookupBarcode,
  bulkImport,
  getAlertSummary,
  incrementQuantity,
};
