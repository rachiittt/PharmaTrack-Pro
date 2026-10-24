const { Router } = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const returnsQueries = require('../db/queries/returns');

const router = Router();
router.use(requireAuth);

const returnSchema = z.object({
  sale_id: z.string().uuid().optional(),
  invoice_no: z.string().min(1),
  customer_id: z.string().uuid().optional(),
  return_reason: z.enum(['defective', 'wrong_medicine', 'expired', 'customer_request', 'adverse_reaction', 'other']).default('customer_request'),
  notes: z.string().optional(),
  refund_amount: z.number().min(0),
  refund_method: z.enum(['cash', 'upi', 'card', 'store_credit']).default('cash'),
  items: z.array(z.object({
    medicine_id: z.string().uuid(),
    quantity: z.number().int().min(1),
    unit_price: z.number().min(0),
    restock: z.boolean().default(true),
  })).min(1),
});

// POST /api/returns — create a return
router.post('/', validate(returnSchema), async (req, res, next) => {
  try {
    const { items, ...returnData } = req.validatedBody;
    const ret = await returnsQueries.createReturn(req.user.id, returnData, items);
    res.status(201).json(ret);
  } catch (err) { next(err); }
});

// GET /api/returns — list returns
router.get('/', async (req, res, next) => {
  try {
    res.json(await returnsQueries.listReturns(req.user.id, req.query));
  } catch (err) { next(err); }
});

// GET /api/returns/:id — get single return
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await returnsQueries.getReturnById(req.user.id, req.params.id));
  } catch (err) { next(err); }
});

module.exports = router;
