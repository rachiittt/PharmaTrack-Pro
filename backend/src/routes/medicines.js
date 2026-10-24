const { Router } = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const medicineQueries = require('../db/queries/medicines');

const router = Router();
router.use(requireAuth);

const medicineSchema = z.object({
  name: z.string().min(1), generic_name: z.string().optional(),
  manufacturer: z.string().optional(), batch_no: z.string().min(1),
  category: z.enum(['Tablet', 'Capsule', 'Syrup', 'Injection', 'Topical', 'Other']),
  quantity: z.number().int().min(0), min_stock_level: z.number().int().default(10),
  unit: z.string().default('strips'), cost_price: z.number().min(0),
  selling_price: z.number().min(0), mrp: z.number().optional(),
  expiry_date: z.string(), barcode: z.string().optional(),
  hsn_code: z.string().optional(), supplier_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
});

// GET /api/medicines
router.get('/', async (req, res, next) => {
  try {
    const result = await medicineQueries.listMedicines(req.user.id, req.query);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/medicines/barcode/:code (POS lookup)
router.get('/barcode/:code', async (req, res, next) => {
  try {
    const med = await medicineQueries.findByBarcode(req.user.id, req.params.code);
    res.json(med || { source: 'none', barcode: req.params.code });
  } catch (err) { next(err); }
});

// GET /api/medicines/lookup-barcode/:code (Add medicine flow)
router.get('/lookup-barcode/:code', async (req, res, next) => {
  try {
    const local = await medicineQueries.lookupBarcode(req.params.code);
    if (local) {
      return res.json({ source: 'local', ...local, last_cost_price: local.cost_price, last_selling_price: local.selling_price });
    }
    res.json({ source: 'none', barcode: req.params.code });
  } catch (err) { next(err); }
});

// POST /api/medicines (create single)
router.post('/', validate(medicineSchema), async (req, res, next) => {
  try {
    const med = await medicineQueries.createMedicine(req.user.id, req.validatedBody);
    res.status(201).json(med);
  } catch (err) { next(err); }
});

// POST /api/medicines/bulk-import — MUST be before /:id to avoid wildcard collision
router.post('/bulk-import', async (req, res, next) => {
  try {
    const { medicines } = req.body;
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ error: 'No medicines provided', code: 'VALIDATION_ERROR' });
    }
    if (medicines.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 medicines per import', code: 'LIMIT_EXCEEDED' });
    }
    const result = await medicineQueries.bulkImport(req.user.id, medicines);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/medicines/:id
router.get('/:id', async (req, res, next) => {
  try {
    const med = await medicineQueries.getMedicineById(req.user.id, req.params.id);
    res.json(med);
  } catch (err) { next(err); }
});

// PUT /api/medicines/:id
router.put('/:id', async (req, res, next) => {
  try {
    const med = await medicineQueries.updateMedicine(req.user.id, req.params.id, req.body);
    res.json(med);
  } catch (err) { next(err); }
});

// DELETE /api/medicines/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    await medicineQueries.archiveMedicine(req.user.id, req.params.id);
    res.json({ message: 'Medicine archived' });
  } catch (err) { next(err); }
});

module.exports = router;
