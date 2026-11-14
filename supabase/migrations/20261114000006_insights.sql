-- ============================================================================
-- PharmaTrack Pro — 006 Read models: dashboard, inventory, alerts, reports,
-- barcode lookup, and the deterministic analytics used by the AI assistant.
-- All numbers are computed from live rows; nothing is cached or invented.
-- ============================================================================

-- Net units sold per product over a window (sales minus returns, excl. cancelled).
create or replace function private.units_sold(p_pharmacy_id uuid, p_branch_id uuid, p_since timestamptz)
returns table (product_id uuid, units int, revenue numeric) language sql stable security definer set search_path = '' as $$
  select i.product_id,
         sum(i.quantity - i.returned_quantity)::int,
         sum(round(i.line_total * (i.quantity - i.returned_quantity) / i.quantity, 2))
    from public.sale_items i
    join public.sales s on s.id = i.sale_id
   where s.pharmacy_id = p_pharmacy_id
     and (p_branch_id is null or s.branch_id = p_branch_id)
     and s.status <> 'cancelled'
     and s.created_at >= p_since
   group by i.product_id;
$$;

-- ---------------------------------------------------------------------------
-- Inventory list with stock status (search, filter, paginate)
-- ---------------------------------------------------------------------------
create or replace function public.inventory_list(
  p_pharmacy_id uuid, p_branch_id uuid default null, p_search text default null,
  p_category text default null, p_status text default 'all',
  p_limit int default 50, p_offset int default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_warn int; v_result jsonb;
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist,cashier}');
  v_warn := private.setting(p_pharmacy_id, 'expiry_warning_days')::int;

  with stock as (
    select p.*,
           coalesce(sum(b.quantity) filter (where b.expiry_date >= current_date), 0)::int as sellable_qty,
           coalesce(sum(b.quantity) filter (where b.expiry_date < current_date), 0)::int as expired_qty,
           min(b.expiry_date) filter (where b.quantity > 0 and b.expiry_date >= current_date) as next_expiry,
           coalesce(sum(b.quantity * b.purchase_price), 0)::numeric(14,2) as stock_value,
           max(b.mrp) filter (where b.quantity > 0) as current_mrp,
           (array_agg(b.selling_price order by b.expiry_date) filter (where b.quantity > 0 and b.expiry_date >= current_date))[1] as current_price,
           count(b.id) filter (where b.quantity > 0)::int as batch_count,
           (select s.name from public.suppliers s where s.id = p.default_supplier_id) as supplier_name
      from public.products p
      left join public.medicine_batches b
        on b.product_id = p.id and (p_branch_id is null or b.branch_id = p_branch_id)
     where p.pharmacy_id = p_pharmacy_id and not p.is_archived
       and (p_category is null or p.category = p_category)
       and (p_search is null or p_search = ''
            or p.name ilike '%' || p_search || '%' or p.generic_name ilike '%' || p_search || '%'
            or p.composition ilike '%' || p_search || '%' or p.manufacturer ilike '%' || p_search || '%'
            or p.barcode = p_search)
     group by p.id
  ), classified as (
    select s.*,
           case when s.sellable_qty = 0 then 'out_of_stock'
                when s.sellable_qty <= s.min_stock_level then 'low_stock'
                else 'in_stock' end as stock_status,
           (s.next_expiry is not null and s.next_expiry <= current_date + v_warn) as expiring_soon,
           (s.expired_qty > 0) as has_expired
      from stock s
  ), filtered as (
    select * from classified c
     where p_status = 'all'
        or (p_status = 'low' and c.stock_status = 'low_stock')
        or (p_status = 'out' and c.stock_status = 'out_of_stock')
        or (p_status = 'expiring' and c.expiring_soon)
        or (p_status = 'expired' and c.has_expired)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(f) order by lower(f.name))
                        from (select * from filtered order by lower(name)
                               limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) f), '[]'::jsonb))
    into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Barcode / code lookup for POS and receiving
