-- ---------------------------------------------------------------------------
-- Permisos (2/6) · get_dashboard_summary: el dinero solo para OWNER/ADMIN.
--
-- revenue_today (la única cifra de dinero de la respuesta) se devuelve en
-- null a WAITER y KITCHEN. Mismo shape: la clave sigue existiendo.
-- En app/src, revenue_today no se muestra en ninguna pantalla; solo el tipo
-- (types/staff.ts) debería pasar a number | null.
--
-- Resto del cuerpo idéntico a la versión vigente en producción.
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
  v_sees_money boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  v_sees_money := public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
               or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN');

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
    'occupied_tables',  (select count(*) from public.tables t
                          where t.restaurant_id = p_restaurant_id
                            and t.kind = 'TABLE'  -- C2
                            and t.status <> 'INACTIVE'
                            and public.table_effective_status(t.id) <> 'AVAILABLE'),
    'total_tables',     (select count(*) from public.tables
                          where restaurant_id = p_restaurant_id
                            and kind = 'TABLE'  -- C2
                            and status <> 'INACTIVE'),
    'orders_today',     (select count(*) from public.orders
                          where restaurant_id = p_restaurant_id
                            and created_at >= v_start and created_at < v_end),
    'revenue_today',    case when v_sees_money then
                          (select coalesce(sum(total), 0) from public.orders
                            where restaurant_id = p_restaurant_id
                              and status = 'DELIVERED'
                              and created_at >= v_start and created_at < v_end)
                        end
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_summary(uuid) from public, anon;
grant execute on function public.get_dashboard_summary(uuid) to authenticated, service_role;
