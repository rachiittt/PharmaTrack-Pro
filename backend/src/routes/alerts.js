const { Router } = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const medicineQueries = require('../db/queries/medicines');

const router = Router();
router.use(requireAuth);

// GET /api/alerts/summary
router.get('/summary', async (req, res, next) => {
  try {
    const summary = await medicineQueries.getAlertSummary(req.user.id);
    res.json(summary);
  } catch (err) { next(err); }
});

// GET /api/alerts/medicines — paginated list of alert medicines
router.get('/medicines', async (req, res, next) => {
  try {
    const result = await medicineQueries.listMedicines(req.user.id, {
      ...req.query,
      status: req.query.status || 'all',
    });
    // Filter only non-healthy
    const alertMeds = result.data.filter(m => m.expiry_status !== 'healthy');
    res.json({ data: alertMeds, total: alertMeds.length });
  } catch (err) { next(err); }
});

module.exports = router;