-- ---------------------------------------------------------------------------
create or replace function public.lookup_barcode(p_pharmacy_id uuid, p_code text, p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_product public.products;
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist,cashier}');
  select * into v_product from public.products
   where pharmacy_id = p_pharmacy_id and not is_archived and barcode = trim(p_code)
   limit 1;
  if not found then return null; end if;
  return to_jsonb(v_product) || jsonb_build_object(
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'batch_no', b.batch_no, 'expiry_date', b.expiry_date, 'quantity', b.quantity,
               'selling_price', b.selling_price, 'mrp', b.mrp, 'branch_id', b.branch_id)
             order by b.expiry_date)
        from public.medicine_batches b
       where b.product_id = v_product.id and b.quantity > 0 and b.expiry_date >= current_date
         and (p_branch_id is null or b.branch_id = p_branch_id)), '[]'::jsonb));
end;
$$;

-- POS search: products with sellable stock in a branch (name / generic / barcode)
create or replace function public.pos_search(p_pharmacy_id uuid, p_branch_id uuid, p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist,cashier}');
  if coalesce(length(trim(p_query)), 0) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(r order by r.rank, lower(r.name))
      from (
        select p.id, p.name, p.generic_name, p.manufacturer, p.barcode, p.category, p.schedule,
               p.gst_rate, p.unit, p.rack_location,
               coalesce(sum(b.quantity), 0)::int as available,
               (array_agg(b.selling_price order by b.expiry_date))[1] as price,
               (array_agg(b.mrp order by b.expiry_date))[1] as mrp,
               min(b.expiry_date) as next_expiry,
               case when p.barcode = trim(p_query) then 0
                    when p.name ilike trim(p_query) || '%' then 1 else 2 end as rank
          from public.products p
          left join public.medicine_batches b
            on b.product_id = p.id and b.branch_id = p_branch_id
           and b.quantity > 0 and b.expiry_date >= current_date
         where p.pharmacy_id = p_pharmacy_id and not p.is_archived
           and (p.name ilike '%' || trim(p_query) || '%' or p.generic_name ilike '%' || trim(p_query) || '%'
                or p.barcode = trim(p_query))
         group by p.id
         limit 20) r), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock alerts (thresholds from pharmacy settings)
