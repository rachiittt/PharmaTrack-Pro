const { supabaseAdmin } = require('../db/supabase');

/**
 * Create a stock adjustment record and update medicine quantity.
 */
async function createAdjustment(userId, data) {
  // Get current quantity
  const { data: med, error: medErr } = await supabaseAdmin
    .from('medicines')
    .select('quantity')
    .eq('id', data.medicine_id)
    .eq('user_id', userId)
    .single();

  if (medErr) throw medErr;
  if (!med) throw new Error('Medicine not found');

  const newQty = Math.max(0, med.quantity + data.adjustment);

  // Update medicine quantity
  const { error: updateErr } = await supabaseAdmin
    .from('medicines')
    .update({ quantity: newQty })
    .eq('id', data.medicine_id)
    .eq('user_id', userId);

  if (updateErr) throw updateErr;

  // Insert adjustment log
  const { data: adj, error: adjErr } = await supabaseAdmin
    .from('stock_adjustments')
    .insert({
      user_id: userId,
      medicine_id: data.medicine_id,
      adjustment: data.adjustment,
      reason: data.reason,
      notes: data.notes || null,
      previous_qty: med.quantity,
      new_qty: newQty,
      created_by: userId,
    })
    .select()
    .single();

  if (adjErr) throw adjErr;
  return adj;
}

/**
 * List adjustments for a specific medicine or all.
 */
async function listAdjustments(userId, params = {}) {
  const { medicine_id, page = 1, limit = 20 } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from('stock_adjustments')
    .select('*, medicines(name, batch_no)', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (medicine_id) {
    query = query.eq('medicine_id', medicine_id);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count };
}

module.exports = { createAdjustment, listAdjustments };
