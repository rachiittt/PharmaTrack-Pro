const { Router } = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const analyticsQueries = require('../db/queries/analytics');

const router = Router();
router.use(requireAuth);

router.get('/dashboard', async (req, res, next) => {
  try { res.json(await analyticsQueries.getDashboardKPIs(req.user.id)); }
  catch (err) { next(err); }
});

router.get('/top-sellers', async (req, res, next) => {
  try { res.json(await analyticsQueries.getTopSellers(req.user.id, parseInt(req.query.days) || 30)); }
  catch (err) { next(err); }
});

router.get('/sales-trend', async (req, res, next) => {
  try { res.json(await analyticsQueries.getSalesTrend(req.user.id, parseInt(req.query.days) || 30)); }
  catch (err) { next(err); }
});

router.get('/category-breakdown', async (req, res, next) => {
  try { res.json(await analyticsQueries.getCategoryBreakdown(req.user.id)); }
  catch (err) { next(err); }
});

router.get('/payment-methods', async (req, res, next) => {
  try { res.json(await analyticsQueries.getPaymentMethods(req.user.id)); }
  catch (err) { next(err); }
});

module.exports = router;
