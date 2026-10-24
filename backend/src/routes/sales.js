const { Router } = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const salesQueries = require('../db/queries/sales');
const { z } = require('zod');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(requireAuth);

const saleSchema = z.object({
  invoice_no: z.string().min(1),
  subtotal: z.number().min(0),
  tax_amount: z.number().default(0),
  total_amount: z.number().min(0),
  discount_pct: z.number().default(0),
  payment_method: z.enum(['cash', 'upi', 'card']).default('cash'),
  customer_id: z.string().uuid().optional(),
  prescription_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    medicine_id: z.string().uuid(),
    quantity: z.number().int().min(1),
    unit_price: z.number().min(0),
  })).min(1),
});

router.post('/', validate(saleSchema), async (req, res, next) => {
  try {
    const { items, ...saleData } = req.validatedBody;
    const sale = await salesQueries.createSale(req.user.id, saleData, items);
    res.status(201).json(sale);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try { res.json(await salesQueries.listSales(req.user.id, req.query)); }
  catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await salesQueries.getSaleById(req.user.id, req.params.id)); }
  catch (err) { next(err); }
});

router.get('/:id/receipt', async (req, res, next) => {
  try { res.json(await salesQueries.getReceipt(req.user.id, req.params.id)); }
  catch (err) { next(err); }
});

module.exports = router;
