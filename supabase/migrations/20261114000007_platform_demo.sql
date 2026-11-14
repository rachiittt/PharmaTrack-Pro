-- ============================================================================
-- PharmaTrack Pro — 007 Platform administration, storage, demo tenant
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Platform super-admin RPCs (profiles.is_platform_admin = true)
-- ---------------------------------------------------------------------------
create or replace function private.require_platform_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.platform_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return jsonb_build_object(
    'pharmacies', jsonb_build_object(
      'total', (select count(*) from public.pharmacies where not is_demo),
      'active', (select count(*) from public.pharmacies where status = 'active' and not is_demo),
      'trial', (select count(*) from public.pharmacies where status = 'trial' and not is_demo),
      'suspended', (select count(*) from public.pharmacies where status = 'suspended' and not is_demo),
      'new_30d', (select count(*) from public.pharmacies where created_at >= now() - interval '30 days' and not is_demo)),
    'plans', coalesce((select jsonb_object_agg(plan, n) from (
        select plan, count(*) as n from public.pharmacies where not is_demo group by plan) t), '{}'),
    'users', (select count(*) from public.profiles),
    'sales_30d', jsonb_build_object(
      'bills', (select count(*) from public.sales s join public.pharmacies p on p.id = s.pharmacy_id
                 where not p.is_demo and s.status <> 'cancelled' and s.created_at >= now() - interval '30 days'),
      'gmv', coalesce((select sum(s.total_amount - s.refunded_amount) from public.sales s
                        join public.pharmacies p on p.id = s.pharmacy_id
                       where not p.is_demo and s.status <> 'cancelled' and s.created_at >= now() - interval '30 days'), 0)),
    'ai_requests_30d', (select count(*) from public.ai_requests where created_at >= now() - interval '30 days'),
    'tenants', coalesce((select jsonb_agg(t order by t.created_at desc) from (
        select p.id, p.name, p.city, p.status, p.plan, p.plan_renews_at, p.is_demo, p.created_at,
               (select count(*) from public.pharmacy_members m where m.pharmacy_id = p.id and m.is_active) as members,
               (select count(*) from public.branches b where b.pharmacy_id = p.id) as branches,
               (select count(*) from public.products pr where pr.pharmacy_id = p.id and not pr.is_archived) as products,
               (select max(created_at) from public.sales s where s.pharmacy_id = p.id) as last_sale_at,
               (select pr.email from public.pharmacy_members m join public.profiles pr on pr.id = m.user_id
                 where m.pharmacy_id = p.id and m.role = 'owner' order by m.created_at limit 1) as owner_email
          from public.pharmacies p) t), '[]'),
    'recent_activity', coalesce((select jsonb_agg(t) from (
        select a.created_at, a.action, a.entity, p.name as pharmacy
          from public.audit_logs a left join public.pharmacies p on p.id = a.pharmacy_id
         where a.action in ('pharmacy.create', 'platform.status', 'platform.plan', 'member.invite')
         order by a.created_at desc limit 25) t), '[]'));
end;
$$;

create or replace function public.platform_update_pharmacy(
  p_pharmacy_id uuid, p_status public.pharmacy_status default null,
  p_plan public.subscription_plan default null, p_plan_renews_at date default null, p_reason text default null
) returns public.pharmacies language plpgsql security definer set search_path = '' as $$
declare v_row public.pharmacies;
begin
  perform private.require_platform_admin();
  update public.pharmacies
     set status = coalesce(p_status, status), plan = coalesce(p_plan, plan),
         plan_renews_at = coalesce(p_plan_renews_at, plan_renews_at)
   where id = p_pharmacy_id returning * into v_row;
  if not found then raise exception 'Pharmacy not found' using errcode = 'P0002'; end if;
  perform private.audit(p_pharmacy_id, case when p_status is not null then 'platform.status' else 'platform.plan' end,
    'pharmacies', p_pharmacy_id::text,
    jsonb_build_object('status', p_status, 'plan', p_plan, 'reason', p_reason));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage (only on a real Supabase project; skipped where storage is absent)
