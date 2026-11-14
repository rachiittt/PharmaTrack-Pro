-- ============================================================================
-- PharmaTrack Pro — 005 Row Level Security
--
-- Role matrix (pharmacy scope):
--                         owner  manager  pharmacist  cashier
--   pharmacy settings      RW      R         R          R
--   branches / staff       RW      R         R          R
--   products, suppliers    RW      RW        RW         R
--   batch prices           RW      RW        RW         R
--   stock ledger           R       R         R          -
--   purchases & payables   R*      R*        R*         -      (*writes via RPC)
--   sales                  R       R         R          own    (writes via RPC)
--   audit log              R       R         -          -
-- Stock quantities, sales, purchases and returns are only written by RPCs.
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.pharmacies         enable row level security;
alter table public.branches           enable row level security;
alter table public.pharmacy_members   enable row level security;
alter table public.suppliers          enable row level security;
alter table public.products           enable row level security;
alter table public.medicine_batches   enable row level security;
alter table public.customers          enable row level security;
alter table public.stock_movements    enable row level security;
alter table public.document_sequences enable row level security;
alter table public.purchases          enable row level security;
alter table public.purchase_items     enable row level security;
alter table public.supplier_payments  enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.sale_returns       enable row level security;
alter table public.sale_return_items  enable row level security;
alter table public.notifications      enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.ai_requests        enable row level security;

-- Anonymous users get nothing from the data API.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from anon, public;

-- Ledger-type tables are never written by clients.
revoke insert, update, delete on public.stock_movements, public.document_sequences,
  public.purchases, public.purchase_items, public.supplier_payments, public.sales,
  public.sale_items, public.sale_returns, public.sale_return_items, public.audit_logs,
  public.ai_requests from authenticated;
revoke insert, delete on public.medicine_batches from authenticated;

-- Shared-pharmacy check for reading co-workers' profiles.
create or replace function private.shares_pharmacy(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pharmacy_members me
    join public.pharmacy_members them on them.pharmacy_id = me.pharmacy_id
    where me.user_id = (select auth.uid()) and me.is_active and them.user_id = p_user_id);
$$;
grant execute on function private.shares_pharmacy(uuid) to authenticated;

-- Profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_pharmacy(id) or private.is_platform_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Pharmacies ----------------------------------------------------------------
create policy pharmacies_select on public.pharmacies for select to authenticated
  using (private.is_member(id) or private.is_platform_admin());
create policy pharmacies_update on public.pharmacies for update to authenticated
  using (private.has_role(id, '{owner}') or private.is_platform_admin())
  with check (private.has_role(id, '{owner}') or private.is_platform_admin());

-- Branches ------------------------------------------------------------------
create policy branches_select on public.branches for select to authenticated
  using (private.is_member(pharmacy_id));
create policy branches_insert on public.branches for insert to authenticated
  with check (private.has_role(pharmacy_id, '{owner}'));
create policy branches_update on public.branches for update to authenticated
  using (private.has_role(pharmacy_id, '{owner}')) with check (private.has_role(pharmacy_id, '{owner}'));

-- Members -------------------------------------------------------------------
create policy members_select on public.pharmacy_members for select to authenticated
  using (private.is_member(pharmacy_id) or user_id = (select auth.uid()));
create policy members_update on public.pharmacy_members for update to authenticated
  using (private.has_role(pharmacy_id, '{owner}')) with check (private.has_role(pharmacy_id, '{owner}'));
create policy members_delete on public.pharmacy_members for delete to authenticated
  using (private.has_role(pharmacy_id, '{owner}') and user_id <> (select auth.uid()));
-- Inserts happen in the backend (service role) after the owner check, because
-- inviting a user requires the Auth admin API.

-- Suppliers -----------------------------------------------------------------
create policy suppliers_select on public.suppliers for select to authenticated
  using (private.is_member(pharmacy_id));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'));
create policy suppliers_update on public.suppliers for update to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'))
  with check (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager}'));

-- Products ------------------------------------------------------------------
create policy products_select on public.products for select to authenticated
  using (private.is_member(pharmacy_id));
create policy products_insert on public.products for insert to authenticated
  with check (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'));
create policy products_update on public.products for update to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'))
  with check (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'));
create policy products_delete on public.products for delete to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager}'));

-- Batches (quantity guarded by trigger) -------------------------------------
create policy batches_select on public.medicine_batches for select to authenticated
  using (private.is_member(pharmacy_id));
create policy batches_update on public.medicine_batches for update to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'))
  with check (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'));

-- Customers -----------------------------------------------------------------
create policy customers_select on public.customers for select to authenticated
  using (private.is_member(pharmacy_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (private.is_member(pharmacy_id));
create policy customers_update on public.customers for update to authenticated
  using (private.is_member(pharmacy_id)) with check (private.is_member(pharmacy_id));

-- Ledger / documents (read-only) --------------------------------------------
create policy movements_select on public.stock_movements for select to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'));

create policy purchases_select on public.purchases for select to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'));
create policy purchase_items_select on public.purchase_items for select to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager,pharmacist}'));
create policy supplier_payments_select on public.supplier_payments for select to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager}'));

create policy sales_select on public.sales for select to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager,pharmacist}')
         or (private.has_role(pharmacy_id, '{cashier}') and created_by = (select auth.uid())));
create policy sale_items_select on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy sale_returns_select on public.sale_returns for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy sale_return_items_select on public.sale_return_items for select to authenticated
  using (exists (select 1 from public.sale_returns r where r.id = return_id));

-- Notifications ---------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (private.is_member(pharmacy_id) and (user_id is null or user_id = (select auth.uid())));
create policy notifications_update on public.notifications for update to authenticated
  using (private.is_member(pharmacy_id) and (user_id is null or user_id = (select auth.uid())))
  with check (private.is_member(pharmacy_id));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Audit & AI usage ------------------------------------------------------------
create policy audit_select on public.audit_logs for select to authenticated
  using (private.has_role(pharmacy_id, '{owner,manager}') or private.is_platform_admin());
create policy ai_requests_select on public.ai_requests for select to authenticated
  using (private.has_role(pharmacy_id, '{owner}'));
