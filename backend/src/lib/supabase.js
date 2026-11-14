'use strict';

const { createClient } = require('@supabase/supabase-js');

/**
 * Two kinds of Supabase client:
 *  - admin:   service role, bypasses RLS. Used only for Auth admin calls (staff
 *             invites) and server-side bookkeeping (AI usage log, audit rows).
 *  - forUser: anon key + the caller's JWT, so every query and RPC runs under
 *             the caller's Row Level Security policies.
 */
function createSupabaseFactory(config) {
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, options);

  function forUser(accessToken) {
    return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      ...options,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  return { admin, forUser };
}

module.exports = { createSupabaseFactory };
