const { Router } = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const customerQueries = require('../db/queries/customers');
const { z } = require('zod');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(requireAuth);

const customerSchema = z.object({
  name: z.string().min(1), phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  date_of_birth: z.string().optional(),
});

router.get('/', async (req, res, next) => {
  try { res.json(await customerQueries.listCustomers(req.user.id, req.query)); }
  catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await customerQueries.getCustomerById(req.user.id, req.params.id)); }
  catch (err) { next(err); }
});

router.post('/', validate(customerSchema), async (req, res, next) => {
  try { res.status(201).json(await customerQueries.createCustomer(req.user.id, req.validatedBody)); }
  catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try { res.json(await customerQueries.updateCustomer(req.user.id, req.params.id, req.body)); }
  catch (err) { next(err); }
});

module.exports = router;
