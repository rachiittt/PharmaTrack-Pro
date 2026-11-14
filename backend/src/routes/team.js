'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireMember } = require('../middleware/auth');
const { HttpError, unwrap } = require('../lib/errors');

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(['manager', 'pharmacist', 'cashier']),
  branch_id: z.string().uuid().nullable().optional(),
  // Optional: create the login directly (for shops without email access).
  // The owner shares it in person; the staff member should change it.
  temporary_password: z.string().min(10).max(72).optional(),
});

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Staff onboarding needs the Supabase Auth admin API, so it lives on the
 * server. Listing, role changes and deactivation are plain RLS-protected
 * table operations done from the client (owner-only policies).
 */
function teamRouter({ supabase, config }) {
  const router = Router({ mergeParams: true });

  router.post('/', requireMember('owner'), validate(inviteSchema), async (req, res, next) => {
    try {
      const { pharmacyId } = req.membership;
      const { email, full_name, role, branch_id, temporary_password } = req.validatedBody;
      const admin = supabase.admin;

      if (branch_id) {
        const branch = unwrap(await req.db.from('branches').select('id').eq('id', branch_id).maybeSingle());
        if (!branch) throw new HttpError(400, 'INVALID_INPUT', 'Branch not found in this pharmacy');
      }

      let profile = unwrap(
        await admin.from('profiles').select('id, email, full_name').ilike('email', escapeLike(email)).maybeSingle(),
      );
      let invited = false;

      if (!profile) {
        const result = temporary_password
          ? await admin.auth.admin.createUser({
              email, password: temporary_password, email_confirm: true, user_metadata: { full_name },
            })
          : await admin.auth.admin.inviteUserByEmail(email, {
              data: { full_name }, redirectTo: `${config.FRONTEND_URL}/login`,
            });
        if (result.error) {
          throw new HttpError(400, 'INVITE_FAILED', result.error.message);
        }
        profile = { id: result.data.user.id, email, full_name };
        invited = !temporary_password;
      }

      const existing = unwrap(
        await admin.from('pharmacy_members').select('id').eq('pharmacy_id', pharmacyId).eq('user_id', profile.id).maybeSingle(),
      );
      if (existing) throw new HttpError(409, 'DUPLICATE', 'This person is already a member of the pharmacy');

      const member = unwrap(
        await admin
          .from('pharmacy_members')
          .insert({ pharmacy_id: pharmacyId, user_id: profile.id, role, branch_id: branch_id ?? null, invited_by: req.user.id })
          .select('id, role, branch_id, is_active, created_at')
          .single(),
      );

      await admin.from('audit_logs').insert({
        pharmacy_id: pharmacyId, actor_id: req.user.id, action: 'member.invite', entity: 'pharmacy_members',
        entity_id: member.id, details: { email, role, method: temporary_password ? 'password' : 'email_invite' },
      });

      res.status(201).json({ member: { ...member, profile }, invited });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { teamRouter, inviteSchema };
