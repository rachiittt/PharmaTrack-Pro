import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when the frontend has been pointed at a Supabase project. */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('your-project'));

/**
 * Browser client. Uses only the public anon key — every query runs under the
 * signed-in user's Row Level Security policies. The service-role key is never
 * shipped to the browser.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/** Unwrap a Supabase response, throwing a friendly AppError on failure. */
export function unwrap({ data, error, count }) {
  if (error) throw toAppError(error);
  return count !== undefined && count !== null ? { data, count } : data;
}

export class AppError extends Error {
  constructor(message, { code, status, cause } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

const FRIENDLY = {
  '42501': 'You do not have permission to do that.',
  '23505': 'A record with these details already exists.',
  '23503': 'This record is used elsewhere and cannot be removed. Archive it instead.',
  PGRST301: 'Your session has expired. Please sign in again.',
};

export function toAppError(error) {
  if (error instanceof AppError) return error;
  const code = error?.code;
  // Our RPCs raise human-readable messages for validation (22023), not-found
  // (P0002) and permission (42501) cases — show those as-is.
  const raised = ['22023', 'P0002', '42501', '23514', '54000', '28000'].includes(code) && error.message;
  const message = raised || FRIENDLY[code] || error?.message || 'Something went wrong. Please try again.';
  return new AppError(message, { code, cause: error });
}

export function rpc(fn, args) {
  return supabase.rpc(fn, args).then(unwrap);
}
