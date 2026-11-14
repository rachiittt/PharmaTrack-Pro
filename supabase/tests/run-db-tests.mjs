#!/usr/bin/env node
// End-to-end database tests for PharmaTrack Pro.
//
// Runs every migration in supabase/migrations against an in-process Postgres
// (PGlite) with a stub of Supabase's auth schema, then exercises the real
// workflows as the `authenticated` role so Row Level Security is enforced:
// onboarding, staff roles, purchases, FEFO billing, idempotency, returns,
// cancellations, adjustments, alerts, dashboard maths, demo seeding and
// cross-tenant isolation.
//
// Usage: npm run test:db

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

const db = new PGlite();
let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n      ${err.message.split('\n')[0]}`);
  }
}

/** Run queries as an authenticated API user (RLS on), in a rolled-back-on-error transaction. */
async function as(userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    await tx.exec('set local role authenticated');
    const q = async (sql, params = []) => (await tx.query(sql, params)).rows;
    const one = async (sql, params = []) => (await q(sql, params))[0];
    return fn({ q, one });
  });
}

async function asService(fn) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    const q = async (sql, params = []) => (await tx.query(sql, params)).rows;
    return fn({ q, one: async (sql, params) => (await q(sql, params))[0] });
  });
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    assert.match(err.message, pattern);
    return true;
  });
}

async function createUser(email, fullName) {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text))`,
    [id, email, fullName],
  );
  return id;
}

// ---------------------------------------------------------------------------
console.log('Applying migrations…');
await db.exec(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'));
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  // PGlite ships gen_random_uuid() in core; the extension itself is not bundled.
  const sql = readFileSync(join(migrationsDir, file), 'utf8').replace(/create extension if not exists pgcrypto;/i, '');
  try {
    await db.exec(sql);
    console.log(`  applied ${file}`);
  } catch (err) {
    console.error(`  FAILED ${file}: ${err.message}`);
    process.exit(1);
  }
}

const ownerA = await createUser('owner@a.test', 'Asha Owner');
const pharmacistA = await createUser('pharma@a.test', 'Piyush Pharmacist');
const cashierA = await createUser('cash@a.test', 'Chetan Cashier');
const ownerB = await createUser('owner@b.test', 'Bina Owner');
const platformAdmin = await createUser('admin@platform.test', 'Platform Admin');
await db.query('update public.profiles set is_platform_admin = true where id = $1', [platformAdmin]);

let pharmacyA, branchA, pharmacyB, supplierA, productA, product2A, saleId, saleKey;

console.log('\nOnboarding & roles');
await test('profiles are created for new auth users', async () => {
  const { rows } = await db.query('select full_name from public.profiles where id = $1', [ownerA]);
  assert.equal(rows[0].full_name, 'Asha Owner');
});

await test('owner creates a pharmacy with a default branch and owner membership', async () => {
  pharmacyA = await as(ownerA, async ({ one }) => (await one(`select public.create_pharmacy('Asha Medicals', '9999999999') as id`)).id);
  pharmacyB = await as(ownerB, async ({ one }) => (await one(`select public.create_pharmacy('Bina Chemists') as id`)).id);
  const res = await as(ownerA, async ({ q }) => q('select id, is_default from public.branches where pharmacy_id = $1', [pharmacyA]));
  assert.equal(res.length, 1);
  assert.equal(res[0].is_default, true);
  branchA = res[0].id;
});

await test('anonymous callers cannot create a pharmacy', async () => {
  await rejects(as(null, ({ q }) => q(`select public.create_pharmacy('Ghost')`)), /Not authenticated|permission denied/);
});

await test('staff are added (backend service-role insert) with roles', async () => {
  await asService(({ q }) => q(
    `insert into public.pharmacy_members (pharmacy_id, user_id, role, invited_by)
     values ($1, $2, 'pharmacist', $4), ($1, $3, 'cashier', $4)`, [pharmacyA, pharmacistA, cashierA, ownerA]));
  const members = await as(cashierA, ({ q }) => q('select role from public.pharmacy_members where pharmacy_id = $1', [pharmacyA]));
  assert.equal(members.length, 3);
});

await test('authenticated users cannot add members directly', async () => {
  await rejects(as(ownerB, ({ q }) => q(
    `insert into public.pharmacy_members (pharmacy_id, user_id, role) values ($1, $2, 'owner')`, [pharmacyA, ownerB])),
    /row-level security|permission denied/);
});

