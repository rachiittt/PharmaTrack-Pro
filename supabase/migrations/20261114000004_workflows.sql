-- ============================================================================
-- PharmaTrack Pro — 004 Transactional workflows (RPCs)
--
-- Every function here runs in a single transaction, checks the caller's role
-- with private.require_role(), locks the batch rows it touches (FOR UPDATE),
-- writes stock_movements + audit_logs, and never trusts client-side prices.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Batch quantity may only change inside these RPCs (which run as the owner
-- role), never through a direct PATCH from the API.
create or replace function private.guard_batch_quantity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.quantity is distinct from old.quantity
          or new.product_id is distinct from old.product_id
          or new.branch_id is distinct from old.branch_id
          or new.pharmacy_id is distinct from old.pharmacy_id) then
    raise exception 'Stock quantity can only change through purchases, sales, returns or adjustments'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger batches_guard_quantity before update on public.medicine_batches
  for each row execute function private.guard_batch_quantity();

-- A pharmacy must always keep at least one active owner.
create or replace function private.keep_an_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pharmacy uuid := coalesce(old.pharmacy_id, new.pharmacy_id);
begin
  if old.role = 'owner' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.is_active)
     and exists (select 1 from public.pharmacies where id = v_pharmacy)
     and not exists (
       select 1 from public.pharmacy_members
        where pharmacy_id = v_pharmacy and role = 'owner' and is_active and id <> old.id) then
    raise exception 'A pharmacy must keep at least one active owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger members_keep_owner before update or delete on public.pharmacy_members
  for each row execute function private.keep_an_owner();

