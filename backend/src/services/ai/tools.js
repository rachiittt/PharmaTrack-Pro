'use strict';

const { z } = require('zod');

/**
 * Read-only tools the assistant may call. Each one runs a database RPC with
 * the *caller's* Supabase client, so Row Level Security and role checks scope
 * every answer to the signed-in user's pharmacy. No tool exposes customer,
 * prescription or staff data, and no tool can change stock, prices or bills.
 */

const pick = (rows, keys, limit = 25) =>
  (rows || []).slice(0, limit).map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));

async function rpc(db, fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

const definitions = [
  {
    name: 'get_stock_alerts',
    description:
      'Expired batches, batches expiring soon, low-stock and out-of-stock products, slow-moving and dead stock for the pharmacy, using the pharmacy\'s own alert thresholds.',
    schema: z.object({}).strict(),
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    async run(db, ctx) {
      const a = await rpc(db, 'stock_alerts', { p_pharmacy_id: ctx.pharmacyId, p_branch_id: ctx.branchId });
      const batchKeys = ['name', 'batch_no', 'expiry_date', 'days_left', 'quantity', 'value_at_cost'];
      const productKeys = ['name', 'sellable_qty', 'min_stock_level', 'supplier_name', 'last_sold_at', 'value_at_cost'];
      return {
        thresholds: a.thresholds,
        expired: pick(a.expired, batchKeys),
        expiring_critical: pick(a.expiring_critical, batchKeys),
        expiring_warning: pick(a.expiring_warning, batchKeys),
        low_stock: pick(a.low_stock, productKeys),
        out_of_stock: pick(a.out_of_stock, productKeys),
        slow_moving: pick(a.slow_moving, productKeys),
        dead_stock: pick(a.dead_stock, productKeys),
      };
    },
  },
  {
    name: 'get_reorder_suggestions',
    description:
      'Suggested purchase quantities per product from recent sales velocity: average daily units × (lead time + cover days) minus current sellable stock.',
    schema: z.object({
      cover_days: z.number().int().min(7).max(120),
      lead_time_days: z.number().int().min(0).max(60),
    }).strict(),
    input_schema: {
      type: 'object',
      properties: {
        cover_days: { type: 'integer', description: 'Days of demand the order should cover (7–120). Use 30 if unsure.' },
        lead_time_days: { type: 'integer', description: 'Supplier delivery time in days (0–60). Use 5 if unsure.' },
      },
      required: ['cover_days', 'lead_time_days'],
      additionalProperties: false,
    },
    async run(db, ctx, input) {
      const rows = await rpc(db, 'reorder_suggestions', {
        p_pharmacy_id: ctx.pharmacyId, p_branch_id: ctx.branchId, p_lookback_days: 60,
        p_cover_days: input.cover_days, p_lead_time_days: input.lead_time_days,
      });
      return pick(rows, ['name', 'supplier_name', 'sellable_qty', 'avg_daily_units', 'days_of_cover', 'suggested_qty'], 40);
    },
  },
  {
    name: 'get_expiry_risk',
    description:
      'Batches likely to expire before they sell, estimated from the last 60 days of sales. Returns units and purchase value at risk.',
    schema: z.object({ horizon_days: z.number().int().min(14).max(730) }).strict(),
    input_schema: {
      type: 'object',
      properties: { horizon_days: { type: 'integer', description: 'Look this many days ahead (14–730). Use 180 if unsure.' } },
      required: ['horizon_days'],
      additionalProperties: false,
    },
    async run(db, ctx, input) {
      const rows = await rpc(db, 'expiry_risk', {
        p_pharmacy_id: ctx.pharmacyId, p_branch_id: ctx.branchId, p_horizon_days: input.horizon_days,
      });
      return pick(rows, ['name', 'batch_no', 'expiry_date', 'days_left', 'quantity', 'avg_daily_units', 'units_at_risk', 'value_at_risk'], 40);
    },
  },
  {
    name: 'get_sales_summary',
    description:
      'Revenue, bill count, gross profit, top products, payment mix and daily trend for a recent period, plus current stock value and payables. Amounts are in INR.',
    schema: z.object({ days: z.number().int().min(7).max(365) }).strict(),
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'Length of the period in days (7–365).' } },
      required: ['days'],
      additionalProperties: false,
    },
    async run(db, ctx, input) {
      const d = await rpc(db, 'dashboard_summary', { p_pharmacy_id: ctx.pharmacyId, p_branch_id: ctx.branchId, p_days: input.days });
      // recent_sales carries customer names; it is deliberately not forwarded.
      const { recent_sales: _omit, ...rest } = d;
      return rest;
    },
  },
  {
    name: 'search_inventory',
    description: 'Look up products by name, generic name, composition or manufacturer, optionally filtered by stock status.',
    schema: z.object({
      query: z.string().max(80),
      status: z.enum(['all', 'low', 'out', 'expiring', 'expired']),
    }).strict(),
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text; empty string for all products.' },
        status: { type: 'string', enum: ['all', 'low', 'out', 'expiring', 'expired'] },
      },
      required: ['query', 'status'],
      additionalProperties: false,
    },
    async run(db, ctx, input) {
      const r = await rpc(db, 'inventory_list', {
        p_pharmacy_id: ctx.pharmacyId, p_branch_id: ctx.branchId, p_search: input.query || null,
        p_category: null, p_status: input.status, p_limit: 30, p_offset: 0,
      });
      return {
        total: r.total,
        products: pick(r.rows, ['name', 'generic_name', 'category', 'sellable_qty', 'min_stock_level', 'next_expiry', 'stock_status', 'current_price', 'rack_location'], 30),
      };
    },
  },
];

const byName = new Map(definitions.map((d) => [d.name, d]));

function anthropicTools() {
  return definitions.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.input_schema,
    strict: true,
  }));
}

/** Validate and run one tool call. Never throws: errors become tool results. */
async function runTool(db, ctx, name, rawInput) {
  const def = byName.get(name);
  if (!def) return { isError: true, content: `Unknown tool "${name}"` };
  const parsed = def.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { isError: true, content: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}` };
  }
  try {
    const result = await def.run(db, ctx, parsed.data);
    return { isError: false, content: JSON.stringify(result) };
  } catch (err) {
    return { isError: true, content: `Data lookup failed: ${err.message}` };
  }
}

module.exports = { anthropicTools, runTool, toolNames: [...byName.keys()] };
