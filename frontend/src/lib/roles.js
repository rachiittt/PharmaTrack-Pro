/**
 * UI permission map. Mirrors the RLS policies and RPC role checks in
 * supabase/migrations — the database remains the real enforcement point.
 */
export const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
};

export const ROLE_DESCRIPTIONS = {
  manager: 'Everything except staff, branches and pharmacy settings. Can cancel bills and record supplier payments.',
  pharmacist: 'Inventory, purchases, returns, alerts and billing. Cannot cancel bills or see reports.',
  cashier: 'Billing (POS) and their own sales history. Discounts limited by your settings.',
};

const ALL = ['owner', 'manager', 'pharmacist', 'cashier'];
const STOCK = ['owner', 'manager', 'pharmacist'];
const MANAGE = ['owner', 'manager'];

const PERMISSIONS = {
  'dashboard.view': STOCK,
  'pos.use': ALL,
  'sales.view': ALL,
  'sales.return': STOCK,
  'sales.cancel': MANAGE,
  'inventory.view': ALL,
  'inventory.edit': STOCK,
  'inventory.delete': MANAGE,
  'stock.adjust': STOCK,
  'purchases.view': STOCK,
  'purchases.create': STOCK,
  'purchases.pay': MANAGE,
  'suppliers.view': STOCK,
  'suppliers.edit': STOCK,
  'alerts.view': STOCK,
  'reports.view': MANAGE,
  'assistant.use': STOCK,
  'audit.view': MANAGE,
  'team.manage': ['owner'],
  'settings.pharmacy': ['owner'],
  'branches.manage': ['owner'],
};

export function can(role, action) {
  return Boolean(role && PERMISSIONS[action]?.includes(role));
}

/** Where a role lands after sign-in. */
export function homeFor(role) {
  return role === 'cashier' ? '/pos' : '/';
}
