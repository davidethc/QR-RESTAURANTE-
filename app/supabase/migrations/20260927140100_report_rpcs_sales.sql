-- ---------------------------------------------------------------------------
-- Módulo 2 · M14 · RPCs de reportes de ventas.
--
-- Depende de M1 (restaurants.timezone / business_day_cutoff), M7 (bills,
-- payments, bill_discounts) y M13 (índices).
--
-- Definiciones (wiki/syntheses/diseno-cobro-reportes-inventario.md):
--   venta neta     = Σ bills.total    de cuentas CLOSED (por closed_at)
--   venta bruta    = Σ bills.subtotal de cuentas CLOSED
--   descuentos     = Σ bills.discount_total de cuentas CLOSED
--   propinas       = Σ payments.tip_amount COMPLETED (por received_at). No son ingreso.
--   ticket promedio= venta neta / nº de cuentas CLOSED
--   producto/categoría = order_items de pedidos DELIVERED (por delivered_at), a valor bruto
--   respaldo histórico = delivered_orders_total (Σ orders.total DELIVERED)
--
-- Rango: p_from..p_to son días comerciales (inclusive), máximo 400 días. Se
-- convierten a instantes con la zona y el corte del restaurante; un día
-- comercial va de cutoff local a cutoff local del día siguiente.
--
-- Acceso: solo OWNER y ADMIN del restaurante. SECURITY DEFINER porque
-- agregan sobre tablas cuyo RLS también deja ver a WAITER; el chequeo de rol
-- lo hace report_guard antes de leer nada.
-- ---------------------------------------------------------------------------