await test('sole owner cannot demote themselves', async () => {
  await rejects(as(ownerA, ({ q }) => q(
    `update public.pharmacy_members set role = 'manager' where pharmacy_id = $1 and user_id = $2`, [pharmacyA, ownerA])),
    /at least one active owner/);
});

await test('users cannot make themselves platform admin', async () => {
  await as(ownerA, ({ q }) => q('update public.profiles set is_platform_admin = true where id = $1', [ownerA]));
  const { rows } = await db.query('select is_platform_admin from public.profiles where id = $1', [ownerA]);
  assert.equal(rows[0].is_platform_admin, false);
});

await test('owners cannot change their own plan or status', async () => {
  await as(ownerA, ({ q }) => q(`update public.pharmacies set plan = 'enterprise', status = 'active' where id = $1`, [pharmacyA]));
  const { rows } = await db.query('select plan, status from public.pharmacies where id = $1', [pharmacyA]);
  assert.deepEqual([rows[0].plan, rows[0].status], ['free', 'trial']);
});

await test('invalid alert thresholds are rejected', async () => {
  await rejects(as(ownerA, ({ q }) => q(
    `update public.pharmacies set settings = settings || '{"expiry_critical_days": 400}' where id = $1`, [pharmacyA])),
    /Invalid pharmacy settings/);
});

console.log('\nCatalogue & purchases');
await test('pharmacist adds a supplier and products', async () => {
  await as(pharmacistA, async ({ one }) => {
    supplierA = (await one(`insert into public.suppliers (pharmacy_id, name, payment_terms_days) values ($1, 'Metro Distributors', 30) returning id`, [pharmacyA])).id;
    productA = (await one(`insert into public.products (pharmacy_id, name, generic_name, barcode, gst_rate, min_stock_level)
                           values ($1, 'Paracip 500', 'Paracetamol', '8901234567890', 12, 20) returning id`, [pharmacyA])).id;
    product2A = (await one(`insert into public.products (pharmacy_id, name, gst_rate, min_stock_level)
                            values ($1, 'Cough Syrup', 12, 5) returning id`, [pharmacyA])).id;
  });
  assert.ok(productA && product2A && supplierA);
});

await test('cashier cannot create products', async () => {
  await rejects(as(cashierA, ({ q }) => q(
    `insert into public.products (pharmacy_id, name) values ($1, 'Nope')`, [pharmacyA])), /row-level security/);
});

await test('duplicate barcodes are rejected within a pharmacy', async () => {
  await rejects(as(pharmacistA, ({ q }) => q(
    `insert into public.products (pharmacy_id, name, barcode) values ($1, 'Clone', '8901234567890')`, [pharmacyA])), /duplicate key/);
});

await test('purchase receiving creates batches, ledger rows and a payable', async () => {
  const items = [
    { product_id: productA, batch_no: 'LATE1', expiry_date: '2030-12-31', quantity: 10, purchase_price: 10, selling_price: 20, mrp: 22 },
    { product_id: productA, batch_no: 'EARLY1', expiry_date: '2028-01-31', quantity: 5, free_quantity: 1, purchase_price: 9, selling_price: 18, mrp: 22 },
    { product_id: product2A, batch_no: 'CS1', expiry_date: '2029-06-30', quantity: 4, purchase_price: 50, selling_price: 80, mrp: 90, gst_rate: 12 },
  ];
  const p = await as(pharmacistA, async ({ one }) => (await one(
    `select public.receive_purchase($1, $2, $3, 'SUP-001', current_date, $4::jsonb, 100, 'upi') as p`,
    [pharmacyA, branchA, supplierA, JSON.stringify(items)])).p);
  // 10*10 + 5*9 + 4*50 = 345, +12% GST = 41.40 → 386.40
  assert.equal(Number(p.total_amount), 386.4);
  assert.equal(p.payment_status, 'partial');
  const { rows } = await db.query(`select batch_no, quantity from public.medicine_batches where product_id = $1 order by batch_no`, [productA]);
  assert.deepEqual(rows.map((r) => [r.batch_no, r.quantity]), [['EARLY1', 6], ['LATE1', 10]]);
  const mv = await db.query(`select count(*)::int as n from public.stock_movements where movement_type = 'purchase' and pharmacy_id = $1`, [pharmacyA]);
  assert.equal(mv.rows[0].n, 3);
});

