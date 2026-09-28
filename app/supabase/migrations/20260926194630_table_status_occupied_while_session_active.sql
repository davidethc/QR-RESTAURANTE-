-- ---------------------------------------------------------------------------
-- Fase 0 · M3 · Con cobro activo, la mesa sigue OCUPADA mientras la sesión
-- tenga consumo. Depende de M1 (business_today en el dashboard).
--
-- Antes: al entregar el último pedido la mesa pasaba a AVAILABLE aunque la
-- gente siguiera sentada y sin pagar.
--
-- Regla (prioridad de mayor a menor):
--   INACTIVE          lo fija el admin; nunca se toca.
--   BILL_REQUESTED    llamada BILL pendiente o aceptada.
--   ATTENTION         llamada WAITER pendiente o aceptada.
--   OCCUPIED          pedidos en PENDING..READY, o
--                     SOLO si restaurants.billing_enabled = true: sesión
--                     ACTIVE "viva" con al menos un pedido que no esté
--                     REJECTED ni CANCELLED.
--   AVAILABLE         en otro caso.
-- Con billing_enabled = false el resultado es idéntico al refresh_table_status
-- anterior (Omm Siri no cambia hasta que active el cobro).
--
-- DECISIÓN · sesión "viva" (table_session_last_activity):
--   status = 'ACTIVE' y
--   greatest(last_activity_at, max(orders.updated_at), max(waiter_calls.updated_at))
--   de la sesión dentro de las últimas 4 h. La ventana es la misma que usan
--   resolve_table_qr y find_or_create_active_table_session para marcar
--   EXPIRED; se suman los updated_at de pedidos y llamadas para que cuente la
--   actividad de cocina y mesero (last_activity_at solo se renueva al
--   escanear, pedir o llamar). Hoy la base expira sesiones de forma perezosa,
--   así que hay sesiones ACTIVE abandonadas desde hace días; sin la ventana
--   esas mesas quedarían "Ocupada" para siempre.
--   active_total en get_tables_status usa la misma ventana (esto aplica a
--   todos los restaurantes): una sesión vencida ya no suma en la rejilla.
--
-- DECISIÓN · cómo se "des-ocupa" una mesa al vencer la ventana, sin pg_cron:
--   tables.status solo se recalcula por triggers, así que el valor guardado
--   puede quedar OCCUPIED después de las 4 h hasta el siguiente evento. Por
--   eso el estado se calcula EN VIVO con table_effective_status():
--     · get_tables_status devuelve el estado efectivo (no el guardado).
--     · get_dashboard_summary cuenta occupied_tables con el estado efectivo.
--   El valor guardado se corrige en cuanto pasa cualquiera de estos eventos:
--     · se cierra la sesión (close_table_session, handle_waiter_call BILL
--       ATTENDED, y más adelante finalize_bill del módulo de cobro);
--     · alguien escanea el QR o el mesero toma pedido: la sesión vieja pasa a
--       EXPIRED y el trigger nuevo sobre table_sessions recalcula;
--     · cualquier cambio de estado de pedidos o llamadas de esa mesa.
--
-- TODO (M12): con billing_enabled, una cuenta con saldo pendiente debe
-- mantener la mesa ocupada aunque la sesión venza. Se agrega cuando exista
-- la tabla bills; aquí no se referencia.
-- ---------------------------------------------------------------------------

-- La bandera nace aquí (y no en M5) porque table_effective_status la lee:
-- si se creara después, cualquier trigger de pedidos entre M3 y M5 fallaría.
-- M5 la repite con "if not exists" y le pone el comentario.
alter table public.restaurants
  add column if not exists billing_enabled boolean not null default false;

-- No hace falta recalcular tables.status al aplicar: con billing_enabled =
-- false en todos los restaurantes, la regla da lo mismo que la anterior.

create or replace function public.table_session_last_activity(p_session_id uuid)
returns timestamptz
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select greatest(
    ts.last_activity_at,
    (select max(o.updated_at) from public.orders o where o.table_session_id = ts.id),
    (select max(wc.updated_at) from public.waiter_calls wc where wc.table_session_id = ts.id)
  )
  from public.table_sessions ts
  where ts.id = p_session_id;
