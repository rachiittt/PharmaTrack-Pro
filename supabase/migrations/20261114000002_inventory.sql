-- ============================================================================
-- PharmaTrack Pro — 002 Catalogue, batches, suppliers, customers, stock ledger
--
-- Stock lives on medicine_batches (one row per product × branch × batch no).
-- products carry catalogue data only. Every quantity change on a batch is
-- written to stock_movements by the RPCs in migration 004, never directly.
-- ============================================================================

create type public.stock_movement_type as enum (
  'opening', 'purchase', 'sale', 'sale_return', 'sale_cancel',
  'adjustment', 'damage', 'expired_writeoff', 'transfer'
);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  pharmacy_id        uuid not null references public.pharmacies (id) on delete cascade,
  name               text not null check (length(trim(name)) between 2 and 160),
  contact_person     text,
  phone              text,
  email              text,
  gstin              text check (gstin is null or gstin ~ '^[0-9A-Z]{15}$'),
  drug_license_no    text,
  address            text,
  payment_terms_days int not null default 30 check (payment_terms_days between 0 and 365),
  notes              text,
  is_active          boolean not null default true,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index suppliers_pharmacy_idx on public.suppliers (pharmacy_id, is_active);
create unique index suppliers_unique_name on public.suppliers (pharmacy_id, lower(name));
create trigger suppliers_touch before update on public.suppliers
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Products (catalogue)
-- ---------------------------------------------------------------------------
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  pharmacy_id         uuid not null references public.pharmacies (id) on delete cascade,
  name                text not null check (length(trim(name)) between 2 and 200),
  generic_name        text,
  composition         text,
  manufacturer        text,
  barcode             text check (barcode is null or barcode ~ '^[0-9A-Za-z\-\.]{4,64}$'),
  category            text not null default 'Tablet' check (category in (
                        'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Drops',
                        'Ointment', 'Cream', 'Gel', 'Inhaler', 'Powder', 'Device',
                        'Surgical', 'Supplement', 'Personal Care', 'Other')),
  schedule            text not null default 'OTC' check (schedule in ('OTC', 'H', 'H1', 'X', 'G')),
  hsn_code            text,
  gst_rate            numeric(5,2) not null default 12 check (gst_rate in (0, 5, 12, 18, 28)),
  unit                text not null default 'strip',
  pack_size           int not null default 1 check (pack_size > 0),
  min_stock_level     int not null default 10 check (min_stock_level >= 0),
  rack_location       text,
  default_supplier_id uuid references public.suppliers (id) on delete set null,
  is_archived         boolean not null default false,
  is_demo             boolean not null default false,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index products_pharmacy_idx on public.products (pharmacy_id, is_archived);
create index products_name_idx on public.products (pharmacy_id, lower(name));
create index products_generic_idx on public.products (pharmacy_id, lower(generic_name));
create index products_supplier_idx on public.products (default_supplier_id);
create unique index products_unique_barcode on public.products (pharmacy_id, barcode)
  where barcode is not null and not is_archived;
create trigger products_touch before update on public.products
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Batches (the unit of stock)
-- ---------------------------------------------------------------------------
create table public.medicine_batches (
  id             uuid primary key default gen_random_uuid(),
  pharmacy_id    uuid not null references public.pharmacies (id) on delete cascade,
  branch_id      uuid not null references public.branches (id),
  product_id     uuid not null references public.products (id),
  supplier_id    uuid references public.suppliers (id) on delete set null,
  batch_no       text not null check (length(trim(batch_no)) between 1 and 40),
  mfg_date       date,
  expiry_date    date not null,
  purchase_price numeric(12,2) not null check (purchase_price >= 0),
  selling_price  numeric(12,2) not null check (selling_price >= 0),
  mrp            numeric(12,2) not null check (mrp > 0),
  quantity       int not null default 0 check (quantity >= 0),
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint batch_price_le_mrp check (selling_price <= mrp),
  constraint batch_dates check (mfg_date is null or mfg_date < expiry_date),
  unique (branch_id, product_id, batch_no)
);
create index batches_pharmacy_idx on public.medicine_batches (pharmacy_id);
create index batches_product_fefo_idx on public.medicine_batches (product_id, branch_id, expiry_date)
  where quantity > 0;
