import { supabase, AppError } from './supabase';

const BASE = import.meta.env.VITE_API_URL || '/api';

/** Call the PharmaTrack backend with the current Supabase access token. */
export async function apiRequest(path, { method = 'GET', body, timeout = 30000 } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new AppError(err.name === 'AbortError'
      ? 'The server took too long to respond.'
      : 'Cannot reach the PharmaTrack server. Is the backend running?', { code: 'NETWORK', cause: err });
  } finally {
    clearTimeout(timer);
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(payload.error || `Request failed (${res.status})`, { code: payload.code, status: res.status });
  }
  return payload;
}