$$;

revoke all on function public.table_session_last_activity(uuid) from public, anon, authenticated;
grant execute on function public.table_session_last_activity(uuid) to service_role;


create or replace function public.table_effective_status(p_table_id uuid)
returns public.table_status
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_current public.table_status;
  v_billing boolean;
begin
  select t.status, r.billing_enabled
  into v_current, v_billing
  from public.tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.id = p_table_id;

  if not found then
    return null;
  end if;

  if v_current = 'INACTIVE' then
    return 'INACTIVE';
  end if;

  if exists (
    select 1 from public.waiter_calls
    where table_id = p_table_id
      and type = 'BILL'
      and status in ('PENDING', 'ACCEPTED')
  ) then
    return 'BILL_REQUESTED';
  end if;

  if exists (
    select 1 from public.waiter_calls
    where table_id = p_table_id
      and type = 'WAITER'
      and status in ('PENDING', 'ACCEPTED')
  ) then
    return 'ATTENTION';
  end if;

  if exists (
    select 1 from public.orders
    where table_id = p_table_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
  ) then
    return 'OCCUPIED';
  end if;

  if v_billing and exists (
    select 1
    from public.table_sessions ts
    where ts.table_id = p_table_id
      and ts.status = 'ACTIVE'
      and public.table_session_last_activity(ts.id) >= now() - interval '4 hours'
      and exists (
        select 1 from public.orders o
        where o.table_session_id = ts.id
          and o.status not in ('REJECTED', 'CANCELLED')
      )
  ) then
    return 'OCCUPIED';
  end if;

  return 'AVAILABLE';
end;
$$;

-- Solo la usan funciones SECURITY DEFINER (corren como el owner).
revoke all on function public.table_effective_status(uuid) from public, anon, authenticated;
grant execute on function public.table_effective_status(uuid) to service_role;


create or replace function public.refresh_table_status(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_current public.table_status;
  v_new public.table_status;
begin
  select status into v_current
  from public.tables
  where id = p_table_id;

  if not found or v_current = 'INACTIVE' then
    return;
  end if;

  v_new := public.table_effective_status(p_table_id);

  if v_new is distinct from v_current then
    update public.tables
    set status = v_new
    where id = p_table_id;
  end if;
end;
$$;

revoke all on function public.refresh_table_status(uuid) from public, anon, authenticated;
grant execute on function public.refresh_table_status(uuid) to service_role;


-- Cerrar o expirar una sesión cambia el estado de la mesa.
drop trigger if exists table_sessions_refresh_table_status on public.table_sessions;
create trigger table_sessions_refresh_table_status
after insert or update of status on public.table_sessions
for each row execute function public.trg_refresh_table_status();


create or replace function public.get_tables_status(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
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
        -- Estado calculado en vivo: si la sesión venció por tiempo, la mesa
        -- aparece libre aunque tables.status aún no se haya recalculado.
        'status',        public.table_effective_status(t.id),
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
          -- Total de la sesión ACTIVE actual (ver migración 045), solo si
          -- sigue viva: una sesión abandonada ya no suma.
          select coalesce(sum(o.total), 0)
          from public.orders o
          join public.table_sessions ts on ts.id = o.table_session_id
          where o.table_id = t.id
            and ts.status = 'ACTIVE'
            and public.table_session_last_activity(ts.id) >= now() - interval '4 hours'
            and o.status not in ('REJECTED', 'CANCELLED')
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

revoke all on function public.get_tables_status(uuid) from public;
revoke execute on function public.get_tables_status(uuid) from anon;
grant execute on function public.get_tables_status(uuid) to authenticated, service_role;


-- Igual que M2 (día comercial local) pero occupied_tables con el estado
-- efectivo, para que coincida con la rejilla de mesas.
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
    'occupied_tables',  (select count(*) from public.tables t
                          where t.restaurant_id = p_restaurant_id
                            and t.status <> 'INACTIVE'
                            and public.table_effective_status(t.id) <> 'AVAILABLE'),
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
