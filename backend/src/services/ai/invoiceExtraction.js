'use strict';

const { z } = require('zod');

/**
 * Supplier-invoice OCR. Produces a *draft* for the purchase form only; the
 * user reviews every line before anything is saved through receive_purchase.
 */

const nullable = (type) => ({ type: [type, 'null'] });

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    supplier_name: nullable('string'),
    supplier_gstin: nullable('string'),
    invoice_no: nullable('string'),
    invoice_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product_name: { type: 'string' },
          batch_no: nullable('string'),
          expiry: { type: ['string', 'null'], description: 'As printed, e.g. 08/27 or 2027-08' },
          quantity: nullable('number'),
          free_quantity: nullable('number'),
          purchase_price: { type: ['number', 'null'], description: 'Rate per unit before tax' },
          mrp: nullable('number'),
          gst_rate: nullable('number'),
        },
        required: ['product_name', 'batch_no', 'expiry', 'quantity', 'free_quantity', 'purchase_price', 'mrp', 'gst_rate'],
        additionalProperties: false,
      },
    },
  },
  required: ['supplier_name', 'supplier_gstin', 'invoice_no', 'invoice_date', 'lines'],
  additionalProperties: false,
};

const lineSchema = z.object({
  product_name: z.string().trim().min(1).max(200),
  batch_no: z.string().trim().max(40).nullable(),
  expiry: z.string().trim().max(20).nullable(),
  quantity: z.number().nonnegative().max(100000).nullable(),
  free_quantity: z.number().nonnegative().max(100000).nullable(),
  purchase_price: z.number().nonnegative().max(1000000).nullable(),
  mrp: z.number().nonnegative().max(1000000).nullable(),
  gst_rate: z.number().nonnegative().max(28).nullable(),
});

const extractionSchema = z.object({
  supplier_name: z.string().trim().max(200).nullable(),
  supplier_gstin: z.string().trim().max(20).nullable(),
  invoice_no: z.string().trim().max(60).nullable(),
  invoice_date: z.string().trim().max(20).nullable(),
  lines: z.array(lineSchema).max(300),
});

/** "08/27", "8/2027", "2027-08", "2027-08-31", "AUG-27" → last day of month (YYYY-MM-DD) */
function normalizeExpiry(raw) {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  const months = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  let year; let month; let day = null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, year, month, day] = m.map(Number);
  else if ((m = s.match(/^(\d{4})[-/](\d{1,2})$/))) [, year, month] = m.map(Number);
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{2}|\d{4})$/))) { month = Number(m[1]); year = Number(m[2]); }
  else if ((m = s.match(/^([A-Z]{3})[-/ ]?(\d{2}|\d{4})$/)) && months[m[1]]) { month = months[m[1]]; year = Number(m[2]); }
  else return null;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = day && day >= 1 && day <= last ? day : last;
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return s;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/** Turn validated model output into form-ready draft lines with review warnings. */
function buildDraft(extraction, products, today = new Date()) {
  const todayIso = today.toISOString().slice(0, 10);
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const catalogue = products.map((p) => ({ ...p, key: norm(p.name) }));

  const lines = extraction.lines.map((line) => {
    const warnings = [];
    const key = norm(line.product_name);
    const first = key.split(' ')[0];
    const match = catalogue.find((p) => p.key === key)
      ?? catalogue.find((p) => p.key.startsWith(key) || key.startsWith(p.key))
      ?? catalogue.find((p) => first.length >= 4 && p.key.split(' ')[0] === first);
    const expiry_date = normalizeExpiry(line.expiry);

    if (!match) warnings.push('No matching product in your catalogue — create it or pick one');
    if (!line.batch_no) warnings.push('Batch number missing');
    if (!expiry_date) warnings.push('Expiry date unreadable');
    else if (expiry_date <= todayIso) warnings.push('Already expired — do not receive');
    if (!line.quantity) warnings.push('Quantity missing');
    if (line.mrp != null && line.purchase_price != null && line.purchase_price > line.mrp) warnings.push('Rate is higher than MRP');

    return {
      product_name: line.product_name,
      product_id: match?.id ?? null,
      matched_name: match?.name ?? null,
      batch_no: line.batch_no,
      expiry_date,
      quantity: line.quantity != null ? Math.round(line.quantity) : null,
      free_quantity: line.free_quantity != null ? Math.round(line.free_quantity) : 0,
      purchase_price: line.purchase_price,
      mrp: line.mrp,
      gst_rate: [0, 5, 12, 18, 28].includes(line.gst_rate) ? line.gst_rate : null,
      warnings,
    };
  });

  return {
    supplier_name: extraction.supplier_name,
    supplier_gstin: extraction.supplier_gstin,
    invoice_no: extraction.invoice_no,
    invoice_date: normalizeDate(extraction.invoice_date),
    lines,
    requires_review: true,
  };
}

const MEDIA_TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

async function extractInvoice({ client, model, fileBuffer, extension }) {
  const mediaType = MEDIA_TYPES[extension];
  if (!mediaType) throw new Error('Unsupported file type');
  const data = fileBuffer.toString('base64');
  const source = { type: 'base64', media_type: mediaType, data };
  const block = mediaType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        block,
        {
          type: 'text',
          text: 'This is a supplier purchase invoice for a pharmacy. Transcribe the header and every medicine line exactly as printed. '
            + 'Use null for anything not printed or unreadable — do not guess. Quantity is billed units; free/scheme units go in free_quantity. '
            + 'purchase_price is the per-unit rate before GST.',
        },
      ],
    }],
  });

  if (response.stop_reason === 'refusal') throw new Error('The invoice could not be processed');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('No data was extracted from the invoice');
  const parsed = extractionSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('The extracted data was incomplete. Enter the invoice manually.');
  return { extraction: parsed.data, usage: response.usage };
}

module.exports = { extractInvoice, buildDraft, normalizeExpiry, normalizeDate, OUTPUT_SCHEMA, MEDIA_TYPES };
