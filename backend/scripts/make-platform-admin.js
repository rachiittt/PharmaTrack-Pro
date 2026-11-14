#!/usr/bin/env node
'use strict';

/**
 * Grants (or revokes) platform super-admin to an existing account.
 * This flag cannot be set from the app — only with the service-role key.
 *
 *   npm run platform-admin -- someone@example.com
 *   npm run platform-admin -- someone@example.com --revoke
 */
const { loadConfig } = require('../src/config');
const { createSupabaseFactory } = require('../src/lib/supabase');

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) throw new Error('Usage: npm run platform-admin -- <email> [--revoke]');
  const { admin } = createSupabaseFactory(loadConfig());
  const { data, error } = await admin
    .from('profiles').update({ is_platform_admin: flag !== '--revoke' })
    .eq('email', email.toLowerCase()).select('id, email, is_platform_admin');
  if (error) throw error;
  if (!data.length) throw new Error(`No account found for ${email}. Sign up first.`);
  console.log(`${data[0].email}: platform admin = ${data[0].is_platform_admin}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
