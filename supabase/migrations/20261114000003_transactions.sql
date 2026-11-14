-- ============================================================================
-- PharmaTrack Pro — 003 Purchases, sales, returns, notifications, audit
--
-- Header/line tables only. All writes go through the SECURITY DEFINER RPCs in
-- migration 004 so that stock, money and audit rows change in one transaction.
-- ============================================================================

create type public.payment_method as enum ('cash', 'upi', 'card', 'credit');
create type public.sale_status as enum ('completed', 'partially_returned', 'returned', 'cancelled');
create type public.payment_status as enum ('unpaid', 'partial', 'paid');

-- ---------------------------------------------------------------------------
-- Gap-free document numbering per pharmacy, kind and financial year.
-- ---------------------------------------------------------------------------
create table public.document_sequences (
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  kind        text not null check (kind in ('sale', 'return', 'purchase')),
  fy          text not null,               -- e.g. '2026-27'
  last_value  int not null default 0,
  primary key (pharmacy_id, kind, fy)
);

-- ---------------------------------------------------------------------------
-- Purchases (stock receiving from suppliers)
-- ---------------------------------------------------------------------------
create table public.purchases (
  id               uuid primary key default gen_random_uuid(),
  pharmacy_id      uuid not null references public.pharmacies (id) on delete cascade,
  branch_id        uuid not null references public.branches (id),
  supplier_id      uuid not null references public.suppliers (id),
  reference_no     text not null,                 -- internal GRN number
  supplier_invoice_no text not null check (length(trim(supplier_invoice_no)) between 1 and 60),
  invoice_date     date not null,
  due_date         date,
  subtotal         numeric(12,2) not null check (subtotal >= 0),
  discount_amount  numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_amount       numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_amount     numeric(12,2) not null check (total_amount >= 0),
  amount_paid      numeric(12,2) not null default 0 check (amount_paid >= 0),
  payment_status   public.payment_status not null default 'unpaid',
  invoice_file_path text,                         -- Supabase Storage: purchase-invoices/
  notes            text,
  is_demo          boolean not null default false,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint purchase_paid_le_total check (amount_paid <= total_amount),
  unique (pharmacy_id, reference_no),
  unique (pharmacy_id, supplier_id, supplier_invoice_no)
);
create index purchases_pharmacy_time_idx on public.purchases (pharmacy_id, invoice_date desc);
create index purchases_supplier_idx on public.purchases (supplier_id);
create index purchases_branch_idx on public.purchases (branch_id);
create index purchases_created_by_idx on public.purchases (created_by);
create index purchases_outstanding_idx on public.purchases (pharmacy_id, supplier_id) where payment_status <> 'paid';

create table public.purchase_items (
  id             uuid primary key default gen_random_uuid(),
  purchase_id    uuid not null references public.purchases (id) on delete cascade,
  pharmacy_id    uuid not null references public.pharmacies (id) on delete cascade,
  product_id     uuid not null references public.products (id),
  batch_id       uuid not null references public.medicine_batches (id),
  batch_no       text not null,
  mfg_date       date,
  expiry_date    date not null,
  quantity       int not null check (quantity > 0),
  free_quantity  int not null default 0 check (free_quantity >= 0),
  purchase_price numeric(12,2) not null check (purchase_price >= 0),
  selling_price  numeric(12,2) not null check (selling_price >= 0),
  mrp            numeric(12,2) not null check (mrp > 0),
  gst_rate       numeric(5,2) not null default 12,
  tax_amount     numeric(12,2) not null default 0,
  line_total     numeric(12,2) not null check (line_total >= 0)
);
create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_product_idx on public.purchase_items (product_id);
create index purchase_items_batch_idx on public.purchase_items (batch_id);
create index purchase_items_pharmacy_idx on public.purchase_items (pharmacy_id);

create table public.supplier_payments (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id),
  purchase_id uuid references public.purchases (id),
  amount      numeric(12,2) not null check (amount > 0),
  method      public.payment_method not null,
  paid_on     date not null default current_date,
  reference   text,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index supplier_payments_supplier_idx on public.supplier_payments (supplier_id);
create index supplier_payments_purchase_idx on public.supplier_payments (purchase_id);
create index supplier_payments_pharmacy_idx on public.supplier_payments (pharmacy_id, paid_on desc);
create index supplier_payments_created_by_idx on public.supplier_payments (created_by);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  pharmacy_id      uuid not null references public.pharmacies (id) on delete cascade,
  branch_id        uuid not null references public.branches (id),
  invoice_no       text not null,
  customer_id      uuid references public.customers (id) on delete set null,
  customer_name    text,
  customer_phone   text,
  doctor_name      text,
  subtotal         numeric(12,2) not null check (subtotal >= 0),   -- sum of lines before bill discount
  discount_amount  numeric(12,2) not null default 0 check (discount_amount >= 0),
  taxable_amount   numeric(12,2) not null check (taxable_amount >= 0),
  tax_amount       numeric(12,2) not null check (tax_amount >= 0),
  round_off        numeric(6,2) not null default 0,
  total_amount     numeric(12,2) not null check (total_amount >= 0),
  refunded_amount  numeric(12,2) not null default 0 check (refunded_amount >= 0),
  payment_method   public.payment_method not null,
  status           public.sale_status not null default 'completed',
  idempotency_key  uuid not null,
  notes            text,
  is_demo          boolean not null default false,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz,
  cancelled_by     uuid references public.profiles (id) on delete set null,
  cancel_reason    text,
  constraint sale_refund_le_total check (refunded_amount <= total_amount),
  unique (pharmacy_id, invoice_no),
  unique (pharmacy_id, idempotency_key)
);
create index sales_pharmacy_time_idx on public.sales (pharmacy_id, created_at desc);
create index sales_branch_time_idx on public.sales (branch_id, created_at desc);
create index sales_customer_idx on public.sales (customer_id);
create index sales_created_by_idx on public.sales (created_by);
create index sales_cancelled_by_idx on public.sales (cancelled_by);

