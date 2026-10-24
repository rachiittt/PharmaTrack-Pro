const { Router } = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const prescriptionQueries = require('../db/queries/prescriptions');

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try { res.json(await prescriptionQueries.listPrescriptions(req.user.id, req.query)); }
  catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await prescriptionQueries.getPrescriptionById(req.user.id, req.params.id)); }
  catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { items, ...data } = req.body;
    res.status(201).json(await prescriptionQueries.createPrescription(req.user.id, data, items || []));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try { res.json(await prescriptionQueries.updatePrescription(req.user.id, req.params.id, req.body)); }
  catch (err) { next(err); }
});

module.exports = router;