create index batches_expiry_idx on public.medicine_batches (pharmacy_id, expiry_date) where quantity > 0;
create index batches_supplier_idx on public.medicine_batches (supplier_id);
create trigger batches_touch before update on public.medicine_batches
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Customers (kept minimal: only what a bill needs)
-- ---------------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  phone       text,
  notes       text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index customers_pharmacy_idx on public.customers (pharmacy_id);
create unique index customers_unique_phone on public.customers (pharmacy_id, phone) where phone is not null;

-- ---------------------------------------------------------------------------
-- Stock ledger (append-only)
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id              bigint generated always as identity primary key,
  pharmacy_id     uuid not null references public.pharmacies (id) on delete cascade,
  branch_id       uuid not null references public.branches (id),
  product_id      uuid not null references public.products (id),
  batch_id        uuid not null references public.medicine_batches (id),
  movement_type   public.stock_movement_type not null,
  quantity_change int not null check (quantity_change <> 0),
  balance_after   int not null check (balance_after >= 0),
  unit_cost       numeric(12,2),
  reference_type  text check (reference_type in ('purchase', 'sale', 'sale_return', 'adjustment', 'seed')),
  reference_id    uuid,
  reason          text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index stock_movements_pharmacy_time_idx on public.stock_movements (pharmacy_id, created_at desc);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_batch_idx on public.stock_movements (batch_id);
create index stock_movements_branch_idx on public.stock_movements (branch_id);
create index stock_movements_reference_idx on public.stock_movements (reference_type, reference_id);
create index stock_movements_created_by_idx on public.stock_movements (created_by);

-- ---------------------------------------------------------------------------
-- Cross-tenant integrity: child rows must belong to the same pharmacy as the
-- rows they reference. Prevents a crafted insert pointing at another tenant's
-- product/branch even if it passed an RLS check on its own pharmacy_id.
-- ---------------------------------------------------------------------------
create or replace function private.assert_same_pharmacy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'medicine_batches' then
    if not exists (select 1 from public.products where id = new.product_id and pharmacy_id = new.pharmacy_id)
       or not exists (select 1 from public.branches where id = new.branch_id and pharmacy_id = new.pharmacy_id)
       or (new.supplier_id is not null and not exists (
             select 1 from public.suppliers where id = new.supplier_id and pharmacy_id = new.pharmacy_id)) then
      raise exception 'Batch references belong to another pharmacy' using errcode = '42501';
    end if;
  elsif tg_table_name = 'products' then
    if new.default_supplier_id is not null and not exists (
         select 1 from public.suppliers where id = new.default_supplier_id and pharmacy_id = new.pharmacy_id) then
      raise exception 'Supplier belongs to another pharmacy' using errcode = '42501';
    end if;
  elsif tg_table_name = 'pharmacy_members' then
    if new.branch_id is not null and not exists (
         select 1 from public.branches where id = new.branch_id and pharmacy_id = new.pharmacy_id) then
      raise exception 'Branch belongs to another pharmacy' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger batches_same_pharmacy before insert or update on public.medicine_batches
  for each row execute function private.assert_same_pharmacy();
create trigger products_same_pharmacy before insert or update on public.products
  for each row execute function private.assert_same_pharmacy();
create trigger members_same_pharmacy before insert or update on public.pharmacy_members
  for each row execute function private.assert_same_pharmacy();

-- ---------------------------------------------------------------------------
-- Read model: per-product stock totals (respects RLS of the caller)
-- ---------------------------------------------------------------------------
create view public.product_stock with (security_invoker = true) as
select
  p.id                                    as product_id,
  p.pharmacy_id,
  b.branch_id,
  coalesce(sum(b.quantity), 0)::int                                         as total_quantity,
  coalesce(sum(b.quantity) filter (where b.expiry_date >= current_date), 0)::int as sellable_quantity,
  coalesce(sum(b.quantity) filter (where b.expiry_date < current_date), 0)::int  as expired_quantity,
  min(b.expiry_date) filter (where b.quantity > 0 and b.expiry_date >= current_date) as next_expiry,
  coalesce(sum(b.quantity * b.purchase_price), 0)::numeric(14,2)            as stock_value_cost,
  coalesce(sum(b.quantity * b.mrp), 0)::numeric(14,2)                       as stock_value_mrp,
  count(b.id) filter (where b.quantity > 0)::int                            as active_batches
from public.products p
left join public.medicine_batches b on b.product_id = p.id
where not p.is_archived
group by p.id, p.pharmacy_id, b.branch_id;
