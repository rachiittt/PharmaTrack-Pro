import { supabase, unwrap, rpc } from '../lib/supabase';
import { apiRequest } from '../lib/api';

export async function getProfile(userId) {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single());
}

export async function updateProfile(userId, { full_name, phone }) {
  return unwrap(await supabase.from('profiles').update({ full_name, phone: phone || null }).eq('id', userId).select().single());
}

/** Pharmacies the user belongs to, with their role in each. */
export async function listMemberships(userId) {
  return unwrap(await supabase.from('pharmacy_members')
    .select('id, role, branch_id, is_active, pharmacy:pharmacies(*)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at'));
}

export function createPharmacy({ name, phone, gstin, address, city, state, branchName }) {
  return rpc('create_pharmacy', {
    p_name: name, p_phone: phone || null, p_gstin: gstin || null, p_address: address || null,
    p_city: city || null, p_state: state || null, p_branch_name: branchName || 'Main Store',
  });
}

const PHARMACY_FIELDS = ['name', 'legal_name', 'gstin', 'drug_license_no', 'phone', 'email', 'address', 'city', 'state', 'pincode', 'settings', 'logo_path'];

export async function updatePharmacy(id, input) {
  const out = {};
  for (const k of PHARMACY_FIELDS) {
    if (!(k in input)) continue;
    const v = input[k];
    out[k] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  }
  if (out.gstin) out.gstin = out.gstin.toUpperCase();
  return unwrap(await supabase.from('pharmacies').update(out).eq('id', id).select().single());
}

export async function listBranches(pharmacyId) {
  return unwrap(await supabase.from('branches').select('*').eq('pharmacy_id', pharmacyId).order('is_default', { ascending: false }).order('name'));
}

export async function createBranch(pharmacyId, { name, address, phone }) {
  return unwrap(await supabase.from('branches').insert({ pharmacy_id: pharmacyId, name, address: address || null, phone: phone || null }).select().single());
}

export async function updateBranch(id, input) {
  return unwrap(await supabase.from('branches').update(input).eq('id', id).select().single());
}

// ---- Staff -----------------------------------------------------------------

export async function listMembers(pharmacyId) {
  return unwrap(await supabase.from('pharmacy_members')
    .select('id, user_id, role, branch_id, is_active, created_at, profile:profiles!pharmacy_members_user_id_fkey(full_name, email, phone)')
    .eq('pharmacy_id', pharmacyId)
    .order('created_at'));
}

export async function updateMember(memberId, input) {
  return unwrap(await supabase.from('pharmacy_members').update(input).eq('id', memberId).select().single());
}

/** Invitations need the Auth admin API, so they go through the backend. */
export function inviteMember(pharmacyId, body) {
  return apiRequest(`/pharmacies/${pharmacyId}/members`, { method: 'POST', body });
}

// ---- Audit -----------------------------------------------------------------

export async function listAuditLog(pharmacyId, limit = 100) {
  return unwrap(await supabase.from('audit_logs')
    .select('id, action, entity, entity_id, details, created_at, profiles(full_name)')
    .eq('pharmacy_id', pharmacyId).order('created_at', { ascending: false }).limit(limit));
}

// ---- Platform (super admin) -------------------------------------------------

export const platformOverview = () => rpc('platform_overview');

export const platformUpdatePharmacy = (pharmacyId, { status, plan, renewsAt, reason }) =>
  rpc('platform_update_pharmacy', {
    p_pharmacy_id: pharmacyId, p_status: status || null, p_plan: plan || null,
    p_plan_renews_at: renewsAt || null, p_reason: reason || null,
  });
