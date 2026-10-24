const { Router } = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const { supabaseAdmin } = require('../db/supabase');

const router = Router();
router.use(requireAuth);

const supplierSchema = z.object({
  name: z.string().min(1), contact_person: z.string().optional(),
  phone: z.string().optional(), email: z.string().email().optional(),
  address: z.string().optional(), gst_number: z.string().optional(),
  whatsapp_number: z.string().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('suppliers').select('*')
      .eq('user_id', req.user.id).order('name');
    if (error) throw error;

    // Get medicine counts for all suppliers in parallel (avoid N+1)
    const counts = await Promise.all(
      data.map(s =>
        supabaseAdmin
          .from('medicines')
          .select('id', { count: 'exact', head: true })
          .eq('supplier_id', s.id)
          .eq('is_archived', false)
          .then(({ count }) => ({ id: s.id, count: count || 0 }))
      )
    );
    const countMap = Object.fromEntries(counts.map(c => [c.id, c.count]));
    const enriched = data.map(s => ({ ...s, medicines_count: countMap[s.id] || 0 }));

    res.json(enriched);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('suppliers').select('*')
      .eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error) throw error;
    const { data: meds } = await supabaseAdmin.from('medicines').select('id, name, quantity, expiry_date')
      .eq('supplier_id', req.params.id).eq('is_archived', false);
    res.json({ ...data, medicines: meds || [] });
  } catch (err) { next(err); }
});

router.post('/', validate(supplierSchema), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('suppliers')
      .insert({ ...req.validatedBody, user_id: req.user.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('suppliers')
      .update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { count } = await supabaseAdmin.from('medicines').select('id', { count: 'exact', head: true })
      .eq('supplier_id', req.params.id).eq('is_archived', false);
    if (count > 0) {
      return res.status(400).json({ error: `Cannot delete: ${count} medicines linked`, code: 'HAS_DEPENDENCIES' });
    }
    await supabaseAdmin.from('suppliers').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ message: 'Supplier deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