await test('the same supplier invoice cannot be entered twice', async () => {
  const items = [{ product_id: productA, batch_no: 'X1', expiry_date: '2030-01-01', quantity: 1, purchase_price: 1, selling_price: 1, mrp: 1 }];
  await rejects(as(pharmacistA, ({ q }) => q(
    `select public.receive_purchase($1, $2, $3, 'SUP-001', current_date, $4::jsonb)`,
    [pharmacyA, branchA, supplierA, JSON.stringify(items)])), /duplicate key/);
});

await test('expired stock and selling price above MRP are rejected on receiving', async () => {
  const bad = (o) => JSON.stringify([{ product_id: productA, batch_no: 'B', quantity: 1, purchase_price: 1, selling_price: 1, mrp: 2, expiry_date: '2030-01-01', ...o }]);
  await rejects(as(pharmacistA, ({ q }) => q(`select public.receive_purchase($1, $2, $3, 'S2', current_date, $4::jsonb)`,
    [pharmacyA, branchA, supplierA, bad({ expiry_date: '2020-01-01' })])), /expired/);
  await rejects(as(pharmacistA, ({ q }) => q(`select public.receive_purchase($1, $2, $3, 'S3', current_date, $4::jsonb)`,
    [pharmacyA, branchA, supplierA, bad({ selling_price: 5 })])), /must not exceed MRP/);
});

await test('stock quantity cannot be edited directly through the API', async () => {
  await rejects(as(ownerA, ({ q }) => q(`update public.medicine_batches set quantity = 999 where product_id = $1`, [productA])),
    /can only change through/);
});

await test('supplier payment settles the outstanding balance', async () => {
  const pid = (await db.query(`select id from public.purchases where pharmacy_id = $1`, [pharmacyA])).rows[0].id;
  await rejects(as(ownerA, ({ q }) => q(`select public.record_supplier_payment($1, 1000, 'cash')`, [pid])), /exceeds the outstanding/);
  await rejects(as(pharmacistA, ({ q }) => q(`select public.record_supplier_payment($1, 10, 'cash')`, [pid])), /permission/);
  const p = await as(ownerA, async ({ one }) => one(`select * from public.record_supplier_payment($1, 286.40, 'upi')`, [pid]));
  assert.equal(p.payment_status, 'paid');
});

console.log('\nBarcode & billing');
await test('barcode lookup returns the product with sellable batches in FEFO order', async () => {
  const r = await as(cashierA, async ({ one }) => (await one(`select public.lookup_barcode($1, '8901234567890', $2) as r`, [pharmacyA, branchA])).r);
  assert.equal(r.name, 'Paracip 500');
  assert.deepEqual(r.batches.map((b) => b.batch_no), ['EARLY1', 'LATE1']);
  const none = await as(cashierA, async ({ one }) => (await one(`select public.lookup_barcode($1, '0000000000000') as r`, [pharmacyA])).r);
  assert.equal(none, null);
});

await test('sale allocates FEFO, uses database prices and computes inclusive GST', async () => {
  saleKey = randomUUID();
  // The client tries to send its own price; it must be ignored.
  const items = [{ product_id: productA, quantity: 8, unit_price: 0.01 }];
  const sale = await as(cashierA, async ({ one }) => (await one(
    `select public.create_sale($1, $2, $3::jsonb, 'cash', $4, 'Ravi', '9876500000') as s`,
    [pharmacyA, branchA, JSON.stringify(items), saleKey])).s);
  saleId = sale.id;
  // 6 from EARLY1 @18 + 2 from LATE1 @20 = 148
  assert.equal(Number(sale.total_amount), 148);
  assert.deepEqual(sale.items.map((i) => [i.batch_no, i.quantity]).sort(), [['EARLY1', 6], ['LATE1', 2]]);
  assert.equal(Number(sale.taxable_amount) + Number(sale.tax_amount), 148);
  assert.match(sale.invoice_no, /^INV\/\d{4}-\d{2}\/00001$/);
  const { rows } = await db.query(`select batch_no, quantity from public.medicine_batches where product_id = $1 order by batch_no`, [productA]);
  assert.deepEqual(rows.map((r) => r.quantity), [0, 8]);
});

