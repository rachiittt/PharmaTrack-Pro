'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireMember } = require('../middleware/auth');
const { HttpError, unwrap } = require('../lib/errors');
const { askAssistant } = require('../services/ai/assistant');
const { extractInvoice, buildDraft, MEDIA_TYPES } = require('../services/ai/invoiceExtraction');

const askSchema = z.object({
  question: z.string().trim().min(3).max(500),
  branch_id: z.string().uuid().nullable().optional(),
});

const invoiceSchema = z.object({
  file_path: z.string().min(5).max(300),
});

const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

/**
 * AI endpoints. The Anthropic key never leaves the server, every data lookup
 * runs with the caller's RLS-scoped client, outputs are suggestions only, and
 * usage metadata (never prompt content) is logged per pharmacy for quotas.
 */
function aiRouter({ supabase, config, anthropic }) {
  const router = Router({ mergeParams: true });
  const staff = requireMember('owner', 'manager', 'pharmacist');

  async function enforceQuota(pharmacyId) {
    if (!supabase.admin) return; // metering needs the service-role key
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count, error } = await supabase.admin
      .from('ai_requests').select('id', { count: 'exact', head: true })
      .eq('pharmacy_id', pharmacyId).gte('created_at', since);
    if (error) throw new HttpError(502, 'DATABASE_ERROR', 'Could not check AI usage');
    if (count >= config.AI_DAILY_LIMIT_PER_PHARMACY) {
      throw new HttpError(429, 'AI_QUOTA', 'Daily assistant limit reached for this pharmacy. Try again tomorrow.');
    }
  }

  async function logUsage(req, feature, status, usage) {
    await supabase.admin.from('ai_requests').insert({
      pharmacy_id: req.membership.pharmacyId, user_id: req.user.id, feature, status,
      input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null,
    });
  }

  function requireConfigured() {
    if (!anthropic) {
      throw new HttpError(503, 'AI_NOT_CONFIGURED', 'The assistant is not configured on this server (ANTHROPIC_API_KEY is missing).');
    }
  }

  router.get('/status', staff, (_req, res) => {
    res.json({ configured: Boolean(anthropic), model: anthropic ? config.AI_MODEL : null });
  });

  router.post('/ask', staff, validate(askSchema), async (req, res, next) => {
    try {
      requireConfigured();
      const { pharmacyId, branchId } = req.membership;
      await enforceQuota(pharmacyId);
      const result = await askAssistant({
        client: anthropic, model: config.AI_MODEL, db: req.db,
        ctx: { pharmacyId, branchId: branchId ?? req.validatedBody.branch_id ?? null },
        question: req.validatedBody.question,
      });
      await logUsage(req, 'assistant', result.status, result.usage);
      res.json({ answer: result.answer, tools_used: [...new Set(result.toolsUsed)], truncated: Boolean(result.truncated) });
    } catch (err) {
      if (req.membership && !(err instanceof HttpError)) await logUsage(req, 'assistant', 'error').catch(() => {});
      next(err);
    }
  });

  router.post('/invoice-extract', staff, validate(invoiceSchema), async (req, res, next) => {
    try {
      requireConfigured();
      const { pharmacyId } = req.membership;
      const { file_path } = req.validatedBody;
      if (!file_path.startsWith(`${pharmacyId}/`) || file_path.includes('..')) {
        throw new HttpError(403, 'FORBIDDEN', 'File does not belong to this pharmacy');
      }
      const extension = file_path.split('.').pop().toLowerCase();
      if (!MEDIA_TYPES[extension]) throw new HttpError(400, 'INVALID_INPUT', 'Upload a PDF, PNG, JPG or WEBP invoice');
      await enforceQuota(pharmacyId);

      // Download with the caller's client so storage RLS decides access.
      const { data: blob, error } = await req.db.storage.from('purchase-invoices').download(file_path);
      if (error || !blob) throw new HttpError(404, 'NOT_FOUND', 'Invoice file not found');
      const buffer = Buffer.from(await blob.arrayBuffer());
      if (buffer.length > MAX_INVOICE_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Invoice files must be under 10 MB');

      const { extraction, usage } = await extractInvoice({ client: anthropic, model: config.AI_MODEL, fileBuffer: buffer, extension });
      const products = unwrap(await req.db.from('products').select('id, name').eq('pharmacy_id', pharmacyId).eq('is_archived', false));
      await logUsage(req, 'invoice_ocr', 'ok', usage);
      res.json(buildDraft(extraction, products));
    } catch (err) {
      if (req.membership && !(err instanceof HttpError)) await logUsage(req, 'invoice_ocr', 'error').catch(() => {});
      if (!(err instanceof HttpError) && err?.message) {
        return next(new HttpError(502, 'AI_FAILED', err.message.slice(0, 200)));
      }
      next(err);
    }
  });

  return router;
}

module.exports = { aiRouter };
