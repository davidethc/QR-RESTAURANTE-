-- ---------------------------------------------------------------------------
-- Resumen de ventas para el dueño/administrador: hoy, 7 o 30 días de negocio
-- (respeta zona horaria y business_day_cutoff del restaurante).
--
-- Con cobro activo (billing_enabled) la venta sale de las cuentas cobradas y
-- los pagos. Sin cobro, de los pedidos entregados — así el reporte sirve
-- también a quien cobra fuera de Monky. `source` dice cuál se usó.
-- ---------------------------------------------------------------------------
create or replace function public.get_sales_report(
  p_restaurant_id uuid,
  p_days integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_billing boolean;
  v_to date;
  v_from date;
  v_start timestamptz;
  v_end timestamptz;
  v_summary jsonb;
  v_by_day jsonb;
  v_by_method jsonb;
  v_top jsonb;
  v_open jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
          or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')) then
    raise exception 'No autorizado';
  end if;

  if p_days not in (1, 7, 30) then
    raise exception 'Periodo no válido';
  end if;

  select billing_enabled into v_billing from public.restaurants where id = p_restaurant_id;

  v_to := public.business_today(p_restaurant_id);
  v_from := v_to - (p_days - 1);
  select start_at, end_at into v_start, v_end
    from public.business_day_bounds(p_restaurant_id, v_from, v_to);

  if v_billing then
    with sold as (
      select b.total, b.discount_total, b.tip_total, coalesce(b.paid_at, b.closed_at) as at
        from public.bills b
       where b.restaurant_id = p_restaurant_id
         and b.status in ('PAID', 'CLOSED')
         and coalesce(b.paid_at, b.closed_at) >= v_start
         and coalesce(b.paid_at, b.closed_at) < v_end
    )
    select
      jsonb_build_object(
        'total_sold', coalesce(sum(total), 0),
        'tickets',    count(*),
        'avg_ticket', coalesce(round(avg(total), 2), 0),
        'discounts',  coalesce(sum(discount_total), 0),
        'tips',       coalesce(sum(tip_total), 0)
      ),
      coalesce((
        select jsonb_agg(jsonb_build_object('date', d, 'total', t) order by d)
          from (select public.business_date(p_restaurant_id, at) as d, sum(total) as t
                  from sold group by 1) x
      ), '[]'::jsonb)
    into v_summary, v_by_day
    from sold;

    select coalesce(jsonb_agg(jsonb_build_object('method', method, 'total', total) order by total desc), '[]'::jsonb)
      into v_by_method
      from (
        select p.method, sum(p.amount) as total
          from public.payments p
         where p.restaurant_id = p_restaurant_id
           and p.status = 'COMPLETED'
           and p.received_at >= v_start
           and p.received_at < v_end
         group by p.method
      ) m;

    select jsonb_build_object('count', count(*), 'total', coalesce(sum(balance), 0))
      into v_open
      from public.bills
     where restaurant_id = p_restaurant_id and status = 'OPEN';
  else
    with sold as (
      select o.total, o.created_at as at
        from public.orders o
       where o.restaurant_id = p_restaurant_id
         and o.status = 'DELIVERED'
         and o.created_at >= v_start
         and o.created_at < v_end
    )
    select
      jsonb_build_object(
        'total_sold', coalesce(sum(total), 0),
        'tickets',    count(*),
        'avg_ticket', coalesce(round(avg(total), 2), 0),
        'discounts',  0,
        'tips',       0
      ),
      coalesce((
        select jsonb_agg(jsonb_build_object('date', d, 'total', t) order by d)
          from (select public.business_date(p_restaurant_id, at) as d, sum(total) as t
                  from sold group by 1) x
      ), '[]'::jsonb)
    into v_summary, v_by_day
    from sold;

    v_by_method := '[]'::jsonb;
    v_open := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', product_name, 'quantity', qty, 'total', total
         ) order by qty desc, total desc), '[]'::jsonb)
    into v_top
    from (
      select oi.product_name, sum(oi.quantity) as qty, sum(oi.subtotal) as total
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
       where o.restaurant_id = p_restaurant_id
         and o.status = 'DELIVERED'
         and o.created_at >= v_start
         and o.created_at < v_end
       group by oi.product_name
       order by qty desc, total desc
       limit 10
    ) t;

  return jsonb_build_object(
    'source',     case when v_billing then 'bills' else 'orders' end,
    'days',       p_days,
    'from',       v_from,
    'to',         v_to,
    'summary',    v_summary,
    'by_day',     v_by_day,
    'by_method',  v_by_method,
    'top_products', v_top,
    'open_bills', v_open
  );
end;
$$;

revoke all on function public.get_sales_report(uuid, integer) from public, anon;
grant execute on function public.get_sales_report(uuid, integer) to authenticated;
