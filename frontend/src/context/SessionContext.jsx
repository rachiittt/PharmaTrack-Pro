/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getProfile, listMemberships, listBranches } from '../services/pharmacy';
import { can } from '../lib/roles';

const SessionContext = createContext(null);
const STORAGE_KEY = 'pharmatrack.workspace';

function readWorkspace() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function writeWorkspace(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/**
 * Supabase session + the user's profile, pharmacy memberships and the
 * currently selected pharmacy/branch. Role checks here only shape the UI —
 * the database enforces the same rules on every request.
 */
export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [branches, setBranches] = useState([]);
  const [workspace, setWorkspace] = useState(readWorkspace);
  const [status, setStatus] = useState(isSupabaseConfigured ? 'loading' : 'unconfigured');
  const [error, setError] = useState(null);

  const loadUserData = useCallback(async (user) => {
    if (!user) {
      setProfile(null); setMemberships([]); setBranches([]);
      setStatus('signed_out');
      return;
    }
    try {
      const [p, m] = await Promise.all([getProfile(user.id), listMemberships(user.id)]);
      setProfile(p);
      setMemberships(m);
      setError(null);
      setStatus('ready');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadUserData(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => loadUserData(next?.user ?? null), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUserData]);

  const membership = useMemo(() => {
    if (!memberships.length) return null;
    return memberships.find((m) => m.pharmacy.id === workspace.pharmacyId) ?? memberships[0];
  }, [memberships, workspace.pharmacyId]);

  const pharmacy = membership?.pharmacy ?? null;
  const role = membership?.role ?? null;

  useEffect(() => {
    if (!pharmacy) { setBranches([]); return; }
    let cancelled = false;
    listBranches(pharmacy.id).then((rows) => { if (!cancelled) setBranches(rows.filter((b) => b.is_active)); }).catch(setError);
    return () => { cancelled = true; };
  }, [pharmacy]);

  // Staff pinned to a branch always work in that branch.
  const branch = useMemo(() => {
    if (!branches.length) return null;
    if (membership?.branch_id) return branches.find((b) => b.id === membership.branch_id) ?? null;
    return branches.find((b) => b.id === workspace.branchId) ?? branches.find((b) => b.is_default) ?? branches[0];
  }, [branches, membership, workspace.branchId]);

  const selectPharmacy = useCallback((pharmacyId) => {
    const next = { pharmacyId, branchId: null };
    setWorkspace(next); writeWorkspace(next);
  }, []);

  const selectBranch = useCallback((branchId) => {
    setWorkspace((w) => { const next = { ...w, branchId }; writeWorkspace(next); return next; });
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await loadUserData(data.user ?? null);
    if (pharmacy) setBranches((await listBranches(pharmacy.id)).filter((b) => b.is_active));
  }, [loadUserData, pharmacy]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    writeWorkspace({});
    setWorkspace({});
  }, []);

  const value = useMemo(() => ({
    status, error, session, user: session?.user ?? null, profile,
    memberships, membership, pharmacy, role, branches, branch,
    settings: pharmacy?.settings ?? {},
    isPlatformAdmin: Boolean(profile?.is_platform_admin),
    can: (action) => can(role, action),
    selectPharmacy, selectBranch, refresh, signOut,
  }), [status, error, session, profile, memberships, membership, pharmacy, role, branches, branch, selectPharmacy, selectBranch, refresh, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