-- ---------------------------------------------------------------------------
create or replace function public.stock_alerts(p_pharmacy_id uuid, p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_warn int; v_crit int; v_slow int; v_dead int; v_result jsonb;
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist}');
  v_warn := private.setting(p_pharmacy_id, 'expiry_warning_days')::int;
  v_crit := private.setting(p_pharmacy_id, 'expiry_critical_days')::int;
  v_slow := private.setting(p_pharmacy_id, 'slow_moving_days')::int;
  v_dead := private.setting(p_pharmacy_id, 'dead_stock_days')::int;

  with batches as (
    select b.id, b.batch_no, b.expiry_date, b.quantity, b.purchase_price, b.mrp, b.branch_id,
           (b.expiry_date - current_date) as days_left,
           p.id as product_id, p.name, p.generic_name, p.rack_location,
           (b.quantity * b.purchase_price)::numeric(14,2) as value_at_cost
      from public.medicine_batches b join public.products p on p.id = b.product_id
     where b.pharmacy_id = p_pharmacy_id and b.quantity > 0 and not p.is_archived
       and (p_branch_id is null or b.branch_id = p_branch_id)
  ), product_totals as (
    select p.id as product_id, p.name, p.generic_name, p.min_stock_level, p.default_supplier_id,
           (select name from public.suppliers where id = p.default_supplier_id) as supplier_name,
           coalesce(sum(b.quantity) filter (where b.expiry_date >= current_date), 0)::int as sellable_qty,
           coalesce(sum(b.quantity * b.purchase_price) filter (where b.expiry_date >= current_date), 0)::numeric(14,2) as value_at_cost,
           (select max(s.created_at) from public.sale_items i join public.sales s on s.id = i.sale_id
             where i.product_id = p.id and s.status <> 'cancelled'
               and (p_branch_id is null or s.branch_id = p_branch_id)) as last_sold_at,
           min(b.created_at) as first_stocked_at
      from public.products p
      left join public.medicine_batches b on b.product_id = p.id and (p_branch_id is null or b.branch_id = p_branch_id)
     where p.pharmacy_id = p_pharmacy_id and not p.is_archived
     group by p.id
  )
  select jsonb_build_object(
    'thresholds', jsonb_build_object('warning_days', v_warn, 'critical_days', v_crit,
                                     'slow_moving_days', v_slow, 'dead_stock_days', v_dead),
    'expired', coalesce((select jsonb_agg(to_jsonb(b) order by b.expiry_date) from batches b where b.days_left < 0), '[]'),
    'expiring_critical', coalesce((select jsonb_agg(to_jsonb(b) order by b.expiry_date) from batches b
                                    where b.days_left between 0 and v_crit), '[]'),
    'expiring_warning', coalesce((select jsonb_agg(to_jsonb(b) order by b.expiry_date) from batches b
                                   where b.days_left > v_crit and b.days_left <= v_warn), '[]'),
    'out_of_stock', coalesce((select jsonb_agg(to_jsonb(t) order by t.name) from product_totals t
                               where t.sellable_qty = 0 and (t.last_sold_at is not null or t.first_stocked_at is not null)), '[]'),
    'low_stock', coalesce((select jsonb_agg(to_jsonb(t) order by t.sellable_qty::numeric / greatest(t.min_stock_level, 1))
                            from product_totals t where t.sellable_qty > 0 and t.sellable_qty <= t.min_stock_level), '[]'),
    'slow_moving', coalesce((select jsonb_agg(to_jsonb(t) order by t.value_at_cost desc) from product_totals t
                              where t.sellable_qty > 0
                                and coalesce(t.last_sold_at, t.first_stocked_at) < now() - make_interval(days => v_slow)
                                and coalesce(t.last_sold_at, t.first_stocked_at) >= now() - make_interval(days => v_dead)), '[]'),
    'dead_stock', coalesce((select jsonb_agg(to_jsonb(t) order by t.value_at_cost desc) from product_totals t
                             where t.sellable_qty > 0
                               and coalesce(t.last_sold_at, t.first_stocked_at) < now() - make_interval(days => v_dead)), '[]')
  ) into v_result;
  return v_result;
end;
$$;

