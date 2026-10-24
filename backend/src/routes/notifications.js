const { Router } = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { supabaseAdmin } = require('../db/supabase');

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('notifications').select('*')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.put('/:id/read', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('notifications')
      .update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/send-test', async (req, res) => {
  res.json({ message: 'Test notification sent (simulated)' });
});

module.exports = router;
