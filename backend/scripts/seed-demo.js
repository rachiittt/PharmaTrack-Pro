#!/usr/bin/env node
'use strict';

/**
 * Creates (or refreshes) the demo tenant on a real Supabase project.
 *
 *   DEMO_PASSWORD='choose-a-strong-one' npm run seed:demo
 *
 * - Ensures three demo logins exist (owner, pharmacist, cashier) using
 *   DEMO_PASSWORD, which you choose — nothing is hard-coded.
 * - Calls public.seed_demo_pharmacy(), which deletes and rebuilds only the
 *   demo pharmacy (fixed id, is_demo = true). Real pharmacies are untouched
 *   and running it twice never creates duplicates.
 */
const { loadConfig } = require('../src/config');
const { createSupabaseFactory } = require('../src/lib/supabase');

const DEMO_USERS = [
  { key: 'owner', email: process.env.DEMO_OWNER_EMAIL || 'demo.owner@pharmatrack.demo', full_name: 'Demo Owner' },
  { key: 'pharmacist', email: process.env.DEMO_PHARMACIST_EMAIL || 'demo.pharmacist@pharmatrack.demo', full_name: 'Demo Pharmacist' },
  { key: 'cashier', email: process.env.DEMO_CASHIER_EMAIL || 'demo.cashier@pharmatrack.demo', full_name: 'Demo Cashier' },
];

async function ensureUser(admin, { email, full_name }, password) {
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error('Set DEMO_PASSWORD (at least 10 characters) for the demo logins.');
  }
  const config = loadConfig();
  const { admin } = createSupabaseFactory(config);

  const ids = {};
  for (const user of DEMO_USERS) {
    ids[user.key] = await ensureUser(admin, user, password);
    console.log(`  ✓ ${user.key.padEnd(10)} ${user.email}`);
  }

  const { data, error } = await admin.rpc('seed_demo_pharmacy', {
    p_owner: ids.owner, p_pharmacist: ids.pharmacist, p_cashier: ids.cashier,
  });
  if (error) throw error;
  console.log(`\nDemo pharmacy ready: ${data.products} products, ${data.sales} sales (id ${data.pharmacy_id}).`);
  console.log('Sign in with any demo email above and DEMO_PASSWORD.');
}

main().catch((err) => {
  console.error(`\nDemo seed failed: ${err.message}`);
  process.exit(1);
});
