const { supabaseAdmin } = require('../supabase');

/**
 * Create a sale with items in a transaction-like flow.
 * Deducts inventory for each sold item.
 */
async function createSale(userId, saleData, items) {
  // 1. Insert the sale record
  const { data: sale, error: saleError } = await supabaseAdmin
    .from('sales')
    .insert({
      user_id: userId,
      branch_id: saleData.branch_id || null,
      customer_id: saleData.customer_id || null,
      prescription_id: saleData.prescription_id || null,
      invoice_no: saleData.invoice_no,
      discount_pct: saleData.discount_pct || 0,
      subtotal: saleData.subtotal,
      tax_amount: saleData.tax_amount || 0,
      total_amount: saleData.total_amount,
      payment_method: saleData.payment_method || 'cash',
      notes: saleData.notes || null,
      created_by: userId,
    })
    .select()
    .single();

  if (saleError) throw saleError;

  // 2. Insert sale items & deduct inventory
  for (const item of items) {
    // Insert sale item
    const { error: itemError } = await supabaseAdmin
      .from('sale_items')
      .insert({
        sale_id: sale.id,
        medicine_id: item.medicine_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.quantity * item.unit_price,
      });

    if (itemError) throw itemError;

    // Deduct from inventory
    const { data: med } = await supabaseAdmin
      .from('medicines')
      .select('quantity')
      .eq('id', item.medicine_id)
      .single();

    if (med) {
      const newQty = Math.max(0, med.quantity - item.quantity);
      await supabaseAdmin
        .from('medicines')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', item.medicine_id);
    }
  }

  // 3. Update customer total_spent and loyalty points if customer linked
  if (saleData.customer_id) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('total_spent, loyalty_points')
      .eq('id', saleData.customer_id)
      .single();

    if (customer) {
      const loyaltyEarned = Math.floor(saleData.total_amount / 10); // 1 point per ₹10
      await supabaseAdmin
        .from('customers')
        .update({
          total_spent: parseFloat(customer.total_spent) + parseFloat(saleData.total_amount),
          loyalty_points: customer.loyalty_points + loyaltyEarned,
        })
        .eq('id', saleData.customer_id);
    }
  }

  // 4. If prescription linked, mark as fulfilled
  if (saleData.prescription_id) {
    await supabaseAdmin
      .from('prescriptions')
      .update({ is_fulfilled: true })
      .eq('id', saleData.prescription_id);
  }

  return sale;
}

/**
 * List sales with pagination
 */
async function listSales(userId, { from, to, payment_method, page = 1, limit = 20 }) {
  let query = supabaseAdmin
    .from('sales')
    .select('*, customers(name, phone), sale_items(*, medicines(name))', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  if (payment_method) query = query.eq('payment_method', payment_method);

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count, page, limit };
}

/**
 * Get single sale with all items
 */
async function getSaleById(userId, id) {
  const { data, error } = await supabaseAdmin
    .from('sales')
    .select('*, customers(name, phone, email), sale_items(*, medicines(name, generic_name, batch_no, category))')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get receipt data for a sale
 */
async function getReceipt(userId, id) {
  const sale = await getSaleById(userId, id);
  if (!sale) throw new Error('Sale not found');

  // Get pharmacy info
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('pharmacy_name, phone, gst_number, logo_url')
    .eq('id', userId)
    .single();

  return { sale, pharmacy: user };
}

module.exports = {
  createSale,
  listSales,
  getSaleById,
  getReceipt,
};
