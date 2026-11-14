'use strict';

const { z } = require('zod');
const { HttpError, unwrap } = require('../lib/errors');

const uuid = z.string().uuid();

/**
 * Verifies the Supabase access token on every request. There is no demo or
 * offline bypass: a request is authenticated only if Supabase Auth says so.
 */
function requireAuth(supabase) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization || '';
      const [scheme, token] = header.split(' ');
      if (scheme !== 'Bearer' || !token) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
      }
      const { data, error } = await supabase.admin.auth.getUser(token);
      if (error || !data?.user) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
      }
      req.user = { id: data.user.id, email: data.user.email };
      req.accessToken = token;
      req.db = supabase.forUser(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Loads the caller's membership for :pharmacyId (through RLS) and enforces
 * the allowed roles. The database enforces the same rules again in every RPC.
 */
function requireMember(...roles) {
  return async (req, _res, next) => {
    try {
      const pharmacyId = req.params.pharmacyId;
      if (!uuid.safeParse(pharmacyId).success) {
        throw new HttpError(400, 'INVALID_INPUT', 'Invalid pharmacy id');
      }
      const membership = unwrap(
        await req.db
          .from('pharmacy_members')
          .select('role, branch_id, is_active, pharmacies!inner(status)')
          .eq('pharmacy_id', pharmacyId)
          .eq('user_id', req.user.id)
          .maybeSingle(),
      );
      if (!membership || !membership.is_active || membership.pharmacies?.status === 'suspended') {
        throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this pharmacy');
      }
      if (roles.length && !roles.includes(membership.role)) {
        throw new HttpError(403, 'FORBIDDEN', 'Your role does not allow this action');
      }
      req.membership = { pharmacyId, role: membership.role, branchId: membership.branch_id };
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireAuth, requireMember };