-- Staff restricted to one branch cannot transact on another.
create or replace function private.require_branch(p_pharmacy_id uuid, p_branch_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_member_branch uuid;
begin
  if not exists (select 1 from public.branches
                  where id = p_branch_id and pharmacy_id = p_pharmacy_id and is_active) then
    raise exception 'Branch not found' using errcode = 'P0002';
  end if;
  select branch_id into v_member_branch from public.pharmacy_members
   where pharmacy_id = p_pharmacy_id and user_id = (select auth.uid());
  if v_member_branch is not null and v_member_branch <> p_branch_id then
    raise exception 'You are assigned to a different branch' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.financial_year(p_date date default current_date)
returns text language sql immutable set search_path = '' as $$
  select case when extract(month from p_date) >= 4
    then extract(year from p_date)::int || '-' || lpad(((extract(year from p_date)::int + 1) % 100)::text, 2, '0')
    else (extract(year from p_date)::int - 1) || '-' || lpad((extract(year from p_date)::int % 100)::text, 2, '0')
  end;
$$;

create or replace function private.next_document_no(p_pharmacy_id uuid, p_kind text, p_prefix text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_fy text := private.financial_year(); v_next int;
begin
  insert into public.document_sequences as s (pharmacy_id, kind, fy, last_value)
  values (p_pharmacy_id, p_kind, v_fy, 1)
  on conflict (pharmacy_id, kind, fy) do update set last_value = s.last_value + 1
  returning last_value into v_next;
  return p_prefix || '/' || v_fy || '/' || lpad(v_next::text, 5, '0');
end;
$$;

create or replace function private.setting(p_pharmacy_id uuid, p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select settings->>p_key from public.pharmacies where id = p_pharmacy_id;
$$;

create or replace function private.record_movement(
  p_batch public.medicine_batches, p_type public.stock_movement_type, p_change int,
  p_ref_type text, p_ref_id uuid, p_reason text default null
) returns void language sql security definer set search_path = '' as $$
  insert into public.stock_movements
    (pharmacy_id, branch_id, product_id, batch_id, movement_type, quantity_change,
     balance_after, unit_cost, reference_type, reference_id, reason, created_by)
  values
    (p_batch.pharmacy_id, p_batch.branch_id, p_batch.product_id, p_batch.id, p_type, p_change,
     p_batch.quantity, p_batch.purchase_price, p_ref_type, p_ref_id, p_reason, (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Onboarding: create a pharmacy with a default branch and the caller as owner
-- ---------------------------------------------------------------------------
create or replace function public.create_pharmacy(
  p_name text, p_phone text default null, p_gstin text default null,
  p_address text default null, p_city text default null, p_state text default null,
  p_branch_name text default 'Main Store'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_pharmacy uuid; v_branch uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select count(*) from public.pharmacy_members where user_id = v_uid and role = 'owner') >= 5 then
    raise exception 'Pharmacy limit reached for this account' using errcode = '54000';
  end if;

  insert into public.pharmacies (name, phone, gstin, address, city, state, created_by)
  values (trim(p_name), nullif(trim(p_phone), ''), nullif(upper(trim(p_gstin)), ''),
          nullif(trim(p_address), ''), nullif(trim(p_city), ''), nullif(trim(p_state), ''), v_uid)
  returning id into v_pharmacy;

  insert into public.branches (pharmacy_id, name, address, phone, is_default)
  values (v_pharmacy, coalesce(nullif(trim(p_branch_name), ''), 'Main Store'), p_address, p_phone, true)
  returning id into v_branch;

  insert into public.pharmacy_members (pharmacy_id, user_id, role, invited_by)
  values (v_pharmacy, v_uid, 'owner', v_uid);

  perform private.audit(v_pharmacy, 'pharmacy.create', 'pharmacies', v_pharmacy::text,
                        jsonb_build_object('name', p_name));
  return v_pharmacy;
end;
$$;

-- ---------------------------------------------------------------------------
-- Add stock without a purchase (opening stock when onboarding)
-- ---------------------------------------------------------------------------
create or replace function public.add_opening_stock(
  p_product_id uuid, p_branch_id uuid, p_batch_no text, p_expiry_date date,
  p_quantity int, p_purchase_price numeric, p_selling_price numeric, p_mrp numeric,
  p_mfg_date date default null, p_supplier_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_product public.products; v_batch public.medicine_batches;
begin
  select * into v_product from public.products where id = p_product_id and not is_archived;
  if not found then raise exception 'Product not found' using errcode = 'P0002'; end if;
  perform private.require_role(v_product.pharmacy_id, array['owner', 'manager', 'pharmacist']::public.member_role[]);
  perform private.require_branch(v_product.pharmacy_id, p_branch_id);
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero' using errcode = '22023';
  end if;
  if p_expiry_date <= current_date then
    raise exception 'Cannot add stock that is already expired' using errcode = '22023';
  end if;

  select * into v_batch from public.medicine_batches
   where branch_id = p_branch_id and product_id = p_product_id and batch_no = trim(p_batch_no)
   for update;

  if found then
    if v_batch.expiry_date <> p_expiry_date then
      raise exception 'Batch % already exists with expiry %', v_batch.batch_no, v_batch.expiry_date
        using errcode = '23505';
    end if;
    update public.medicine_batches
       set quantity = quantity + p_quantity, purchase_price = p_purchase_price,
           selling_price = p_selling_price, mrp = p_mrp
     where id = v_batch.id returning * into v_batch;
  else
    insert into public.medicine_batches
      (pharmacy_id, branch_id, product_id, supplier_id, batch_no, mfg_date, expiry_date,
       purchase_price, selling_price, mrp, quantity)
    values
      (v_product.pharmacy_id, p_branch_id, p_product_id, p_supplier_id, trim(p_batch_no), p_mfg_date,
       p_expiry_date, p_purchase_price, p_selling_price, p_mrp, p_quantity)
    returning * into v_batch;
  end if;

  perform private.record_movement(v_batch, 'opening', p_quantity, 'adjustment', v_batch.id, 'Opening stock');
  perform private.audit(v_product.pharmacy_id, 'stock.opening', 'medicine_batches', v_batch.id::text,
    jsonb_build_object('product', v_product.name, 'batch_no', v_batch.batch_no, 'quantity', p_quantity));
  return v_batch.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual stock adjustment (damage, write-off, count correction)
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_batch_id uuid, p_quantity_change int, p_type public.stock_movement_type, p_reason text
) returns public.medicine_batches language plpgsql security definer set search_path = '' as $$
declare v_batch public.medicine_batches;
begin
  select * into v_batch from public.medicine_batches where id = p_batch_id for update;
  if not found then raise exception 'Batch not found' using errcode = 'P0002'; end if;
  perform private.require_role(v_batch.pharmacy_id, array['owner', 'manager', 'pharmacist']::public.member_role[]);
  perform private.require_branch(v_batch.pharmacy_id, v_batch.branch_id);

  if p_type not in ('adjustment', 'damage', 'expired_writeoff') then
    raise exception 'Invalid adjustment type' using errcode = '22023';
  end if;
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Adjustment quantity cannot be zero' using errcode = '22023';
  end if;
  if p_type in ('damage', 'expired_writeoff') and p_quantity_change > 0 then
    raise exception 'Write-offs must reduce stock' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'A reason is required for stock adjustments' using errcode = '22023';
  end if;
  if v_batch.quantity + p_quantity_change < 0 then
    raise exception 'Only % units are in stock for batch %', v_batch.quantity, v_batch.batch_no
      using errcode = '22023';
  end if;

  update public.medicine_batches set quantity = quantity + p_quantity_change
   where id = p_batch_id returning * into v_batch;
  perform private.record_movement(v_batch, p_type, p_quantity_change, 'adjustment', v_batch.id, trim(p_reason));
  perform private.audit(v_batch.pharmacy_id, 'stock.adjust', 'medicine_batches', v_batch.id::text,
    jsonb_build_object('change', p_quantity_change, 'type', p_type, 'reason', p_reason));
  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchase receiving: creates/updates batches, ledger, payable
-- p_items: [{product_id, batch_no, expiry_date, mfg_date?, quantity, free_quantity?,
--            purchase_price, selling_price, mrp, gst_rate?}]
-- ---------------------------------------------------------------------------
create or replace function public.receive_purchase(
  p_pharmacy_id uuid, p_branch_id uuid, p_supplier_id uuid, p_supplier_invoice_no text,
  p_invoice_date date, p_items jsonb, p_amount_paid numeric default 0,
  p_payment_method public.payment_method default 'cash', p_due_date date default null,
  p_notes text default null, p_invoice_file_path text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_purchase public.purchases;
  v_product public.products;
  v_batch public.medicine_batches;
  v_item jsonb;
  v_qty int; v_free int; v_price numeric; v_sell numeric; v_mrp numeric; v_gst numeric;
  v_expiry date; v_batch_no text;
  v_subtotal numeric := 0; v_tax numeric := 0; v_line_tax numeric;
begin
  perform private.require_role(p_pharmacy_id, array['owner', 'manager', 'pharmacist']::public.member_role[]);
  perform private.require_branch(p_pharmacy_id, p_branch_id);

  if not exists (select 1 from public.suppliers where id = p_supplier_id and pharmacy_id = p_pharmacy_id) then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the purchase' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 300 then
    raise exception 'A purchase can have at most 300 lines' using errcode = '22023';
  end if;
  if p_invoice_date > current_date then
    raise exception 'Invoice date cannot be in the future' using errcode = '22023';
  end if;
  if coalesce(p_amount_paid, 0) < 0 then
    raise exception 'Amount paid cannot be negative' using errcode = '22023';
  end if;

  insert into public.purchases
    (pharmacy_id, branch_id, supplier_id, reference_no, supplier_invoice_no, invoice_date, due_date,
     subtotal, tax_amount, total_amount, notes, invoice_file_path, created_by)
  values
    (p_pharmacy_id, p_branch_id, p_supplier_id, private.next_document_no(p_pharmacy_id, 'purchase', 'GRN'),
     trim(p_supplier_invoice_no), p_invoice_date,
     coalesce(p_due_date, p_invoice_date + (select payment_terms_days from public.suppliers where id = p_supplier_id)),
     0, 0, 0, p_notes, p_invoice_file_path, (select auth.uid()))
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid and pharmacy_id = p_pharmacy_id and not is_archived;
    if not found then raise exception 'Product not found in this pharmacy' using errcode = 'P0002'; end if;

    v_batch_no := nullif(trim(v_item->>'batch_no'), '');
    v_expiry := (v_item->>'expiry_date')::date;
    v_qty := (v_item->>'quantity')::int;
    v_free := coalesce((v_item->>'free_quantity')::int, 0);
    v_price := (v_item->>'purchase_price')::numeric;
    v_sell := (v_item->>'selling_price')::numeric;
    v_mrp := (v_item->>'mrp')::numeric;
    v_gst := coalesce((v_item->>'gst_rate')::numeric, v_product.gst_rate);

    if v_batch_no is null then raise exception 'Batch number is required for %', v_product.name using errcode = '22023'; end if;
    if v_expiry is null or v_expiry <= current_date then
      raise exception 'Batch % of % is expired or missing an expiry date', v_batch_no, v_product.name using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 or v_free < 0 then
      raise exception 'Invalid quantity for %', v_product.name using errcode = '22023';
    end if;
    if v_price is null or v_price < 0 or v_mrp is null or v_mrp <= 0 or v_sell is null or v_sell < 0 or v_sell > v_mrp then
      raise exception 'Invalid prices for % (selling price must not exceed MRP)', v_product.name using errcode = '22023';
    end if;

    select * into v_batch from public.medicine_batches
     where branch_id = p_branch_id and product_id = v_product.id and batch_no = v_batch_no
     for update;

    if found then
      if v_batch.expiry_date <> v_expiry then
        raise exception 'Batch % of % already exists with expiry %', v_batch_no, v_product.name, v_batch.expiry_date
          using errcode = '23505';
      end if;
      update public.medicine_batches
         set quantity = quantity + v_qty + v_free, purchase_price = v_price, selling_price = v_sell,
             mrp = v_mrp, supplier_id = p_supplier_id,
             mfg_date = coalesce((v_item->>'mfg_date')::date, mfg_date)
       where id = v_batch.id returning * into v_batch;
    else
      insert into public.medicine_batches
        (pharmacy_id, branch_id, product_id, supplier_id, batch_no, mfg_date, expiry_date,
         purchase_price, selling_price, mrp, quantity)
      values
        (p_pharmacy_id, p_branch_id, v_product.id, p_supplier_id, v_batch_no, (v_item->>'mfg_date')::date,
         v_expiry, v_price, v_sell, v_mrp, v_qty + v_free)
      returning * into v_batch;
    end if;

    v_line_tax := round(v_qty * v_price * v_gst / 100, 2);
    insert into public.purchase_items
      (purchase_id, pharmacy_id, product_id, batch_id, batch_no, mfg_date, expiry_date, quantity,
       free_quantity, purchase_price, selling_price, mrp, gst_rate, tax_amount, line_total)
    values
      (v_purchase.id, p_pharmacy_id, v_product.id, v_batch.id, v_batch_no, (v_item->>'mfg_date')::date,
       v_expiry, v_qty, v_free, v_price, v_sell, v_mrp, v_gst, v_line_tax, round(v_qty * v_price, 2) + v_line_tax);

    v_subtotal := v_subtotal + round(v_qty * v_price, 2);
    v_tax := v_tax + v_line_tax;

    perform private.record_movement(v_batch, 'purchase', v_qty + v_free, 'purchase', v_purchase.id,
                                    'Invoice ' || p_supplier_invoice_no);

    if v_product.default_supplier_id is null then
      update public.products set default_supplier_id = p_supplier_id where id = v_product.id;
    end if;
  end loop;

  if coalesce(p_amount_paid, 0) > v_subtotal + v_tax then
    raise exception 'Amount paid exceeds the invoice total' using errcode = '22023';
  end if;

  update public.purchases
     set subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_subtotal + v_tax,
         amount_paid = coalesce(p_amount_paid, 0),
         payment_status = case when coalesce(p_amount_paid, 0) = 0 then 'unpaid'::public.payment_status
                               when p_amount_paid >= v_subtotal + v_tax then 'paid'::public.payment_status
                               else 'partial'::public.payment_status end
   where id = v_purchase.id returning * into v_purchase;

  if coalesce(p_amount_paid, 0) > 0 then
    insert into public.supplier_payments (pharmacy_id, supplier_id, purchase_id, amount, method, paid_on, created_by)
    values (p_pharmacy_id, p_supplier_id, v_purchase.id, p_amount_paid, p_payment_method, p_invoice_date, (select auth.uid()));
  end if;

  perform private.audit(p_pharmacy_id, 'purchase.receive', 'purchases', v_purchase.id::text,
    jsonb_build_object('reference_no', v_purchase.reference_no, 'supplier_invoice_no', p_supplier_invoice_no,
                       'total', v_purchase.total_amount, 'lines', jsonb_array_length(p_items)));
  return to_jsonb(v_purchase);
end;
$$;

create or replace function public.record_supplier_payment(
  p_purchase_id uuid, p_amount numeric, p_method public.payment_method,
  p_reference text default null, p_notes text default null
) returns public.purchases language plpgsql security definer set search_path = '' as $$
declare v_purchase public.purchases;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase not found' using errcode = 'P0002'; end if;
  perform private.require_role(v_purchase.pharmacy_id, array['owner', 'manager']::public.member_role[]);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive' using errcode = '22023';
  end if;
  if p_amount > v_purchase.total_amount - v_purchase.amount_paid then
    raise exception 'Payment exceeds the outstanding amount of %', v_purchase.total_amount - v_purchase.amount_paid
      using errcode = '22023';
  end if;

  insert into public.supplier_payments (pharmacy_id, supplier_id, purchase_id, amount, method, reference, notes, created_by)
  values (v_purchase.pharmacy_id, v_purchase.supplier_id, p_purchase_id, p_amount, p_method, p_reference, p_notes, (select auth.uid()));

  update public.purchases
     set amount_paid = amount_paid + p_amount,
         payment_status = case when amount_paid + p_amount >= total_amount then 'paid'::public.payment_status
                               else 'partial'::public.payment_status end
   where id = p_purchase_id returning * into v_purchase;

  perform private.audit(v_purchase.pharmacy_id, 'purchase.payment', 'purchases', p_purchase_id::text,
                        jsonb_build_object('amount', p_amount, 'method', p_method));
  return v_purchase;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sale (POS checkout)
-- p_items: [{product_id, quantity, discount_pct?, batch_id?}]
--   * Prices come from the batch, never from the client.
--   * Without batch_id, stock is allocated FEFO across non-expired batches.
--   * Retrying with the same idempotency key returns the original sale.
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(
  p_pharmacy_id uuid, p_branch_id uuid, p_items jsonb, p_payment_method public.payment_method,
  p_idempotency_key uuid, p_customer_name text default null, p_customer_phone text default null,
  p_doctor_name text default null, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role public.member_role;
  v_sale public.sales;
  v_existing uuid;
  v_item jsonb;
  v_product public.products;
  v_batch public.medicine_batches;
  v_remaining int; v_take int; v_disc numeric; v_max_disc numeric;
  v_gross numeric; v_line numeric; v_taxable numeric; v_inclusive boolean;
  v_subtotal numeric := 0; v_discount numeric := 0; v_taxable_sum numeric := 0; v_tax_sum numeric := 0;
  v_total numeric; v_customer uuid; v_prefix text;
begin
  v_role := private.require_role(p_pharmacy_id, array['owner', 'manager', 'pharmacist', 'cashier']::public.member_role[]);
  perform private.require_branch(p_pharmacy_id, p_branch_id);

  if p_idempotency_key is null then
    raise exception 'Missing idempotency key' using errcode = '22023';
  end if;
  select id into v_existing from public.sales where pharmacy_id = p_pharmacy_id and idempotency_key = p_idempotency_key;
  if found then return public.get_sale(v_existing); end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The bill has no items' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'A bill can have at most 100 lines' using errcode = '22023';
  end if;

  v_max_disc := case when v_role = 'cashier'
                     then private.setting(p_pharmacy_id, 'cashier_max_discount_pct')::numeric
                     else private.setting(p_pharmacy_id, 'max_discount_pct')::numeric end;
  v_inclusive := coalesce(private.setting(p_pharmacy_id, 'prices_include_tax')::boolean, true);
  v_prefix := coalesce(private.setting(p_pharmacy_id, 'invoice_prefix'), 'INV');

  if nullif(trim(p_customer_phone), '') is not null then
    insert into public.customers (pharmacy_id, name, phone)
    values (p_pharmacy_id, coalesce(nullif(trim(p_customer_name), ''), 'Walk-in'), trim(p_customer_phone))
    on conflict (pharmacy_id, phone) where phone is not null
      do update set name = coalesce(nullif(trim(excluded.name), 'Walk-in'), public.customers.name)
    returning id into v_customer;
  end if;

  begin
    insert into public.sales
      (pharmacy_id, branch_id, invoice_no, customer_id, customer_name, customer_phone, doctor_name,
       subtotal, discount_amount, taxable_amount, tax_amount, total_amount, payment_method,
       idempotency_key, notes, created_by)
    values
      (p_pharmacy_id, p_branch_id, private.next_document_no(p_pharmacy_id, 'sale', v_prefix), v_customer,
       nullif(trim(p_customer_name), ''), nullif(trim(p_customer_phone), ''), nullif(trim(p_doctor_name), ''),
       0, 0, 0, 0, 0, p_payment_method, p_idempotency_key, p_notes, (select auth.uid()))
    returning * into v_sale;
  exception when unique_violation then
    -- A concurrent request with the same key won the race.
    select id into v_existing from public.sales where pharmacy_id = p_pharmacy_id and idempotency_key = p_idempotency_key;
    if found then return public.get_sale(v_existing); end if;
    raise;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid and pharmacy_id = p_pharmacy_id and not is_archived;
    if not found then raise exception 'Product not found in this pharmacy' using errcode = 'P0002'; end if;

    v_remaining := (v_item->>'quantity')::int;
    if v_remaining is null or v_remaining <= 0 or v_remaining > 10000 then
      raise exception 'Invalid quantity for %', v_product.name using errcode = '22023';
    end if;
    v_disc := coalesce((v_item->>'discount_pct')::numeric, 0);
    if v_disc < 0 or v_disc > v_max_disc then
      raise exception 'Discount on % exceeds your limit of %%%', v_product.name, v_max_disc using errcode = '42501';
    end if;

    for v_batch in
      select * from public.medicine_batches
       where product_id = v_product.id and branch_id = p_branch_id and quantity > 0
         and expiry_date >= current_date
         and (v_item->>'batch_id' is null or id = (v_item->>'batch_id')::uuid)
       order by expiry_date, created_at
       for update
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, v_batch.quantity);

      update public.medicine_batches set quantity = quantity - v_take
       where id = v_batch.id returning * into v_batch;
      perform private.record_movement(v_batch, 'sale', -v_take, 'sale', v_sale.id, v_sale.invoice_no);

      v_gross := round(v_batch.selling_price * v_take, 2);
      v_line := round(v_gross * (1 - v_disc / 100), 2);
      if v_inclusive then
        v_taxable := round(v_line / (1 + v_product.gst_rate / 100), 2);
      else
        v_taxable := v_line;
        v_line := round(v_taxable * (1 + v_product.gst_rate / 100), 2);
      end if;

      insert into public.sale_items
        (sale_id, pharmacy_id, product_id, batch_id, product_name, batch_no, expiry_date, quantity,
         unit_price, mrp, unit_cost, discount_pct, gst_rate, taxable_amount, tax_amount, line_total)
      values
        (v_sale.id, p_pharmacy_id, v_product.id, v_batch.id, v_product.name, v_batch.batch_no, v_batch.expiry_date,
         v_take, v_batch.selling_price, v_batch.mrp, v_batch.purchase_price, v_disc, v_product.gst_rate,
         v_taxable, v_line - v_taxable, v_line);

      v_subtotal := v_subtotal + v_gross;
      v_discount := v_discount + (v_gross - round(v_gross * (1 - v_disc / 100), 2));
      v_taxable_sum := v_taxable_sum + v_taxable;
      v_tax_sum := v_tax_sum + (v_line - v_taxable);
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      raise exception 'Insufficient stock for %: % more unit(s) needed', v_product.name, v_remaining
        using errcode = '22023';
    end if;
  end loop;

  v_total := round(v_taxable_sum + v_tax_sum);
  update public.sales
     set subtotal = v_subtotal, discount_amount = v_discount, taxable_amount = v_taxable_sum,
         tax_amount = v_tax_sum, round_off = v_total - (v_taxable_sum + v_tax_sum), total_amount = v_total
   where id = v_sale.id returning * into v_sale;

  perform private.audit(p_pharmacy_id, 'sale.create', 'sales', v_sale.id::text,
    jsonb_build_object('invoice_no', v_sale.invoice_no, 'total', v_total, 'payment_method', p_payment_method));
  return public.get_sale(v_sale.id);
end;
$$;

-- Full sale document (header + items + returns) for invoices and history.
create or replace function public.get_sale(p_sale_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_sale public.sales; v_result jsonb;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found or not private.is_member(v_sale.pharmacy_id) then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;
  select to_jsonb(v_sale)
    || jsonb_build_object(
         'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.product_name, i.expiry_date)
                              from public.sale_items i where i.sale_id = v_sale.id), '[]'::jsonb),
         'returns', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
                                from public.sale_returns r where r.sale_id = v_sale.id), '[]'::jsonb),
         'created_by_name', (select full_name from public.profiles where id = v_sale.created_by),
         'pharmacy', (select jsonb_build_object('name', name, 'gstin', gstin, 'drug_license_no', drug_license_no,
                                                'phone', phone, 'address', address, 'city', city, 'state', state)
                        from public.pharmacies where id = v_sale.pharmacy_id),
         'branch', (select jsonb_build_object('name', name, 'address', address, 'phone', phone)
                      from public.branches where id = v_sale.branch_id))
    into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Returns: p_items [{sale_item_id, quantity, restock}]
-- ---------------------------------------------------------------------------
create or replace function public.process_return(
  p_sale_id uuid, p_items jsonb, p_reason text, p_refund_method public.payment_method,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales; v_return public.sale_returns; v_si public.sale_items;
  v_batch public.medicine_batches; v_item jsonb; v_qty int; v_restock boolean;
  v_refund numeric; v_total_refund numeric := 0; v_all_returned boolean;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  perform private.require_role(v_sale.pharmacy_id, array['owner', 'manager', 'pharmacist']::public.member_role[]);
  if v_sale.status = 'cancelled' then raise exception 'This sale was cancelled' using errcode = '22023'; end if;
  if v_sale.status = 'returned' then raise exception 'This sale has already been fully returned' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one item to return' using errcode = '22023';
  end if;

  insert into public.sale_returns (pharmacy_id, sale_id, return_no, reason, notes, refund_amount, refund_method, created_by)
  values (v_sale.pharmacy_id, v_sale.id, private.next_document_no(v_sale.pharmacy_id, 'return', 'RET'),
          p_reason, p_notes, 0, p_refund_method, (select auth.uid()))
  returning * into v_return;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_si from public.sale_items
     where id = (v_item->>'sale_item_id')::uuid and sale_id = v_sale.id for update;
    if not found then raise exception 'Item does not belong to this sale' using errcode = 'P0002'; end if;

    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 or v_qty > v_si.quantity - v_si.returned_quantity then
      raise exception 'Can return at most % unit(s) of %', v_si.quantity - v_si.returned_quantity, v_si.product_name
        using errcode = '22023';
    end if;

    select * into v_batch from public.medicine_batches where id = v_si.batch_id for update;
    -- Never put expired, damaged or reaction-linked stock back on the shelf.
    v_restock := coalesce((v_item->>'restock')::boolean, true)
                 and v_batch.expiry_date >= current_date
                 and p_reason not in ('damaged', 'expired', 'adverse_reaction');

    v_refund := round(v_si.line_total * v_qty / v_si.quantity, 2);
    update public.sale_items set returned_quantity = returned_quantity + v_qty where id = v_si.id;

    if v_restock then
      update public.medicine_batches set quantity = quantity + v_qty where id = v_batch.id returning * into v_batch;
      perform private.record_movement(v_batch, 'sale_return', v_qty, 'sale_return', v_return.id, v_return.return_no);
    end if;

    insert into public.sale_return_items (return_id, pharmacy_id, sale_item_id, quantity, restocked, refund_amount)
    values (v_return.id, v_sale.pharmacy_id, v_si.id, v_qty, v_restock, v_refund);
    v_total_refund := v_total_refund + v_refund;
  end loop;

  v_total_refund := least(v_total_refund, v_sale.total_amount - v_sale.refunded_amount);
  select bool_and(returned_quantity = quantity) into v_all_returned from public.sale_items where sale_id = v_sale.id;
  if v_all_returned then v_total_refund := v_sale.total_amount - v_sale.refunded_amount; end if;

  update public.sale_returns set refund_amount = v_total_refund where id = v_return.id returning * into v_return;
  update public.sales
     set refunded_amount = refunded_amount + v_total_refund,
         status = case when v_all_returned then 'returned'::public.sale_status
                       else 'partially_returned'::public.sale_status end
   where id = v_sale.id;

  perform private.audit(v_sale.pharmacy_id, 'sale.return', 'sale_returns', v_return.id::text,
    jsonb_build_object('invoice_no', v_sale.invoice_no, 'return_no', v_return.return_no,
                       'refund', v_total_refund, 'reason', p_reason));
  return to_jsonb(v_return);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancel (void) a sale: managers/owners only; restores all unreturned stock.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sale public.sales; v_si public.sale_items; v_batch public.medicine_batches; v_qty int;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  perform private.require_role(v_sale.pharmacy_id, array['owner', 'manager']::public.member_role[]);
  if v_sale.status <> 'completed' then
    raise exception 'Only sales without returns can be cancelled (status: %)', v_sale.status using errcode = '22023';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;

  for v_si in select * from public.sale_items where sale_id = p_sale_id for update loop
    v_qty := v_si.quantity - v_si.returned_quantity;
    if v_qty > 0 then
      update public.medicine_batches set quantity = quantity + v_qty where id = v_si.batch_id returning * into v_batch;
      perform private.record_movement(v_batch, 'sale_cancel', v_qty, 'sale', v_sale.id, 'Cancelled ' || v_sale.invoice_no);
    end if;
  end loop;

  update public.sales
     set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()),
         cancel_reason = trim(p_reason), refunded_amount = total_amount
   where id = p_sale_id;

  perform private.audit(v_sale.pharmacy_id, 'sale.cancel', 'sales', p_sale_id::text,
                        jsonb_build_object('invoice_no', v_sale.invoice_no, 'reason', p_reason));
  return public.get_sale(p_sale_id);
end;
$$;