await test('retrying a sale with the same idempotency key does not double-deduct', async () => {
  const again = await as(cashierA, async ({ one }) => (await one(
    `select public.create_sale($1, $2, $3::jsonb, 'cash', $4) as s`,
    [pharmacyA, branchA, JSON.stringify([{ product_id: productA, quantity: 8 }]), saleKey])).s);
  assert.equal(again.id, saleId);
  const { rows } = await db.query(`select sum(quantity)::int as q from public.medicine_batches where product_id = $1`, [productA]);
  assert.equal(rows[0].q, 8);
});

await test('overselling fails atomically (no partial deduction, no sale row)', async () => {
  const before = (await db.query('select count(*)::int as n from public.sales')).rows[0].n;
  await rejects(as(cashierA, ({ q }) => q(`select public.create_sale($1, $2, $3::jsonb, 'cash', $4)`,
    [pharmacyA, branchA, JSON.stringify([{ product_id: product2A, quantity: 1 }, { product_id: productA, quantity: 50 }]), randomUUID()])),
    /Insufficient stock/);
  const after = (await db.query('select count(*)::int as n from public.sales')).rows[0].n;
  assert.equal(after, before);
  const cs = (await db.query(`select quantity from public.medicine_batches where product_id = $1`, [product2A])).rows[0];
  assert.equal(cs.quantity, 4);
});

await test('cashier discount is capped by pharmacy settings', async () => {
  await rejects(as(cashierA, ({ q }) => q(`select public.create_sale($1, $2, $3::jsonb, 'cash', $4)`,
    [pharmacyA, branchA, JSON.stringify([{ product_id: product2A, quantity: 1, discount_pct: 15 }]), randomUUID()])),
    /exceeds your limit/);
  const s = await as(pharmacistA, async ({ one }) => (await one(`select public.create_sale($1, $2, $3::jsonb, 'upi', $4) as s`,
    [pharmacyA, branchA, JSON.stringify([{ product_id: product2A, quantity: 1, discount_pct: 15 }]), randomUUID()])).s);
  assert.equal(Number(s.total_amount), 68); // 80 × 0.85
});

await test('cashiers only see their own sales; pharmacists see all', async () => {
  const c = await as(cashierA, ({ q }) => q('select id from public.sales'));
  const p = await as(pharmacistA, ({ q }) => q('select id from public.sales'));
  assert.equal(c.length, 1);
  assert.equal(p.length, 2);
});