-- Materialise alerts as deduplicated notifications. Safe to call repeatedly
-- (e.g. on app load, or nightly with pg_cron).
create or replace function public.refresh_alert_notifications(p_pharmacy_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_alerts jsonb; v_count int := 0; v_n int; v_week text := to_char(current_date, 'IYYY-IW');
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist}');
  v_alerts := public.stock_alerts(p_pharmacy_id, null);

  insert into public.notifications (pharmacy_id, kind, severity, title, body, link, dedupe_key)
  select p_pharmacy_id, 'expired', 'critical', (b->>'name') || ' batch ' || (b->>'batch_no') || ' has expired',
         (b->>'quantity') || ' unit(s) expired on ' || (b->>'expiry_date') || '. Remove from shelf and write off.',
         '/alerts?tab=expired', 'expired:' || (b->>'id')
    from jsonb_array_elements(v_alerts->'expired') b
  on conflict (pharmacy_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into public.notifications (pharmacy_id, kind, severity, title, body, link, dedupe_key)
  select p_pharmacy_id, 'expiring', 'warning', (b->>'name') || ' expires in ' || (b->>'days_left') || ' days',
         'Batch ' || (b->>'batch_no') || ': ' || (b->>'quantity') || ' unit(s) left.',
         '/alerts?tab=expiring', 'expiring:' || (b->>'id')
    from jsonb_array_elements(v_alerts->'expiring_critical') b
  on conflict (pharmacy_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into public.notifications (pharmacy_id, kind, severity, title, body, link, dedupe_key)
  select p_pharmacy_id, 'low_stock', 'warning', (t->>'name') || ' is running low',
         'Only ' || (t->>'sellable_qty') || ' left (minimum ' || (t->>'min_stock_level') || ').',
         '/alerts?tab=low', 'low:' || (t->>'product_id') || ':' || v_week
    from jsonb_array_elements(v_alerts->'low_stock') t
  on conflict (pharmacy_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into public.notifications (pharmacy_id, kind, severity, title, body, link, dedupe_key)
  select p_pharmacy_id, 'out_of_stock', 'critical', (t->>'name') || ' is out of stock', null,
         '/alerts?tab=out', 'out:' || (t->>'product_id') || ':' || v_week
    from jsonb_array_elements(v_alerts->'out_of_stock') t
  on conflict (pharmacy_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into public.notifications (pharmacy_id, kind, severity, title, body, link, dedupe_key)
  select p_pharmacy_id, 'payment_due', 'warning',
         'Payment due to ' || s.name, 'Invoice ' || pu.supplier_invoice_no || ': ₹' ||
         (pu.total_amount - pu.amount_paid) || ' due ' || pu.due_date,
         '/purchases/' || pu.id, 'due:' || pu.id
    from public.purchases pu join public.suppliers s on s.id = pu.supplier_id
   where pu.pharmacy_id = p_pharmacy_id and pu.payment_status <> 'paid' and pu.due_date <= current_date + 3
  on conflict (pharmacy_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_summary(
  p_pharmacy_id uuid, p_branch_id uuid default null, p_days int default 30
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 7), 365);
  v_since timestamptz := date_trunc('day', now()) - make_interval(days => v_days - 1);
  v_prev timestamptz := v_since - make_interval(days => v_days);
  v_warn int; v_result jsonb;
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist}');
  v_warn := private.setting(p_pharmacy_id, 'expiry_warning_days')::int;

  with s as (
    select * from public.sales
     where pharmacy_id = p_pharmacy_id and status <> 'cancelled'
       and (p_branch_id is null or branch_id = p_branch_id)
       and created_at >= v_prev
  ), items as (
    select i.*, s.created_at from public.sale_items i join s on s.id = i.sale_id where s.created_at >= v_since
  ), b as (
    select b.*, p.min_stock_level from public.medicine_batches b join public.products p on p.id = b.product_id
     where b.pharmacy_id = p_pharmacy_id and not p.is_archived
       and (p_branch_id is null or b.branch_id = p_branch_id)
  ), per_product as (
    select p.id, p.min_stock_level,
           coalesce(sum(b.quantity) filter (where b.expiry_date >= current_date), 0) as qty
      from public.products p
      left join public.medicine_batches b on b.product_id = p.id and (p_branch_id is null or b.branch_id = p_branch_id)
     where p.pharmacy_id = p_pharmacy_id and not p.is_archived
     group by p.id
  )
  select jsonb_build_object(
    'period_days', v_days,
    'today', jsonb_build_object(
      'revenue', coalesce((select sum(total_amount - refunded_amount) from s where created_at >= date_trunc('day', now())), 0),
      'bills', (select count(*) from s where created_at >= date_trunc('day', now()))),
    'period', jsonb_build_object(
      'revenue', coalesce((select sum(total_amount - refunded_amount) from s where created_at >= v_since), 0),
      'previous_revenue', coalesce((select sum(total_amount - refunded_amount) from s where created_at < v_since), 0),
      'bills', (select count(*) from s where created_at >= v_since),
      'gross_profit', coalesce((select sum(
          round(taxable_amount * (quantity - returned_quantity) / quantity, 2)
          - unit_cost * (quantity - returned_quantity)) from items), 0)),
    'stock', jsonb_build_object(
      'products', (select count(*) from per_product),
      'value_at_cost', coalesce((select sum(quantity * purchase_price) from b where expiry_date >= current_date), 0),
      'value_at_mrp', coalesce((select sum(quantity * mrp) from b where expiry_date >= current_date), 0),
      'low_stock', (select count(*) from per_product where qty > 0 and qty <= min_stock_level),
      'out_of_stock', (select count(*) from per_product where qty = 0),
      'expired_batches', (select count(*) from b where quantity > 0 and expiry_date < current_date),
      'expired_value', coalesce((select sum(quantity * purchase_price) from b where quantity > 0 and expiry_date < current_date), 0),
      'expiring_batches', (select count(*) from b where quantity > 0 and expiry_date between current_date and current_date + v_warn),
      'expiring_value', coalesce((select sum(quantity * purchase_price) from b
                                   where quantity > 0 and expiry_date between current_date and current_date + v_warn), 0)),
    'payables', coalesce((select sum(total_amount - amount_paid) from public.purchases
                           where pharmacy_id = p_pharmacy_id and payment_status <> 'paid'
                             and (p_branch_id is null or branch_id = p_branch_id)), 0),
    'trend', (select jsonb_agg(jsonb_build_object('date', d::date,
                       'revenue', coalesce((select sum(total_amount - refunded_amount) from s
                                             where created_at >= d and created_at < d + interval '1 day'), 0),
                       'bills', (select count(*) from s where created_at >= d and created_at < d + interval '1 day'))
                     order by d)
                from generate_series(v_since, date_trunc('day', now()), interval '1 day') d),
    'top_products', coalesce((select jsonb_agg(t) from (
        select product_name as name, sum(quantity - returned_quantity) as units,
               sum(round(line_total * (quantity - returned_quantity) / quantity, 2)) as revenue
          from items group by product_id, product_name
         having sum(quantity - returned_quantity) > 0
         order by 3 desc limit 6) t), '[]'),
    'payment_mix', coalesce((select jsonb_agg(t) from (
        select payment_method as method, count(*) as bills, sum(total_amount - refunded_amount) as amount
          from s where created_at >= v_since group by payment_method order by 3 desc) t), '[]'),
    'recent_sales', coalesce((select jsonb_agg(t) from (
        select id, invoice_no, customer_name, total_amount, payment_method, status, created_at
          from s order by created_at desc limit 6) t), '[]')
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier balances & reports
-- ---------------------------------------------------------------------------
create or replace function public.supplier_summary(p_pharmacy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist}');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'supplier_id', s.id, 'name', s.name,
             'purchases', (select count(*) from public.purchases p where p.supplier_id = s.id),
             'purchased_total', coalesce((select sum(total_amount) from public.purchases p where p.supplier_id = s.id), 0),
             'outstanding', coalesce((select sum(total_amount - amount_paid) from public.purchases p
                                       where p.supplier_id = s.id and p.payment_status <> 'paid'), 0),
             'overdue', coalesce((select sum(total_amount - amount_paid) from public.purchases p
                                   where p.supplier_id = s.id and p.payment_status <> 'paid' and p.due_date < current_date), 0),
             'last_purchase_on', (select max(invoice_date) from public.purchases p where p.supplier_id = s.id))
           order by s.name)
      from public.suppliers s where s.pharmacy_id = p_pharmacy_id), '[]'::jsonb);
