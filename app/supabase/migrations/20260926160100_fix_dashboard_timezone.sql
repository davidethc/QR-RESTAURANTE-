-- ---------------------------------------------------------------------------
-- Fase 0 · M2 · El dashboard cuenta "hoy" en hora local del restaurante.
--
-- Antes: created_at >= date_trunc('day', now()), o sea medianoche UTC
-- (19:00 en Guayaquil). Pedidos de la noche se contaban en el día siguiente.
-- Ahora: [inicio, fin) del día comercial de hoy según business_day_bounds.
--
-- La forma del JSON no cambia (DashboardSummary en app/src/types/staff.ts).
-- La semántica de orders_today (todos los estados) y revenue_today (DELIVERED,
-- por created_at) se conserva; solo cambia la ventana de tiempo.
--
-- get_tables_status no se toca aquí: desde la migración 045 ya no depende de
-- la fecha (active_total sale de la sesión ACTIVE). Su cambio de estado en
-- vivo va en M3 (table_status_occupied_while_session_active).
-- ---------------------------------------------------------------------------

create or replace function public.get_dashboard_summary(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  v_today := public.business_today(p_restaurant_id);

  select b.start_at, b.end_at
  into v_start, v_end
  from public.business_day_bounds(p_restaurant_id, v_today, v_today) b;

  select jsonb_build_object(
    'pending_orders',   (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'PENDING'),
    'accepted_orders',  (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'ACCEPTED'),
    'preparing_orders', (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'PREPARING'),
    'ready_orders',     (select count(*) from public.orders where restaurant_id = p_restaurant_id and status = 'READY'),
    'pending_calls',    (select count(*) from public.waiter_calls where restaurant_id = p_restaurant_id and status in ('PENDING','ACCEPTED')),
    'occupied_tables',  (select count(*) from public.tables where restaurant_id = p_restaurant_id and status <> 'AVAILABLE' and status <> 'INACTIVE'),
    'total_tables',     (select count(*) from public.tables where restaurant_id = p_restaurant_id and status <> 'INACTIVE'),
    'orders_today',     (select count(*) from public.orders
                          where restaurant_id = p_restaurant_id
                            and created_at >= v_start and created_at < v_end),
    'revenue_today',    (select coalesce(sum(total), 0) from public.orders
                          where restaurant_id = p_restaurant_id
                            and status = 'DELIVERED'
                            and created_at >= v_start and created_at < v_end)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_summary(uuid) from public;
revoke execute on function public.get_dashboard_summary(uuid) from anon;
grant execute on function public.get_dashboard_summary(uuid) to authenticated, service_role;
