-- ---------------------------------------------------------------------------
-- M14 · Dashboard "Hoy" · EXPAND (solo una función nueva, sin datos).
--
-- get_home_dashboard(restaurante, desde, hasta) → jsonb con todas las
-- tarjetas de "Hoy" para el periodo elegido. Cada cifra de dinero o de
-- pedidos viene en tres: total / pos (punto de venta) / digital (menú
-- digital: orders.source in ('digital_menu', 'web')).
--
-- Solo cuenta dinero cobrado: cuentas PAID o CLOSED cuyo cobro cayó en el
-- rango (paid_at, o closed_at si falta). El total de cada cuenta se reparte
-- entre sus pedidos vivos en proporción a su total, así la suma por canal o
-- por opción de servicio cuadra exacto con el total. Propinas y métodos de
-- pago se reparten con la misma proporción digital de su cuenta.
--
-- Acceso: report_guard (Dueño y Administrador, rango ≤ 400 días, día
-- comercial con el corte del restaurante).
--
-- Rollback: drop function public.get_home_dashboard(uuid, date, date);
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.get_home_dashboard(
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
  v_cutoff time;
  v_result jsonb;
begin
  select g.start_at, g.end_at, g.tz, g.cutoff
  into v_start, v_end, v_tz, v_cutoff
  from public.report_guard(p_restaurant_id, p_from, p_to) g;

  with paid_bills as (
    select b.id, b.table_session_id, b.total,
           coalesce(b.paid_at, b.closed_at) as paid_at
    from public.bills b
    where b.restaurant_id = p_restaurant_id
      and b.status in ('PAID', 'CLOSED')
      and coalesce(b.paid_at, b.closed_at) >= v_start
      and coalesce(b.paid_at, b.closed_at) < v_end
  ),
  live_orders as (
    select o.id, o.total, coalesce(o.shipping_cost, 0) as shipping,
           o.service_type,
           coalesce(o.source in ('digital_menu', 'web'), false) as digital,
           pb.id as bill_id, pb.total as bill_total, pb.paid_at
    from public.orders o
    join paid_bills pb on pb.table_session_id = o.table_session_id
    where o.restaurant_id = p_restaurant_id
      and o.status not in ('REJECTED', 'CANCELLED')
      and not o.cancelled
  ),
  alloc as (
    select lo.*,
           case when sum(lo.total) over (partition by lo.bill_id) > 0
             then lo.bill_total * lo.total / sum(lo.total) over (partition by lo.bill_id)
             else 0 end as amount
    from live_orders lo
  ),
  bill_share as (
    select a.bill_id,
           case when sum(a.amount) > 0
             then sum(a.amount) filter (where a.digital) / sum(a.amount)
             else 0 end as digital_share
    from alloc a
    group by a.bill_id
  ),
  pays as (
    select p.method, p.amount, coalesce(p.tip_amount, 0) as tip,
           coalesce(bs.digital_share, 0) as digital_share
    from public.payments p
    join bill_share bs on bs.bill_id = p.bill_id
    where p.restaurant_id = p_restaurant_id
      and p.status = 'COMPLETED'
  ),
  totals as (
    select
      coalesce(sum(a.amount), 0)                                   as sales,
      coalesce(sum(a.amount) filter (where not a.digital), 0)      as sales_pos,
      coalesce(sum(a.amount) filter (where a.digital), 0)          as sales_digital,
      count(distinct a.id)                                         as orders,
      count(distinct a.id) filter (where not a.digital)            as orders_pos,
      count(distinct a.id) filter (where a.digital)                as orders_digital,
      coalesce(sum(a.shipping), 0)                                 as shipping,
      coalesce(sum(a.shipping) filter (where not a.digital), 0)    as shipping_pos,
      coalesce(sum(a.shipping) filter (where a.digital), 0)        as shipping_digital
    from alloc a
  ),
  tips as (
    select
      coalesce(sum(p.tip), 0)                         as tips,
      coalesce(sum(p.tip * p.digital_share), 0)       as tips_digital
    from pays p
  ),
  by_method as (
    select p.method::text as method,
           sum(p.amount) as total,
           sum(p.amount * p.digital_share) as digital
    from pays p
    group by p.method
  ),
  by_service as (
    select a.service_type,
           sum(a.amount) as total,
           coalesce(sum(a.amount) filter (where a.digital), 0) as digital
    from alloc a
    group by a.service_type
  ),
  days as (
    select d::date as day
    from generate_series(p_from, p_to, interval '1 day') d
  ),
  daily as (
    select ((a.paid_at at time zone v_tz) - v_cutoff)::date as day,
           sum(a.amount) as amount
    from alloc a
    group by 1
  ),
  by_weekday as (
    select extract(isodow from d.day)::int as dow,
           round(avg(coalesce(dl.amount, 0)), 2) as avg_sales
    from days d
    left join daily dl on dl.day = d.day
    group by 1
  ),
  products as (
    select coalesce(p.name, max(oi.product_name)) as name,
           sum(oi.quantity)::bigint as quantity,
           sum(oi.subtotal) as amount
    from public.order_items oi
    join alloc a on a.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    where not oi.cancelled
    group by oi.product_id, p.name,
             case when oi.product_id is null then oi.product_name end
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', p_to - p_from + 1,
    'sales', jsonb_build_object('total', round(t.sales, 2), 'pos', round(t.sales_pos, 2), 'digital', round(t.sales_digital, 2)),
    'orders', jsonb_build_object('total', t.orders, 'pos', t.orders_pos, 'digital', t.orders_digital),
    'shipping', jsonb_build_object('total', round(t.shipping, 2), 'pos', round(t.shipping_pos, 2), 'digital', round(t.shipping_digital, 2)),
    'tips', jsonb_build_object('total', round(tp.tips, 2), 'pos', round(tp.tips - tp.tips_digital, 2), 'digital', round(tp.tips_digital, 2)),
    'avg_ticket', jsonb_build_object(
      'total',   case when t.orders > 0 then round(t.sales / t.orders, 2) else 0 end,
      'pos',     case when t.orders_pos > 0 then round(t.sales_pos / t.orders_pos, 2) else 0 end,
      'digital', case when t.orders_digital > 0 then round(t.sales_digital / t.orders_digital, 2) else 0 end
    ),
    'by_weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', w.dow, 'avg_sales', w.avg_sales) order by w.dow)
      from by_weekday w), '[]'::jsonb),
    'by_method', coalesce((
      select jsonb_agg(jsonb_build_object(
               'method', m.method, 'total', round(m.total, 2),
               'pos', round(m.total - m.digital, 2), 'digital', round(m.digital, 2))
             order by m.total desc)
      from by_method m), '[]'::jsonb),
    'by_service', coalesce((
      select jsonb_agg(jsonb_build_object(
               'service_type', s.service_type, 'total', round(s.total, 2),
               'pos', round(s.total - s.digital, 2), 'digital', round(s.digital, 2))
             order by s.total desc)
      from by_service s), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'quantity', x.quantity, 'amount', round(x.amount, 2)))
      from (select * from products order by quantity desc, amount desc, name limit 5) x), '[]'::jsonb),
    'bottom_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'quantity', x.quantity, 'amount', round(x.amount, 2)))
      from (select * from products order by quantity asc, amount asc, name limit 5) x), '[]'::jsonb)
  )
  into v_result
  from totals t
  cross join tips tp;

  return v_result;
end;
$$;

revoke all on function public.get_home_dashboard(uuid, date, date) from public, anon;
grant execute on function public.get_home_dashboard(uuid, date, date) to authenticated, service_role;
