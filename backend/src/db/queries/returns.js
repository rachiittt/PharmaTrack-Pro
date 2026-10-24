const { supabaseAdmin } = require('../db/supabase');

/**
 * Create a return/refund record, optionally restocking items.
 */
async function createReturn(userId, returnData, items) {
  // Insert the return header
  const { data: ret, error: retErr } = await supabaseAdmin
    .from('returns')
    .insert({
      user_id: userId,
      sale_id: returnData.sale_id || null,
      invoice_no: returnData.invoice_no,
      customer_id: returnData.customer_id || null,
      return_reason: returnData.return_reason || 'customer_request',
      notes: returnData.notes || null,
      refund_amount: returnData.refund_amount,
      refund_method: returnData.refund_method || 'cash',
      status: 'completed',
      created_by: userId,
    })
    .select()
    .single();

  if (retErr) throw retErr;

  // Insert return items
  const returnItems = items.map(item => ({
    return_id: ret.id,
    medicine_id: item.medicine_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.quantity * item.unit_price,
    restock: item.restock !== false,
  }));

  const { error: itemsErr } = await supabaseAdmin
    .from('return_items')
    .insert(returnItems);

  if (itemsErr) throw itemsErr;

  // Restock items where restock = true
  for (const item of items) {
    if (item.restock !== false) {
      // Get current quantity
      const { data: med } = await supabaseAdmin
        .from('medicines')
        .select('quantity')
        .eq('id', item.medicine_id)
        .eq('user_id', userId)
        .single();

      if (med) {
        const newQty = med.quantity + item.quantity;
        await supabaseAdmin
          .from('medicines')
          .update({ quantity: newQty })
          .eq('id', item.medicine_id)
          .eq('user_id', userId);

        // Log stock adjustment
        await supabaseAdmin
          .from('stock_adjustments')
          .insert({
            user_id: userId,
            medicine_id: item.medicine_id,
            adjustment: item.quantity,
            reason: 'return',
            notes: `Return from invoice ${returnData.invoice_no}`,
            previous_qty: med.quantity,
            new_qty: newQty,
            created_by: userId,
          });
      }
    }
  }

  return ret;
}

/**
 * List returns with pagination.
 */
async function listReturns(userId, params = {}) {
  const { page = 1, limit = 20, search } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from('returns')
    .select('*, customers(name, phone)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search) {
    query = query.ilike('invoice_no', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count };
}

/**
 * Get a single return with its items.
 */
async function getReturnById(userId, returnId) {
  const { data: ret, error: retErr } = await supabaseAdmin
    .from('returns')
    .select('*, customers(name, phone)')
    .eq('id', returnId)
    .eq('user_id', userId)
    .single();

  if (retErr) throw retErr;

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('return_items')
    .select('*, medicines(name, batch_no)')
    .eq('return_id', returnId);

  if (itemsErr) throw itemsErr;

  return { ...ret, items };
}

module.exports = { createReturn, listReturns, getReturnById };