create table public.sale_items (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references public.sales (id) on delete cascade,
  pharmacy_id       uuid not null references public.pharmacies (id) on delete cascade,
  product_id        uuid not null references public.products (id),
  batch_id          uuid not null references public.medicine_batches (id),
  product_name      text not null,          -- snapshot for invoices
  batch_no          text not null,
  expiry_date       date not null,
  quantity          int not null check (quantity > 0),
  returned_quantity int not null default 0 check (returned_quantity >= 0),
  unit_price        numeric(12,2) not null check (unit_price >= 0),
  mrp               numeric(12,2) not null,
  unit_cost         numeric(12,2) not null,  -- for margin reporting
  discount_pct      numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  gst_rate          numeric(5,2) not null,
  taxable_amount    numeric(12,2) not null,
  tax_amount        numeric(12,2) not null,
  line_total        numeric(12,2) not null check (line_total >= 0),
  constraint sale_item_returned_le_qty check (returned_quantity <= quantity)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);
create index sale_items_batch_idx on public.sale_items (batch_id);
create index sale_items_pharmacy_idx on public.sale_items (pharmacy_id);

create table public.sale_returns (
  id             uuid primary key default gen_random_uuid(),
  pharmacy_id    uuid not null references public.pharmacies (id) on delete cascade,
  sale_id        uuid not null references public.sales (id),
  return_no      text not null,
  reason         text not null check (reason in ('customer_request', 'wrong_item', 'damaged', 'expired', 'adverse_reaction', 'other')),
  notes          text,
  refund_amount  numeric(12,2) not null check (refund_amount >= 0),
  refund_method  public.payment_method not null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (pharmacy_id, return_no)
);
create index sale_returns_sale_idx on public.sale_returns (sale_id);
create index sale_returns_pharmacy_time_idx on public.sale_returns (pharmacy_id, created_at desc);
create index sale_returns_created_by_idx on public.sale_returns (created_by);

create table public.sale_return_items (
  id            uuid primary key default gen_random_uuid(),
  return_id     uuid not null references public.sale_returns (id) on delete cascade,
  pharmacy_id   uuid not null references public.pharmacies (id) on delete cascade,
  sale_item_id  uuid not null references public.sale_items (id),
  quantity      int not null check (quantity > 0),
  restocked     boolean not null,
  refund_amount numeric(12,2) not null check (refund_amount >= 0)
);
create index sale_return_items_return_idx on public.sale_return_items (return_id);
create index sale_return_items_sale_item_idx on public.sale_return_items (sale_item_id);
create index sale_return_items_pharmacy_idx on public.sale_return_items (pharmacy_id);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete cascade, -- null = whole pharmacy
  kind        text not null check (kind in ('expired', 'expiring', 'low_stock', 'out_of_stock', 'payment_due', 'system')),
  severity    text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title       text not null,
  body        text,
  link        text,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_pharmacy_time_idx on public.notifications (pharmacy_id, created_at desc);
create index notifications_user_idx on public.notifications (user_id);
create unique index notifications_dedupe on public.notifications (pharmacy_id, dedupe_key) where dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- Audit log (append-only; written by RPCs and triggers)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  pharmacy_id uuid references public.pharmacies (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_pharmacy_time_idx on public.audit_logs (pharmacy_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

create or replace function private.audit(
  p_pharmacy_id uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (pharmacy_id, actor_id, action, entity, entity_id, details)
  values (p_pharmacy_id, (select auth.uid()), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Catalogue changes made directly through the API are audited by trigger.
create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_old jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  -- Rows removed by a cascading tenant delete have no pharmacy left to log against.
  if not exists (select 1 from public.pharmacies where id = (v_row->>'pharmacy_id')::uuid) then
    return null;
  end if;
  perform private.audit(
    (v_row->>'pharmacy_id')::uuid, lower(tg_op), tg_table_name, v_row->>'id',
    case when tg_op = 'UPDATE' then
      (select coalesce(jsonb_object_agg(k, jsonb_build_object('from', v_old->k, 'to', v_row->k)), '{}'::jsonb)
         from jsonb_object_keys(v_row) k
        where k not in ('updated_at') and v_row->k is distinct from v_old->k)
    else v_row end
  );
  return null;
end;
$$;

create trigger products_audit after insert or update or delete on public.products
  for each row execute function private.audit_row_change();
create trigger suppliers_audit after insert or update or delete on public.suppliers
  for each row execute function private.audit_row_change();
create trigger members_audit after insert or update or delete on public.pharmacy_members
  for each row execute function private.audit_row_change();
create trigger branches_audit after insert or update or delete on public.branches
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- AI usage log (no prompt content stored — only metadata for quotas/billing)
-- ---------------------------------------------------------------------------
create table public.ai_requests (
  id            bigint generated always as identity primary key,
  pharmacy_id   uuid not null references public.pharmacies (id) on delete cascade,
  user_id       uuid references public.profiles (id) on delete set null,
  feature       text not null,
  status        text not null check (status in ('ok', 'error', 'rejected')),
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz not null default now()
);
create index ai_requests_pharmacy_time_idx on public.ai_requests (pharmacy_id, created_at desc);
create index ai_requests_user_idx on public.ai_requests (user_id);