console.log('\nReturns, cancellations, adjustments');
await test('partial return restocks the original batch and refunds pro rata', async () => {
  const sale = (await db.query('select public.get_sale($1) as s', [saleId]).catch(() => null)) ?? null;
  const itemId = (await db.query(`select id from public.sale_items where sale_id = $1 and batch_no = 'LATE1'`, [saleId])).rows[0].id;
  const ret = await as(pharmacistA, async ({ one }) => (await one(
    `select public.process_return($1, $2::jsonb, 'customer_request', 'cash') as r`,
    [saleId, JSON.stringify([{ sale_item_id: itemId, quantity: 1, restock: true }])])).r);
  assert.equal(Number(ret.refund_amount), 20);
  assert.match(ret.return_no, /^RET\//);
  const late = (await db.query(`select quantity from public.medicine_batches where batch_no = 'LATE1'`)).rows[0];
  assert.equal(late.quantity, 9);
  const s = (await db.query('select status, refunded_amount from public.sales where id = $1', [saleId])).rows[0];
  assert.equal(s.status, 'partially_returned');
  void sale;
});

await test('cannot return more than was sold', async () => {
  const itemId = (await db.query(`select id from public.sale_items where sale_id = $1 and batch_no = 'LATE1'`, [saleId])).rows[0].id;
  await rejects(as(pharmacistA, ({ q }) => q(`select public.process_return($1, $2::jsonb, 'customer_request', 'cash')`,
    [saleId, JSON.stringify([{ sale_item_id: itemId, quantity: 5 }])])), /at most 1 unit/);
});

await test('damaged returns are refunded but not restocked', async () => {
  const itemId = (await db.query(`select id from public.sale_items where sale_id = $1 and batch_no = 'EARLY1'`, [saleId])).rows[0].id;
  await as(ownerA, ({ q }) => q(`select public.process_return($1, $2::jsonb, 'damaged', 'cash')`,
    [saleId, JSON.stringify([{ sale_item_id: itemId, quantity: 1, restock: true }])]));
  const early = (await db.query(`select quantity from public.medicine_batches where batch_no = 'EARLY1'`)).rows[0];
  assert.equal(early.quantity, 0);
});

await test('cashiers cannot cancel; owners cancel and stock is restored', async () => {
  const key = randomUUID();
  const s = await as(cashierA, async ({ one }) => (await one(`select public.create_sale($1, $2, $3::jsonb, 'cash', $4) as s`,
    [pharmacyA, branchA, JSON.stringify([{ product_id: productA, quantity: 2 }]), key])).s);
  await rejects(as(cashierA, ({ q }) => q(`select public.cancel_sale($1, 'mistake')`, [s.id])), /permission/);
  const c = await as(ownerA, async ({ one }) => (await one(`select public.cancel_sale($1, 'Wrong customer') as s`, [s.id])).s);
  assert.equal(c.status, 'cancelled');
  const late = (await db.query(`select quantity from public.medicine_batches where batch_no = 'LATE1'`)).rows[0];
  assert.equal(late.quantity, 9);
  await rejects(as(ownerA, ({ q }) => q(`select public.cancel_sale($1, 'again')`, [s.id])), /Only sales without returns/);
});

await test('stock adjustments require a reason and cannot go negative', async () => {
  const batch = (await db.query(`select id from public.medicine_batches where batch_no = 'LATE1'`)).rows[0].id;
  await rejects(as(pharmacistA, ({ q }) => q(`select public.adjust_stock($1, -1, 'damage', '')`, [batch])), /reason is required/);
  await rejects(as(pharmacistA, ({ q }) => q(`select public.adjust_stock($1, -100, 'damage', 'Broken')`, [batch])), /Only 9 units/);
  await rejects(as(cashierA, ({ q }) => q(`select public.adjust_stock($1, -1, 'damage', 'Broken')`, [batch])), /permission/);
  const b = await as(pharmacistA, async ({ one }) => one(`select * from public.adjust_stock($1, -2, 'damage', 'Strip torn')`, [batch]));
  assert.equal(b.quantity, 7);
});

await test('ledger balance equals batch quantity for every batch', async () => {
  const { rows } = await db.query(`
    select b.batch_no, b.quantity, (select sum(quantity_change) from public.stock_movements m where m.batch_id = b.id)::int as ledger
      from public.medicine_batches b where b.pharmacy_id = $1`, [pharmacyA]);
  for (const r of rows) assert.equal(r.ledger, r.quantity, `batch ${r.batch_no}`);
});

console.log('\nAlerts, dashboard, reports');
await test('low-stock and out-of-stock alerts reflect live stock', async () => {
  const a = await as(pharmacistA, async ({ one }) => (await one('select public.stock_alerts($1) as a', [pharmacyA])).a);
  assert.deepEqual(a.low_stock.map((x) => x.name), ['Paracip 500', 'Cough Syrup']);
  assert.equal(a.out_of_stock.length, 0);
  await rejects(as(cashierA, ({ q }) => q('select public.stock_alerts($1)', [pharmacyA])), /permission/);
});

await test('alert notifications are deduplicated across refreshes', async () => {
  const n1 = await as(ownerA, async ({ one }) => (await one('select public.refresh_alert_notifications($1) as n', [pharmacyA])).n);
  const n2 = await as(ownerA, async ({ one }) => (await one('select public.refresh_alert_notifications($1) as n', [pharmacyA])).n);
  assert.ok(n1 >= 2);
  assert.equal(n2, 0);
});

await test('dashboard revenue equals net sales in the database', async () => {
  const d = await as(ownerA, async ({ one }) => (await one('select public.dashboard_summary($1) as d', [pharmacyA])).d);
  const { rows } = await db.query(`select sum(total_amount - refunded_amount)::numeric as net from public.sales
                                    where pharmacy_id = $1 and status <> 'cancelled'`, [pharmacyA]);
  assert.equal(Number(d.today.revenue), Number(rows[0].net));
  assert.equal(d.stock.products, 2);
  assert.equal(d.trend.length, 30);
  assert.equal(Number(d.payables), 0);
});

await test('inventory list filters by status and search', async () => {
  const all = await as(cashierA, async ({ one }) => (await one(`select public.inventory_list($1) as r`, [pharmacyA])).r);
  assert.equal(all.total, 2);
  const low = await as(cashierA, async ({ one }) => (await one(`select public.inventory_list($1, null, 'parac', null, 'low') as r`, [pharmacyA])).r);
  assert.equal(low.rows[0].name, 'Paracip 500');
  assert.equal(low.rows[0].stock_status, 'low_stock');
});

await test('reorder suggestions and sales report run on live data', async () => {
  const r = await as(ownerA, async ({ one }) => (await one('select public.reorder_suggestions($1) as r', [pharmacyA])).r);
  assert.ok(r.some((x) => x.name === 'Paracip 500' && x.suggested_qty > 0));
  const rep = await as(ownerA, async ({ one }) => (await one(`select public.sales_report($1, current_date - 1, current_date + 1) as r`, [pharmacyA])).r);
  assert.ok(Array.isArray(rep.gst));
  await rejects(as(pharmacistA, ({ q }) => q(`select public.sales_report($1, current_date, current_date)`, [pharmacyA])), /permission/);
});

console.log('\nTenant isolation');
await test('another pharmacy sees none of this pharmacy\'s rows', async () => {
  const counts = await as(ownerB, async ({ one }) => one(`select
      (select count(*) from public.products where pharmacy_id = $1)::int as products,
      (select count(*) from public.medicine_batches where pharmacy_id = $1)::int as batches,
      (select count(*) from public.sales where pharmacy_id = $1)::int as sales,
      (select count(*) from public.sale_items where pharmacy_id = $1)::int as sale_items,
      (select count(*) from public.suppliers where pharmacy_id = $1)::int as suppliers,
      (select count(*) from public.purchases where pharmacy_id = $1)::int as purchases,
      (select count(*) from public.customers where pharmacy_id = $1)::int as customers,
      (select count(*) from public.stock_movements where pharmacy_id = $1)::int as movements,
      (select count(*) from public.notifications where pharmacy_id = $1)::int as notifications,
      (select count(*) from public.audit_logs where pharmacy_id = $1)::int as audit,
      (select count(*) from public.pharmacies where id = $1)::int as pharmacy,
      (select count(*) from public.profiles where id = $2)::int as profile`, [pharmacyA, cashierA]));
  for (const [k, v] of Object.entries(counts)) assert.equal(v, 0, k);
});

await test('another pharmacy cannot run workflows against this pharmacy', async () => {
  const deny = /permission|not found/i;
  await rejects(as(ownerB, ({ q }) => q(`select public.create_sale($1, $2, $3::jsonb, 'cash', $4)`,
    [pharmacyA, branchA, JSON.stringify([{ product_id: productA, quantity: 1 }]), randomUUID()])), deny);
  await rejects(as(ownerB, ({ q }) => q(`select public.get_sale($1)`, [saleId])), deny);
  await rejects(as(ownerB, ({ q }) => q(`select public.dashboard_summary($1)`, [pharmacyA])), deny);
  await rejects(as(ownerB, ({ q }) => q(`select public.lookup_barcode($1, '8901234567890')`, [pharmacyA])), deny);
  await rejects(as(ownerB, ({ q }) => q(`select public.process_return($1, '[]'::jsonb, 'other', 'cash')`, [saleId])), deny);
  await rejects(as(ownerB, ({ q }) => q(`insert into public.products (pharmacy_id, name) values ($1, 'Injected')`, [pharmacyA])), /row-level security/);
});

await test('cross-tenant references are blocked even inside one\'s own pharmacy', async () => {
  const branchB = (await db.query('select id from public.branches where pharmacy_id = $1', [pharmacyB])).rows[0].id;
  // Pharmacy B tries to sell pharmacy A's product from its own branch.
  await rejects(as(ownerB, ({ q }) => q(`select public.create_sale($1, $2, $3::jsonb, 'cash', $4)`,
    [pharmacyB, branchB, JSON.stringify([{ product_id: productA, quantity: 1 }]), randomUUID()])), /not found/i);
  // …or point its own product at A's supplier.
  await rejects(as(ownerB, ({ q }) => q(`insert into public.products (pharmacy_id, name, default_supplier_id) values ($1, 'X Product', $2)`,
    [pharmacyB, supplierA])), /another pharmacy/);
});

await test('suspended pharmacies lose data access', async () => {
  await db.query(`update public.pharmacies set status = 'suspended' where id = $1`, [pharmacyB]);
  const rows = await as(ownerB, ({ q }) => q('select id from public.branches'));
  assert.equal(rows.length, 0);
  await db.query(`update public.pharmacies set status = 'trial' where id = $1`, [pharmacyB]);
});

console.log('\nPlatform admin & demo tenant');
await test('platform overview is restricted to platform admins', async () => {
  await rejects(as(ownerA, ({ q }) => q('select public.platform_overview()')), /Platform administrator/);
  const o = await as(platformAdmin, async ({ one }) => (await one('select public.platform_overview() as o')).o);
  assert.equal(o.pharmacies.total, 2);
  const p = await as(platformAdmin, async ({ one }) => one(`select * from public.platform_update_pharmacy($1, 'active', 'pro')`, [pharmacyA]));
  assert.deepEqual([p.status, p.plan], ['active', 'pro']);
});

await test('demo seed is service-role only, repeatable and self-consistent', async () => {
  const demoOwner = await createUser('demo.owner@pharmatrack.test', 'Demo Owner');
  const demoCashier = await createUser('demo.cashier@pharmatrack.test', 'Demo Cashier');
  await rejects(as(ownerA, ({ q }) => q('select public.seed_demo_pharmacy($1)', [ownerA])), /permission denied/);
  const first = await asService(async ({ one }) => (await one('select public.seed_demo_pharmacy($1, null, $2) as r', [demoOwner, demoCashier])).r);
  const second = await asService(async ({ one }) => (await one('select public.seed_demo_pharmacy($1, null, $2) as r', [demoOwner, demoCashier])).r);
  assert.equal(first.products, 30);
  assert.ok(first.sales > 100, `expected >100 demo sales, got ${first.sales}`);
  assert.equal(second.sales, first.sales);
  const { rows } = await db.query(`select
      (select count(*) from public.pharmacies where is_demo)::int as pharmacies,
      (select count(*) from public.products where pharmacy_id = $1)::int as products,
      (select count(*) from public.sales where pharmacy_id = $1 and not is_demo)::int as unflagged`, [first.pharmacy_id]);
  assert.deepEqual([rows[0].pharmacies, rows[0].products, rows[0].unflagged], [1, 30, 0]);
  const mismatched = await db.query(`
    select count(*)::int as n from public.medicine_batches b
     where b.pharmacy_id = $1 and b.quantity <> (select coalesce(sum(quantity_change), 0) from public.stock_movements m where m.batch_id = b.id)`,
    [first.pharmacy_id]);
  assert.equal(mismatched.rows[0].n, 0);
  const d = await as(demoOwner, async ({ one }) => (await one('select public.dashboard_summary($1) as d', [first.pharmacy_id])).d);
  assert.ok(Number(d.period.revenue) > 0);
  assert.ok(d.stock.expired_batches >= 1);
  const a = await as(demoOwner, async ({ one }) => (await one('select public.stock_alerts($1) as a', [first.pharmacy_id])).a);
  assert.ok(a.expiring_critical.length + a.expiring_warning.length > 0);
  // Real tenants are untouched by seeding.
  const real = (await db.query(`select count(*)::int as n from public.products where pharmacy_id = $1`, [pharmacyA])).rows[0].n;
  assert.equal(real, 2);
});

await test('removing the demo tenant cascades cleanly and leaves real data intact', async () => {
  await db.query('delete from public.pharmacies where is_demo');
  const { rows } = await db.query(`select
      (select count(*) from public.pharmacies where is_demo)::int as demo,
      (select count(*) from public.stock_movements m join public.medicine_batches b on b.id = m.batch_id where b.is_demo)::int as orphan_moves,
      (select count(*) from public.products where pharmacy_id = $1)::int as real_products,
      (select count(*) from public.sales where pharmacy_id = $1)::int as real_sales`, [pharmacyA]);
  assert.deepEqual([rows[0].demo, rows[0].orphan_moves, rows[0].real_products], [0, 0, 2]);
  assert.ok(rows[0].real_sales > 0);
  // Dashboard still works with no demo data present.
  const d = await as(ownerA, async ({ one }) => (await one('select public.dashboard_summary($1) as d', [pharmacyA])).d);
  assert.equal(d.stock.products, 2);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`\n✗ ${f.name}\n${f.err.stack}`);
  process.exit(1);
}