-- Guard interno compartido por todas las report_*: autenticación, rol,
-- validación de rango y límites en hora local. No es una API: sin execute
-- para anon ni authenticated (las RPCs definer lo llaman como su owner).
create or replace function public.report_guard(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (start_at timestamptz, end_at timestamptz, tz text, cutoff time)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz text;
  v_cutoff time;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if p_restaurant_id is null
     or not (
       public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
       or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
     )
  then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_from is null or p_to is null then
    raise exception 'Rango de fechas incompleto' using errcode = '22023';
  end if;

  if p_to < p_from then
    raise exception 'La fecha final es anterior a la inicial' using errcode = '22023';
  end if;

  if p_to - p_from + 1 > 400 then
    raise exception 'El rango máximo es de 400 días' using errcode = '22023';
  end if;

  select r.timezone, r.business_day_cutoff
  into v_tz, v_cutoff
  from public.restaurants r
  where r.id = p_restaurant_id;

  if v_tz is null then
    raise exception 'Restaurante no encontrado' using errcode = 'P0002';
  end if;

  return query
  select
    ((p_from + v_cutoff) at time zone v_tz),
    (((p_to + 1) + v_cutoff) at time zone v_tz),
    v_tz,
    v_cutoff;
end;
$$;

revoke all on function public.report_guard(uuid, date, date) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- report_sales_summary → jsonb
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_summary(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_tz text;
  v_bills record;
  v_pay record;
  v_open record;
  v_deliv record;
begin
  select g.start_at, g.end_at, g.tz
  into v_start, v_end, v_tz
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  select
    count(*)                            as bills_count,
    coalesce(sum(b.subtotal), 0)        as gross_sales,
    coalesce(sum(b.discount_total), 0)  as discounts,
    coalesce(sum(b.total), 0)           as net_sales
  into v_bills
  from public.bills b
  where b.restaurant_id = p_restaurant_id
    and b.status = 'CLOSED'
    and b.closed_at >= v_start and b.closed_at < v_end;

  select
    count(*)                         as payments_count,
    coalesce(sum(p.amount), 0)       as collected,
    coalesce(sum(p.tip_amount), 0)   as tips
  into v_pay
  from public.payments p
  where p.restaurant_id = p_restaurant_id
    and p.status = 'COMPLETED'
    and p.received_at >= v_start and p.received_at < v_end;

  -- Cuentas abiertas en el rango que aún no se cerraron (OPEN o PAID con
  -- pedidos activos). balance = lo que falta cobrar.
  select
    count(*)                       as open_count,
    coalesce(sum(b.total), 0)      as open_total,
    coalesce(sum(b.balance), 0)    as open_balance
  into v_open
  from public.bills b
  where b.restaurant_id = p_restaurant_id
    and b.status in ('OPEN', 'PAID')
    and b.opened_at >= v_start and b.opened_at < v_end;

  select
    count(*)                    as orders_count,
    coalesce(sum(o.total), 0)   as orders_total
  into v_deliv
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.status = 'DELIVERED'
    and o.delivered_at >= v_start and o.delivered_at < v_end;

  return jsonb_build_object(
    'from',                     p_from,
    'to',                       p_to,
    'timezone',                 v_tz,
    'bills_count',              v_bills.bills_count,
    'gross_sales',              v_bills.gross_sales,
    'discounts',                v_bills.discounts,
    'net_sales',                v_bills.net_sales,
    'avg_ticket',               case when v_bills.bills_count > 0
                                  then round(v_bills.net_sales / v_bills.bills_count, 2)
                                  else 0 end,
    'tips',                     v_pay.tips,
    'payments_count',           v_pay.payments_count,
    'collected',                v_pay.collected,
    'open_bills_count',         v_open.open_count,
    'open_bills_total',         v_open.open_total,
    'open_bills_balance',       v_open.open_balance,
    'delivered_orders_count',   v_deliv.orders_count,
    'delivered_orders_total',   v_deliv.orders_total
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- report_sales_by_period(day|week|month)
-- Devuelve todos los periodos del rango (con ceros), semana ISO (lunes).
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_by_period(
  p_restaurant_id uuid,
  p_from date,
  p_to date,
  p_granularity text default 'day'
)
returns table (
  period_start date,
  period_end date,
  bills_count bigint,
  gross_sales numeric,
  discounts numeric,
  net_sales numeric,
  avg_ticket numeric,
  tips numeric,
  delivered_orders_total numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
  v_tz text;
  v_cutoff interval;
  v_step interval;
begin
  select g.start_at, g.end_at, g.tz, g.cutoff::interval
  into v_start, v_end, v_tz, v_cutoff
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  if p_granularity is null or p_granularity not in ('day', 'week', 'month') then
    raise exception 'Granularidad inválida: usa day, week o month' using errcode = '22023';
  end if;

  v_step := case p_granularity
    when 'day' then interval '1 day'
    when 'week' then interval '1 week'
    else interval '1 month'
  end;

  return query
  with periods as (
    select s::date as p_start,
           (s + v_step - interval '1 day')::date as p_end
    from generate_series(
      date_trunc(p_granularity, p_from::timestamp),
      date_trunc(p_granularity, p_to::timestamp),
      v_step
    ) s
  ),
  b as (
    select date_trunc(p_granularity, ((x.closed_at at time zone v_tz) - v_cutoff))::date as p_start,
           count(*) as bills_count,
           sum(x.subtotal) as gross_sales,
           sum(x.discount_total) as discounts,
           sum(x.total) as net_sales
    from public.bills x
    where x.restaurant_id = p_restaurant_id
      and x.status = 'CLOSED'
      and x.closed_at >= v_start and x.closed_at < v_end
    group by 1
  ),
  t as (
    select date_trunc(p_granularity, ((y.received_at at time zone v_tz) - v_cutoff))::date as p_start,
           sum(y.tip_amount) as tips
    from public.payments y
    where y.restaurant_id = p_restaurant_id
      and y.status = 'COMPLETED'
      and y.received_at >= v_start and y.received_at < v_end
    group by 1
  ),
  d as (
    select date_trunc(p_granularity, ((z.delivered_at at time zone v_tz) - v_cutoff))::date as p_start,
           sum(z.total) as delivered_total
    from public.orders z
    where z.restaurant_id = p_restaurant_id
      and z.status = 'DELIVERED'
      and z.delivered_at >= v_start and z.delivered_at < v_end
    group by 1
  )
  select
    pr.p_start,
    pr.p_end,
    coalesce(b.bills_count, 0)::bigint,
    coalesce(b.gross_sales, 0)::numeric,
    coalesce(b.discounts, 0)::numeric,
    coalesce(b.net_sales, 0)::numeric,
    case when coalesce(b.bills_count, 0) > 0
      then round(b.net_sales / b.bills_count, 2) else 0 end::numeric,
    coalesce(t.tips, 0)::numeric,
    coalesce(d.delivered_total, 0)::numeric
  from periods pr
  left join b on b.p_start = pr.p_start
  left join t on t.p_start = pr.p_start
  left join d on d.p_start = pr.p_start
  order by pr.p_start;
end;
$$;


-- ---------------------------------------------------------------------------
-- report_sales_by_product: order_items de pedidos DELIVERED, a valor bruto.
-- Productos borrados (product_id nulo) se agrupan por el nombre snapshot.
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_by_product(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (
  product_id uuid,
  product_name text,
  category_id uuid,
  category_name text,
  quantity bigint,
  gross_sales numeric,
  orders_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  select g.start_at, g.end_at
  into v_start, v_end
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  return query
  with items as (
    select oi.product_id,
           case when oi.product_id is null then oi.product_name end as orphan_name,
           oi.product_name,
           oi.quantity,
           oi.subtotal,
           oi.order_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.restaurant_id = p_restaurant_id
      and o.status = 'DELIVERED'
      and o.delivered_at >= v_start and o.delivered_at < v_end
  ),
  agg as (
    select i.product_id,
           i.orphan_name,
           max(i.product_name) as snapshot_name,
           sum(i.quantity)::bigint as quantity,
           sum(i.subtotal) as gross_sales,
           count(distinct i.order_id)::bigint as orders_count
    from items i
    group by i.product_id, i.orphan_name
  )
  select a.product_id,
         coalesce(p.name, a.snapshot_name),
         c.id,
         c.name,
         a.quantity,
         a.gross_sales,
         a.orders_count
  from agg a
  left join public.products p on p.id = a.product_id
  left join public.categories c on c.id = p.category_id
  order by a.gross_sales desc, 2;
end;
$$;


-- ---------------------------------------------------------------------------
-- report_sales_by_category: igual que por producto, agrupado por categoría
-- actual del producto. Sin categoría / producto borrado → category_id nulo.
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_by_category(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (
  category_id uuid,
  category_name text,
  quantity bigint,
  gross_sales numeric,
  products_count bigint,
  orders_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  select g.start_at, g.end_at
  into v_start, v_end
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  return query
  select c.id,
         coalesce(c.name, 'Sin categoría'),
         sum(oi.quantity)::bigint,
         sum(oi.subtotal),
         count(distinct coalesce(oi.product_id::text, oi.product_name))::bigint,
         count(distinct o.id)::bigint
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  left join public.products p on p.id = oi.product_id
  left join public.categories c on c.id = p.category_id
  where o.restaurant_id = p_restaurant_id
    and o.status = 'DELIVERED'
    and o.delivered_at >= v_start and o.delivered_at < v_end
  group by c.id, c.name
  order by 4 desc, 2;
end;
$$;


-- ---------------------------------------------------------------------------
-- report_sales_by_staff: pedidos entregados por quien los aceptó
-- (orders.accepted_by) y cobros por quien los recibió (payments.received_by).
-- ---------------------------------------------------------------------------
create or replace function public.report_sales_by_staff(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (
  user_id uuid,
  full_name text,
  member_role public.member_role,
  orders_accepted bigint,
  orders_accepted_total numeric,
  payments_count bigint,
  payments_amount numeric,
  tips_amount numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  select g.start_at, g.end_at
  into v_start, v_end
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  return query
  with acc as (
    select o.accepted_by as uid,
           count(*)::bigint as n,
           sum(o.total) as total
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and o.status = 'DELIVERED'
      and o.delivered_at >= v_start and o.delivered_at < v_end
      and o.accepted_by is not null
    group by o.accepted_by
  ),
  pay as (
    select p.received_by as uid,
           count(*)::bigint as n,
           sum(p.amount) as amount,
           sum(p.tip_amount) as tips
    from public.payments p
    where p.restaurant_id = p_restaurant_id
      and p.status = 'COMPLETED'
      and p.received_at >= v_start and p.received_at < v_end
      and p.received_by is not null
    group by p.received_by
  ),
  people as (
    select coalesce(acc.uid, pay.uid) as uid,
           coalesce(acc.n, 0) as orders_accepted,
           coalesce(acc.total, 0) as orders_accepted_total,
           coalesce(pay.n, 0) as payments_count,
           coalesce(pay.amount, 0) as payments_amount,
           coalesce(pay.tips, 0) as tips_amount
    from acc
    full outer join pay on pay.uid = acc.uid
  )
  select pe.uid,
         coalesce(nullif(btrim(pr.full_name), ''), 'Sin nombre'),
         (select rm.role
            from public.restaurant_members rm
           where rm.restaurant_id = p_restaurant_id
             and rm.user_id = pe.uid
           order by rm.status = 'ACTIVE' desc, rm.created_at desc
           limit 1),
         pe.orders_accepted::bigint,
         pe.orders_accepted_total::numeric,
         pe.payments_count::bigint,
         pe.payments_amount::numeric,
         pe.tips_amount::numeric
  from people pe
  left join public.profiles pr on pr.id = pe.uid
  order by pe.payments_amount desc, pe.orders_accepted_total desc, 2;
end;
$$;


-- ---------------------------------------------------------------------------
-- report_payments_by_method: una fila por cada método (con ceros).
-- ---------------------------------------------------------------------------
create or replace function public.report_payments_by_method(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (
  method public.payment_method,
  payments_count bigint,
  amount numeric,
  tips numeric,
  total_collected numeric,
  voided_count bigint,
  voided_amount numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  select g.start_at, g.end_at
  into v_start, v_end
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  return query
  with pay as (
    select p.method,
           count(*) filter (where p.status = 'COMPLETED')::bigint as n,
           coalesce(sum(p.amount) filter (where p.status = 'COMPLETED'), 0) as amount,
           coalesce(sum(p.tip_amount) filter (where p.status = 'COMPLETED'), 0) as tips,
           count(*) filter (where p.status = 'VOIDED')::bigint as voided_n,
           coalesce(sum(p.amount) filter (where p.status = 'VOIDED'), 0) as voided_amount
    from public.payments p
    where p.restaurant_id = p_restaurant_id
      and p.received_at >= v_start and p.received_at < v_end
    group by p.method
  )
  select m.m,
         coalesce(pay.n, 0)::bigint,
         coalesce(pay.amount, 0)::numeric,
         coalesce(pay.tips, 0)::numeric,
         (coalesce(pay.amount, 0) + coalesce(pay.tips, 0))::numeric,
         coalesce(pay.voided_n, 0)::bigint,
         coalesce(pay.voided_amount, 0)::numeric
  from unnest(enum_range(null::public.payment_method)) as m(m)
  left join pay on pay.method = m.m
  order by m.m;
end;
$$;


revoke all on function public.report_sales_summary(uuid, date, date) from public;
revoke all on function public.report_sales_by_period(uuid, date, date, text) from public;
revoke all on function public.report_sales_by_product(uuid, date, date) from public;
revoke all on function public.report_sales_by_category(uuid, date, date) from public;
revoke all on function public.report_sales_by_staff(uuid, date, date) from public;
revoke all on function public.report_payments_by_method(uuid, date, date) from public;

revoke execute on function public.report_sales_summary(uuid, date, date) from anon;
revoke execute on function public.report_sales_by_period(uuid, date, date, text) from anon;
revoke execute on function public.report_sales_by_product(uuid, date, date) from anon;
revoke execute on function public.report_sales_by_category(uuid, date, date) from anon;
revoke execute on function public.report_sales_by_staff(uuid, date, date) from anon;
revoke execute on function public.report_payments_by_method(uuid, date, date) from anon;

grant execute on function public.report_sales_summary(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_sales_by_period(uuid, date, date, text) to authenticated, service_role;
grant execute on function public.report_sales_by_product(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_sales_by_category(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_sales_by_staff(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_payments_by_method(uuid, date, date) to authenticated, service_role;
