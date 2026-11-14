-- ============================================================================
-- PharmaTrack Pro — 001 Tenancy, identity and access control
--
-- Multi-tenant model:
--   auth.users 1─1 profiles
--   pharmacies 1─* branches
--   pharmacies *─* profiles  (via pharmacy_members, carrying a role)
--
-- Every business table carries pharmacy_id and is protected by RLS using the
-- helper functions defined here. The database is the security boundary; the
-- frontend only hides UI the user cannot use.
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'manager', 'pharmacist', 'cashier');
create type public.pharmacy_status as enum ('trial', 'active', 'suspended');
create type public.subscription_plan as enum ('free', 'starter', 'pro', 'enterprise');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text not null default '',
  phone             text,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Pharmacies (tenants)
-- ---------------------------------------------------------------------------
create table public.pharmacies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) between 2 and 120),
  legal_name      text,
  gstin           text check (gstin is null or gstin ~ '^[0-9A-Z]{15}$'),
  drug_license_no text,
  phone           text,
  email           text,
  address         text,
  city            text,
  state           text,
  pincode         text,
  logo_path       text,
  status          public.pharmacy_status not null default 'trial',
  plan            public.subscription_plan not null default 'free',
  plan_renews_at  date,
  is_demo         boolean not null default false,
  -- Owner-configurable thresholds. Validated by private.validate_settings().
  settings        jsonb not null default jsonb_build_object(
                    'expiry_warning_days', 90,
                    'expiry_critical_days', 30,
                    'low_stock_default', 10,
                    'slow_moving_days', 45,
                    'dead_stock_days', 120,
                    'max_discount_pct', 20,
                    'cashier_max_discount_pct', 5,
                    'invoice_prefix', 'INV',
                    'prices_include_tax', true
                  ),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pharmacies_status_idx on public.pharmacies (status);
create index pharmacies_created_by_idx on public.pharmacies (created_by);

create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  address     text,
  phone       text,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (pharmacy_id, name)
);
create index branches_pharmacy_idx on public.branches (pharmacy_id);
create unique index branches_one_default on public.branches (pharmacy_id) where is_default;

create table public.pharmacy_members (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.member_role not null,
  branch_id   uuid references public.branches (id) on delete set null,  -- null = all branches
  is_active   boolean not null default true,
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (pharmacy_id, user_id)
);
create index pharmacy_members_user_idx on public.pharmacy_members (user_id);
create index pharmacy_members_branch_idx on public.pharmacy_members (branch_id);

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so they can read membership without
-- recursing through RLS; they only ever answer about auth.uid().
-- ---------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;

create or replace function private.member_role(p_pharmacy_id uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select m.role
  from public.pharmacy_members m
  join public.pharmacies ph on ph.id = m.pharmacy_id
  where m.pharmacy_id = p_pharmacy_id
    and m.user_id = (select auth.uid())
    and m.is_active
    and ph.status <> 'suspended';
$$;

create or replace function private.is_member(p_pharmacy_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.member_role(p_pharmacy_id) is not null;
$$;

create or replace function private.has_role(p_pharmacy_id uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.member_role(p_pharmacy_id) = any (p_roles), false);
$$;

-- Raises unless the caller holds one of the roles. Used inside RPCs.
create or replace function private.require_role(p_pharmacy_id uuid, p_roles public.member_role[])
returns public.member_role language plpgsql stable security definer set search_path = '' as $$
declare v_role public.member_role;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  v_role := private.member_role(p_pharmacy_id);
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'You do not have permission to perform this action' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

grant usage on schema private to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Settings validation
-- ---------------------------------------------------------------------------
create or replace function private.validate_settings()
returns trigger language plpgsql set search_path = '' as $$
declare s jsonb := new.settings;
begin
  if (s->>'expiry_warning_days')::int not between 1 and 730
     or (s->>'expiry_critical_days')::int not between 1 and 365
     or (s->>'expiry_critical_days')::int > (s->>'expiry_warning_days')::int
     or (s->>'low_stock_default')::int not between 0 and 100000
     or (s->>'slow_moving_days')::int not between 7 and 365
     or (s->>'dead_stock_days')::int not between 14 and 730
     or (s->>'max_discount_pct')::numeric not between 0 and 100
     or (s->>'cashier_max_discount_pct')::numeric not between 0 and 100
     or (s->>'cashier_max_discount_pct')::numeric > (s->>'max_discount_pct')::numeric
     or coalesce(s->>'invoice_prefix', '') !~ '^[A-Z0-9-]{1,10}$' then
    raise exception 'Invalid pharmacy settings' using errcode = '22023';
  end if;
  return new;
exception when invalid_text_representation or null_value_not_allowed then
  raise exception 'Invalid pharmacy settings' using errcode = '22023';
end;
$$;

create trigger pharmacies_validate_settings
  before insert or update of settings on public.pharmacies
  for each row execute function private.validate_settings();

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger pharmacies_touch before update on public.pharmacies
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profile bootstrap: every auth user gets a profile row.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Users cannot grant themselves platform admin through a profile update.
create or replace function private.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.is_platform_admin := old.is_platform_admin;
    new.email := old.email;
    new.id := old.id;
  end if;
  return new;
end;
$$;

create trigger profiles_protect before update on public.profiles
  for each row execute function private.protect_profile_columns();

-- Pharmacy status/plan/demo flag are controlled by the platform, not tenants.
create or replace function private.protect_pharmacy_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_platform_admin() then
    new.status := old.status;
    new.plan := old.plan;
    new.plan_renews_at := old.plan_renews_at;
    new.is_demo := old.is_demo;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger pharmacies_protect before update on public.pharmacies
  for each row execute function private.protect_pharmacy_columns();
