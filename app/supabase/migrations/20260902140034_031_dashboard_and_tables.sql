
-- Contadores del dashboard: los números grandes que el mesero mira al entrar.
create or replace function public.get_dashboard_summary(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object(
    'pending_orders',   (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'PENDING'),
    'accepted_orders',  (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'ACCEPTED'),
    'preparing_orders', (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'PREPARING'),
    'ready_orders',     (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'READY'),
    'pending_calls',    (select count(*) from public.waiter_calls where restaurant_id = p_restaurant_id and status in ('PENDING','ACCEPTED')),
    'occupied_tables',  (select count(*) from public.tables where restaurant_id = p_restaurant_id and status <> 'AVAILABLE' and status <> 'INACTIVE'),
    'total_tables',     (select count(*) from public.tables where restaurant_id = p_restaurant_id and status <> 'INACTIVE'),
    'orders_today',     (select count(*) from public.orders where restaurant_id = p_restaurant_id and created_at >= date_trunc('day', now())),
    'revenue_today',    (select coalesce(sum(total),0) from public.orders where restaurant_id = p_restaurant_id and status = 'DELIVERED' and created_at >= date_trunc('day', now()))
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_dashboard_summary(uuid) from public, anon;
grant execute on function public.get_dashboard_summary(uuid) to authenticated;


-- Mesas con lo que está pasando en cada una: la rejilla de colores del mesero.
create or replace function public.get_tables_status(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',            t.id,
        'number',        t.number,
        'name',          t.name,
        'status',        t.status,
        'qr_token',      t.qr_token,
        'active_orders', (
          select count(*)
          from public.orders o
          where o.table_id = t.id
            and o.status in ('PENDING','ACCEPTED','PREPARING','READY')
        ),
        'pending_calls', (
          select count(*)
          from public.waiter_calls wc
          where wc.table_id = t.id
            and wc.status in ('PENDING','ACCEPTED')
        ),
        'active_total', (
          select coalesce(sum(o.total),0)
          from public.orders o
          where o.table_id = t.id
            and o.status in ('PENDING','ACCEPTED','PREPARING','READY','DELIVERED')
            and o.created_at >= date_trunc('day', now())
        )
      )
      order by t.number
    ),
    '[]'::jsonb
  )
  into v_result
  from public.tables t
  where t.restaurant_id = p_restaurant_id;

  return v_result;
end;
$$;

revoke execute on function public.get_tables_status(uuid) from public, anon;
grant execute on function public.get_tables_status(uuid) to authenticated;