--   pharmacy-assets/{pharmacy_id}/logo.png        — logos on invoices
--   purchase-invoices/{pharmacy_id}/{file}        — scanned supplier invoices
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('pharmacy-assets', 'pharmacy-assets', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
           ('purchase-invoices', 'purchase-invoices', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;

    execute $p$
      create policy "tenant files readable by members" on storage.objects for select to authenticated
      using (bucket_id in ('pharmacy-assets', 'purchase-invoices')
             and private.is_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$
      create policy "invoice uploads by inventory staff" on storage.objects for insert to authenticated
      with check (bucket_id = 'purchase-invoices'
                  and private.has_role(((storage.foldername(name))[1])::uuid, '{owner,manager,pharmacist}'))$p$;
    execute $p$
      create policy "logo uploads by owner" on storage.objects for insert to authenticated
      with check (bucket_id = 'pharmacy-assets'
                  and private.has_role(((storage.foldername(name))[1])::uuid, '{owner}'))$p$;
    execute $p$
      create policy "logo updates by owner" on storage.objects for update to authenticated
      using (bucket_id = 'pharmacy-assets'
             and private.has_role(((storage.foldername(name))[1])::uuid, '{owner}'))$p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: stream new sales, stock changes and notifications to open tabs.
-- RLS still applies to realtime subscribers.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.sales, public.medicine_batches;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo tenant
--
-- public.seed_demo_pharmacy() rebuilds one clearly marked demo pharmacy
-- (fixed id, is_demo = true, "[DEMO]" in its name) from scratch. Running it
-- again deletes and recreates only that tenant, so it never duplicates rows
-- and never touches real pharmacies. Only service_role may call it.
-- Stock enters through receive_purchase and leaves through create_sale, so the
-- demo ledger, dashboard and alerts are produced by the same code paths a real
-- pharmacy uses.
-- ---------------------------------------------------------------------------
create or replace function private.ean13(p_body text)
returns text language plpgsql immutable set search_path = '' as $$
declare v_sum int := 0; i int;
begin
  for i in 1..12 loop
    v_sum := v_sum + substr(p_body, i, 1)::int * case when i % 2 = 0 then 3 else 1 end;
  end loop;
  return p_body || ((10 - v_sum % 10) % 10)::text;
end;
$$;

create or replace function private.act_as(p_user uuid)
returns void language sql set search_path = '' as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p_user::text, true);
$$;

create or replace function public.seed_demo_pharmacy(p_owner uuid, p_pharmacist uuid default null, p_cashier uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c_pharmacy constant uuid := 'd0000000-0000-4000-8000-000000000001';
  c_main     constant uuid := 'd0000000-0000-4000-8000-0000000000b1';
  c_branch2  constant uuid := 'd0000000-0000-4000-8000-0000000000b2';
  v_sup uuid[]; v_products uuid[]; v_pid uuid; v_purchase jsonb; v_items jsonb;
  v_sale jsonb; v_sale_ids uuid[] := '{}'; v_i int; v_j int; v_lines int; v_day int;
  v_product record; v_ok int := 0; v_failed int := 0; v_methods text[] := array['cash','cash','upi','upi','card','credit'];
  v_customers text[][] := array[['Anita Verma','9810000001'],['Rohit Mehra','9810000002'],['Sunita Rao','9810000003'],
                                ['Imran Khan','9810000004'],['Kavya Nair','9810000005']];
begin
  if p_owner is null or not exists (select 1 from public.profiles where id = p_owner) then
    raise exception 'Demo owner profile not found' using errcode = 'P0002';
  end if;
  perform setseed(0.4242);

  -- 1. Remove the previous demo tenant (children first; ledger tables use NO ACTION FKs).
  delete from public.stock_movements where pharmacy_id = c_pharmacy;
  delete from public.sale_return_items where pharmacy_id = c_pharmacy;
  delete from public.sale_returns where pharmacy_id = c_pharmacy;
  delete from public.sale_items where pharmacy_id = c_pharmacy;
  delete from public.sales where pharmacy_id = c_pharmacy;
  delete from public.supplier_payments where pharmacy_id = c_pharmacy;
  delete from public.purchase_items where pharmacy_id = c_pharmacy;
  delete from public.purchases where pharmacy_id = c_pharmacy;
  delete from public.medicine_batches where pharmacy_id = c_pharmacy;
  delete from public.pharmacies where id = c_pharmacy;

  -- 2. Tenant, branches, staff
  insert into public.pharmacies (id, name, legal_name, gstin, drug_license_no, phone, email, address, city, state,
                                 pincode, status, plan, is_demo, created_by)
  values (c_pharmacy, '[DEMO] Sanjeevani Pharmacy', 'Sanjeevani Healthcare (Demo)', '07AAACS1234D1Z5',
          'DL-DEMO-20B-0001', '011-40000000', 'demo@pharmatrack.example', '14 Market Road, Lajpat Nagar',
          'New Delhi', 'Delhi', '110024', 'active', 'pro', true, p_owner);
  insert into public.branches (id, pharmacy_id, name, address, is_default) values
    (c_main, c_pharmacy, 'Lajpat Nagar (Main)', '14 Market Road, Lajpat Nagar', true),
    (c_branch2, c_pharmacy, 'Saket', 'Shop 3, PVR Complex, Saket', false);
  insert into public.pharmacy_members (pharmacy_id, user_id, role, invited_by) values (c_pharmacy, p_owner, 'owner', p_owner);
  if p_pharmacist is not null then
    insert into public.pharmacy_members (pharmacy_id, user_id, role, invited_by) values (c_pharmacy, p_pharmacist, 'pharmacist', p_owner);
  end if;
  if p_cashier is not null then
    insert into public.pharmacy_members (pharmacy_id, user_id, role, branch_id, invited_by)
    values (c_pharmacy, p_cashier, 'cashier', c_main, p_owner);
  end if;

  -- 3. Suppliers
  with ins as (
    insert into public.suppliers (pharmacy_id, name, contact_person, phone, email, gstin, payment_terms_days, is_demo)
    values (c_pharmacy, 'Delhi Medico Distributors', 'Vikas Gupta', '9811100001', 'orders@delhimedico.example', '07AABCD1111E1Z1', 30, true),
           (c_pharmacy, 'Apollo Pharma Wholesale', 'Neha Arora', '9811100002', 'sales@apollowholesale.example', '07AABCA2222F1Z2', 21, true),
           (c_pharmacy, 'Shree Ganesh Agencies', 'Mahesh Jain', '9811100003', null, '07AABCS3333G1Z3', 15, true),
           (c_pharmacy, 'MedLife Surgicals', 'Arjun Singh', '9811100004', 'arjun@medlifesurg.example', null, 45, true)
    returning id, name)
  select array_agg(id order by name) into v_sup from ins;

  -- 4. Catalogue (barcodes use the GS1 in-store range 2xxxxxxxxxxx so they cannot clash with real products)
  with ins as (
    insert into public.products (pharmacy_id, name, generic_name, composition, manufacturer, barcode, category, schedule,
                                 hsn_code, gst_rate, unit, pack_size, min_stock_level, rack_location, is_demo, created_by)
    select c_pharmacy, d.name, d.generic, d.comp, d.mfr, private.ean13('2000000' || lpad(d.n::text, 5, '0')),
           d.cat, d.sch, d.hsn, d.gst, d.unit, d.pack, d.minq, d.rack, true, p_owner
      from (values
        (1,  'Dolo 650 Tablet', 'Paracetamol', 'Paracetamol 650 mg', 'Micro Labs', 'Tablet', 'OTC', '3004', 12, 'strip', 15, 40, 'A1'),
        (2,  'Crocin Advance Tablet', 'Paracetamol', 'Paracetamol 500 mg', 'GSK', 'Tablet', 'OTC', '3004', 12, 'strip', 15, 30, 'A1'),
        (3,  'Azithral 500 Tablet', 'Azithromycin', 'Azithromycin 500 mg', 'Alembic', 'Tablet', 'H', '3004', 12, 'strip', 3, 15, 'B2'),
        (4,  'Augmentin 625 Duo Tablet', 'Amoxicillin + Clavulanic Acid', 'Amoxicillin 500 mg + Clavulanic acid 125 mg', 'GSK', 'Tablet', 'H', '3004', 12, 'strip', 10, 15, 'B2'),
        (5,  'Pan 40 Tablet', 'Pantoprazole', 'Pantoprazole 40 mg', 'Alkem', 'Tablet', 'H', '3004', 12, 'strip', 15, 30, 'A3'),
        (6,  'Omez 20 Capsule', 'Omeprazole', 'Omeprazole 20 mg', 'Dr. Reddy''s', 'Capsule', 'H', '3004', 12, 'strip', 20, 20, 'A3'),
        (7,  'Glycomet GP 1 Tablet', 'Glimepiride + Metformin', 'Glimepiride 1 mg + Metformin 500 mg', 'USV', 'Tablet', 'H', '3004', 12, 'strip', 15, 25, 'C1'),
        (8,  'Telma 40 Tablet', 'Telmisartan', 'Telmisartan 40 mg', 'Glenmark', 'Tablet', 'H', '3004', 12, 'strip', 15, 25, 'C1'),
        (9,  'Amlong 5 Tablet', 'Amlodipine', 'Amlodipine 5 mg', 'Micro Labs', 'Tablet', 'H', '3004', 12, 'strip', 15, 20, 'C2'),
        (10, 'Atorva 10 Tablet', 'Atorvastatin', 'Atorvastatin 10 mg', 'Zydus', 'Tablet', 'H', '3004', 12, 'strip', 15, 20, 'C2'),
        (11, 'Thyronorm 50 Tablet', 'Levothyroxine', 'Levothyroxine 50 mcg', 'Abbott', 'Tablet', 'H', '3004', 12, 'bottle', 100, 10, 'C3'),
        (12, 'Montair LC Tablet', 'Montelukast + Levocetirizine', 'Montelukast 10 mg + Levocetirizine 5 mg', 'Cipla', 'Tablet', 'H', '3004', 12, 'strip', 10, 15, 'B1'),
        (13, 'Allegra 120 Tablet', 'Fexofenadine', 'Fexofenadine 120 mg', 'Sanofi', 'Tablet', 'H', '3004', 12, 'strip', 10, 15, 'B1'),
        (14, 'Benadryl Cough Syrup 100 ml', 'Diphenhydramine', 'Diphenhydramine + Ammonium chloride', 'J&J', 'Syrup', 'OTC', '3004', 12, 'bottle', 1, 10, 'D1'),
        (15, 'Ascoril LS Syrup 100 ml', 'Ambroxol + Levosalbutamol', 'Ambroxol + Levosalbutamol + Guaifenesin', 'Glenmark', 'Syrup', 'H', '3004', 12, 'bottle', 1, 10, 'D1'),
        (16, 'Calpol 250 Suspension 60 ml', 'Paracetamol', 'Paracetamol 250 mg/5 ml', 'GSK', 'Suspension', 'OTC', '3004', 12, 'bottle', 1, 8, 'D2'),
        (17, 'Shelcal 500 Tablet', 'Calcium + Vitamin D3', 'Calcium carbonate 1250 mg + Vitamin D3 250 IU', 'Torrent', 'Supplement', 'OTC', '3004', 12, 'strip', 15, 15, 'E1'),
        (18, 'Becosules Capsule', 'Vitamin B-complex', 'B-complex with Vitamin C', 'Pfizer', 'Capsule', 'OTC', '3004', 12, 'strip', 20, 15, 'E1'),
        (19, 'Electral Powder 21 g', 'ORS', 'Oral rehydration salts (WHO)', 'FDC', 'Powder', 'OTC', '3004', 12, 'sachet', 1, 30, 'E2'),
        (20, 'Volini Gel 30 g', 'Diclofenac', 'Diclofenac diethylamine 1.16% w/w', 'Sun Pharma', 'Gel', 'OTC', '3004', 12, 'tube', 1, 8, 'F1'),
        (21, 'Betadine Ointment 20 g', 'Povidone-iodine', 'Povidone-iodine 5% w/w', 'Win-Medicare', 'Ointment', 'OTC', '3004', 12, 'tube', 1, 6, 'F1'),
        (22, 'Candid Cream 15 g', 'Clotrimazole', 'Clotrimazole 1% w/w', 'Glenmark', 'Cream', 'OTC', '3004', 12, 'tube', 1, 6, 'F2'),
        (23, 'Otrivin Nasal Drops 10 ml', 'Xylometazoline', 'Xylometazoline 0.1% w/v', 'GSK', 'Drops', 'OTC', '3004', 12, 'bottle', 1, 6, 'F2'),
        (24, 'Asthalin Inhaler 200 MD', 'Salbutamol', 'Salbutamol 100 mcg/dose', 'Cipla', 'Inhaler', 'H', '3004', 12, 'unit', 1, 5, 'B3'),
        (25, 'Huminsulin R 40 IU Vial', 'Human insulin', 'Regular human insulin 40 IU/ml', 'Lilly', 'Injection', 'H', '3004', 5, 'vial', 1, 4, 'Fridge'),
        (26, 'Accu-Chek Active Strips (50)', null, 'Blood glucose test strips', 'Roche', 'Device', 'OTC', '9027', 12, 'box', 1, 5, 'G1'),
        (27, 'Omron Digital Thermometer', null, 'Digital thermometer MC-246', 'Omron', 'Device', 'OTC', '9025', 18, 'unit', 1, 3, 'G1'),
        (28, 'Surgical Mask 3-Ply (Box of 50)', null, '3-ply non-woven mask', 'MedLife', 'Surgical', 'OTC', '6307', 5, 'box', 1, 5, 'G2'),
        (29, 'Limcee 500 Chewable Tablet', 'Vitamin C', 'Ascorbic acid 500 mg', 'Abbott', 'Supplement', 'OTC', '2936', 18, 'strip', 15, 15, 'E1'),
        (30, 'Cetaphil Gentle Cleanser 125 ml', null, 'Gentle skin cleanser', 'Galderma', 'Personal Care', 'OTC', '3401', 18, 'bottle', 1, 3, 'H1')
      ) as d(n, name, generic, comp, mfr, cat, sch, hsn, gst, unit, pack, minq, rack)
    returning id, barcode)
  select array_agg(id order by barcode) into v_products from ins;

  -- 5. Purchases as the owner, 70 and 25 days ago, through the real RPC.
  perform private.act_as(p_owner);
  for v_i in 1..2 loop
    select jsonb_agg(jsonb_build_object(
             'product_id', p.id,
             'batch_no', upper(substr(md5(p.id::text || v_i), 1, 2)) || (2600 + v_i * 10 + n)::text,
             'mfg_date', (current_date - 200)::text,
             -- a spread of expiries: some within 15/45/80 days, most 8–24 months out
             'expiry_date', (current_date + case when n % 11 = 0 then 15 when n % 7 = 0 then 45
                                                 when n % 5 = 0 then 80 else 240 + n * 17 end)::text,
             'quantity', case when n in (8, 13, 24) and v_i = 2 then 6 else 30 + (n * 7) % 60 end,
             'free_quantity', case when n % 4 = 0 then 5 else 0 end,
             'purchase_price', round(12 + (n * 13.7)::numeric % 180, 2),
             'selling_price', round((12 + (n * 13.7)::numeric % 180) * 1.25, 2),
             'mrp', round((12 + (n * 13.7)::numeric % 180) * 1.35, 2)))
      into v_items
      from (select id, row_number() over (order by barcode)::int as n from public.products where pharmacy_id = c_pharmacy) p
     where (v_i = 1 and p.n <= 22) or (v_i = 2 and p.n > 8);

    v_purchase := public.receive_purchase(c_pharmacy, c_main, v_sup[v_i], 'DEMO-INV-' || (4100 + v_i), current_date - (75 - (v_i - 1) * 45),
                                          v_items, case when v_i = 1 then null else 0 end, 'upi', null, 'Demo purchase', null);
    if v_i = 1 then
      perform public.record_supplier_payment((v_purchase->>'id')::uuid, (v_purchase->>'total_amount')::numeric, 'upi', 'DEMO-UTR-1');
    end if;
    update public.purchases set is_demo = true, created_at = (current_date - (75 - (v_i - 1) * 45))::timestamptz
     where id = (v_purchase->>'id')::uuid;
  end loop;
  update public.stock_movements m set created_at = p.created_at
    from public.purchases p where m.reference_id = p.id and m.pharmacy_id = c_pharmacy;

  -- Smaller stock at the second branch
  select jsonb_agg(jsonb_build_object('product_id', p.id, 'batch_no', 'SK' || (100 + p.n),
           'expiry_date', (current_date + 300)::text, 'quantity', 12, 'purchase_price', 20 + p.n,
           'selling_price', 26 + p.n, 'mrp', 30 + p.n))
    into v_items
    from (select id, row_number() over (order by barcode)::int as n from public.products where pharmacy_id = c_pharmacy) p
   where p.n <= 10;
  v_purchase := public.receive_purchase(c_pharmacy, c_branch2, v_sup[3], 'DEMO-INV-4200', current_date - 20, v_items,
                                        0, 'cash', null, 'Demo purchase (Saket)', null);
  update public.purchases set is_demo = true where id = (v_purchase->>'id')::uuid;

  -- One already-expired batch to demonstrate write-offs (cannot be received through purchases).
  insert into public.medicine_batches (pharmacy_id, branch_id, product_id, supplier_id, batch_no, mfg_date, expiry_date,
                                       purchase_price, selling_price, mrp, quantity, is_demo)
  select c_pharmacy, c_main, v_products[16], v_sup[1], 'EXP2401', current_date - 700, current_date - 12, 28, 35, 38, 7, true;
  insert into public.stock_movements (pharmacy_id, branch_id, product_id, batch_id, movement_type, quantity_change,
                                      balance_after, unit_cost, reference_type, reason, created_by, created_at)
  select pharmacy_id, branch_id, product_id, id, 'opening', 7, 7, 28, 'seed', 'Demo opening stock', p_owner, current_date - 400
    from public.medicine_batches where pharmacy_id = c_pharmacy and batch_no = 'EXP2401';

  -- 6. ~60 days of sales through create_sale, then back-dated.
  for v_day in reverse 59..0 loop
    for v_i in 1..(2 + floor(random() * 5))::int loop
      v_lines := 1 + floor(random() * 3)::int;
      -- Hash-based choices (not random()) so re-seeding yields identical data
      -- regardless of physical row order.
      select jsonb_agg(jsonb_build_object('product_id', x.product_id, 'quantity', 1 + (x.h % 2),
                                          'discount_pct', case when x.h % 7 = 0 then 5 else 0 end))
        into v_items
        from (select b.product_id, abs(hashtext(x2.pos || ':' || v_day || ':' || v_i)) as h
                from public.medicine_batches b
                cross join lateral (select array_position(v_products, b.product_id) as pos) x2
               where b.branch_id = c_main and b.quantity > 4 and b.expiry_date >= current_date
                 -- products 26–30 never sell, so slow-moving / dead-stock alerts have data
                 and x2.pos < 26
               group by b.product_id, x2.pos
               -- skew demand so some products are clearly fast or slow movers
               order by (abs(hashtext(x2.pos || ':' || v_day || ':' || v_i)) % 1000) * (1 + x2.pos % 6), x2.pos
               limit v_lines) x;
      continue when v_items is null;
      begin
        v_sale := public.create_sale(c_pharmacy, c_main, v_items, v_methods[1 + floor(random() * 6)::int]::public.payment_method,
                                     gen_random_uuid(),
                                     case when random() < 0.3 then v_customers[1 + floor(random() * 5)::int][1] end,
                                     case when random() < 0.3 then v_customers[1 + floor(random() * 5)::int][2] end);
        v_sale_ids := v_sale_ids || (v_sale->>'id')::uuid;
        update public.sales
           set created_at = date_trunc('day', now()) - make_interval(days => v_day)
                            + make_interval(hours => 9 + floor(random() * 12)::int, mins => floor(random() * 60)::int),
               created_by = case when p_cashier is not null and random() < 0.5 then p_cashier else p_owner end,
               is_demo = true
         where id = (v_sale->>'id')::uuid;
        update public.stock_movements m set created_at = s.created_at
          from public.sales s where s.id = (v_sale->>'id')::uuid and m.reference_id = s.id;
        v_ok := v_ok + 1;
      exception when others then
        v_failed := v_failed + 1;
      end;
    end loop;
  end loop;

  -- A return and a cancellation so those screens have history.
  if array_length(v_sale_ids, 1) > 10 then
    perform public.process_return(v_sale_ids[5],
      (select jsonb_agg(jsonb_build_object('sale_item_id', id, 'quantity', 1, 'restock', true))
         from (select id from public.sale_items where sale_id = v_sale_ids[5] limit 1) t),
      'customer_request', 'cash', 'Demo return');
    perform public.cancel_sale(v_sale_ids[array_length(v_sale_ids, 1) - 3], 'Billing error (demo)');
  end if;

  perform public.refresh_alert_notifications(c_pharmacy);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  return jsonb_build_object('pharmacy_id', c_pharmacy, 'products', array_length(v_products, 1),
                            'sales', v_ok, 'skipped_sales', v_failed);
end;
$$;

revoke execute on function public.seed_demo_pharmacy(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.seed_demo_pharmacy(uuid, uuid, uuid) to service_role;
revoke execute on function public.platform_overview() from public, anon;
revoke execute on function public.platform_update_pharmacy(uuid, public.pharmacy_status, public.subscription_plan, date, text) from public, anon;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.platform_update_pharmacy(uuid, public.pharmacy_status, public.subscription_plan, date, text) to authenticated;
