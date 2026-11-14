// Unit tests for frontend business logic that does not need a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasValidGtinChecksum, normalizeScannedCode } from '../src/lib/barcode.js';
import { previewTotals, purchaseLineTotals } from '../src/lib/pricing.js';
import { can, homeFor } from '../src/lib/roles.js';

test('GTIN checksums: valid codes pass, single-digit misreads fail', () => {
  assert.equal(hasValidGtinChecksum('8901234567890'), true);
  assert.equal(hasValidGtinChecksum('8901234567891'), false);
  assert.equal(hasValidGtinChecksum('96385074'), true); // EAN-8
  assert.equal(hasValidGtinChecksum('036000291452'), true); // UPC-A
});

test('scanned codes are normalised and misreads rejected', () => {
  assert.equal(normalizeScannedCode(' 8901234567890 '), '8901234567890');
  assert.equal(normalizeScannedCode('8901234567891'), null);
  // GS1 DataMatrix element string with AI (01) → EAN-13
  assert.equal(normalizeScannedCode('(01)08901234567890(17)271231(10)AB12'), '8901234567890');
  // Internal alphanumeric codes are accepted as-is
  assert.equal(normalizeScannedCode('RACK-A1-0042'), 'RACK-A1-0042');
  assert.equal(normalizeScannedCode('<script>'), null);
  assert.equal(normalizeScannedCode(''), null);
});

test('POS preview matches the database maths for tax-inclusive prices', () => {
  // Same case as the DB test: 6 × ₹18 + 2 × ₹20 at 12% GST = ₹148.
  const t = previewTotals([
    { price: 18, quantity: 6, gst_rate: 12 },
    { price: 20, quantity: 2, gst_rate: 12 },
  ]);
  assert.equal(t.total, 148);
  assert.equal(Math.round((t.taxable + t.tax) * 100) / 100, 148);
  const d = previewTotals([{ price: 80, quantity: 1, gst_rate: 12, discount_pct: 15 }]);
  assert.equal(d.total, 68);
  assert.equal(d.discount, 12);
});

test('purchase lines add GST on top of supplier rates', () => {
  assert.deepEqual(purchaseLineTotals({ quantity: 10, purchase_price: 10, gst_rate: 12 }), { taxable: 100, tax: 12, total: 112 });
  assert.deepEqual(purchaseLineTotals({ quantity: '', purchase_price: 5 }), { taxable: 0, tax: 0, total: 0 });
});

test('role permissions mirror the database policies', () => {
  assert.equal(can('cashier', 'pos.use'), true);
  assert.equal(can('cashier', 'inventory.edit'), false);
  assert.equal(can('cashier', 'sales.cancel'), false);
  assert.equal(can('pharmacist', 'sales.cancel'), false);
  assert.equal(can('manager', 'sales.cancel'), true);
  assert.equal(can('manager', 'team.manage'), false);
  assert.equal(can('owner', 'team.manage'), true);
  assert.equal(can(null, 'pos.use'), false);
  assert.equal(homeFor('cashier'), '/pos');
});