end;
$$;

create or replace function public.sales_report(p_pharmacy_id uuid, p_from date, p_to date, p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager}');
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a date range of up to one year' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'daily', coalesce((select jsonb_agg(t order by t.day) from (
        select (s.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as bills,
               sum(s.taxable_amount) as taxable, sum(s.tax_amount) as tax, sum(s.discount_amount) as discount,
               sum(s.total_amount) as gross, sum(s.refunded_amount) as refunds,
               sum(s.total_amount - s.refunded_amount) as net
          from public.sales s
         where s.pharmacy_id = p_pharmacy_id and s.status <> 'cancelled'
           and (p_branch_id is null or s.branch_id = p_branch_id)
           and (s.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
         group by 1) t), '[]'),
    'gst', coalesce((select jsonb_agg(t order by t.gst_rate) from (
        select i.gst_rate, sum(i.taxable_amount) as taxable, sum(i.tax_amount) as tax,
               sum(i.tax_amount) / 2 as cgst, sum(i.tax_amount) / 2 as sgst
          from public.sale_items i join public.sales s on s.id = i.sale_id
         where s.pharmacy_id = p_pharmacy_id and s.status <> 'cancelled'
           and (p_branch_id is null or s.branch_id = p_branch_id)
           and (s.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
         group by i.gst_rate) t), '[]'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Deterministic analytics for the assistant (no customer data involved)
-- ---------------------------------------------------------------------------

-- Reorder suggestion = avg daily demand × (lead time + cover days) − sellable stock
create or replace function public.reorder_suggestions(
  p_pharmacy_id uuid, p_branch_id uuid default null, p_lookback_days int default 60,
  p_cover_days int default 30, p_lead_time_days int default 5
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_lookback int := least(greatest(coalesce(p_lookback_days, 60), 14), 365);
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist}');
  return coalesce((
    select jsonb_agg(t order by t.suggested_qty desc) from (
      select p.id as product_id, p.name, p.min_stock_level,
             (select name from public.suppliers where id = p.default_supplier_id) as supplier_name,
             coalesce(st.qty, 0) as sellable_qty,
             round(coalesce(u.units, 0)::numeric / v_lookback, 2) as avg_daily_units,
             greatest(
               ceil(coalesce(u.units, 0)::numeric / v_lookback * (p_cover_days + p_lead_time_days)) - coalesce(st.qty, 0),
               case when coalesce(st.qty, 0) <= p.min_stock_level then p.min_stock_level * 2 - coalesce(st.qty, 0) else 0 end
             )::int as suggested_qty,
             case when coalesce(u.units, 0) = 0 then null
                  else round(coalesce(st.qty, 0) / (u.units::numeric / v_lookback), 0) end as days_of_cover
        from public.products p
        left join private.units_sold(p_pharmacy_id, p_branch_id, now() - make_interval(days => v_lookback)) u
          on u.product_id = p.id
        left join lateral (
          select sum(b.quantity) as qty from public.medicine_batches b
           where b.product_id = p.id and b.expiry_date >= current_date
             and (p_branch_id is null or b.branch_id = p_branch_id)) st on true
       where p.pharmacy_id = p_pharmacy_id and not p.is_archived
    ) t where t.suggested_qty > 0
    limit 100), '[]'::jsonb);
end;
$$;

-- Expiry risk = units expected to remain unsold at expiry given recent demand.
create or replace function public.expiry_risk(p_pharmacy_id uuid, p_branch_id uuid default null, p_horizon_days int default 180)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role(p_pharmacy_id, '{owner,manager,pharmacist}');
  return coalesce((
    select jsonb_agg(t order by t.value_at_risk desc) from (
      select b.id as batch_id, p.name, b.batch_no, b.expiry_date, b.quantity,
             (b.expiry_date - current_date) as days_left,
             round(coalesce(u.units, 0)::numeric / 60, 2) as avg_daily_units,
             greatest(b.quantity - floor(coalesce(u.units, 0)::numeric / 60 * (b.expiry_date - current_date)), 0)::int as units_at_risk,
             round(greatest(b.quantity - floor(coalesce(u.units, 0)::numeric / 60 * (b.expiry_date - current_date)), 0)
                   * b.purchase_price, 2) as value_at_risk
        from public.medicine_batches b
        join public.products p on p.id = b.product_id
        left join private.units_sold(p_pharmacy_id, p_branch_id, now() - interval '60 days') u on u.product_id = p.id
       where b.pharmacy_id = p_pharmacy_id and b.quantity > 0
         and b.expiry_date between current_date and current_date + least(coalesce(p_horizon_days, 180), 730)
         and (p_branch_id is null or b.branch_id = p_branch_id)
    ) t where t.units_at_risk > 0
    limit 100), '[]'::jsonb);
end;
$$;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function private.units_sold(uuid, uuid, timestamptz) from public;
