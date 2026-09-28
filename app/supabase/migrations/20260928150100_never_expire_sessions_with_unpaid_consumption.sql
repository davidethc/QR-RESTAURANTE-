-- ---------------------------------------------------------------------------
-- Robustez de sesiones (2/6) · Una sesión con consumo sin cobrar nunca vence.
--
-- Son los dos únicos caminos que pasaban sesiones a EXPIRED por inactividad
-- (revisado con pg_get_functiondef sobre todo el schema public):
--   · resolve_table_qr                     (el cliente escanea el QR)
--   · find_or_create_active_table_session  (el mesero toma un pedido)
--
-- Cambios:
--   1. Si table_session_has_unpaid_consumption(sesión) es true, la sesión
--      NO se vence: se reutiliza. El cliente que escanea entra a esa sesión
--      y la cuenta queda para que el admin la cobre.
--   2. La inactividad se mide con table_session_last_activity (incluye
--      pedidos y llamadas), la misma que usa table_effective_status. Antes se
--      usaba solo last_activity_at, que el mesero no renueva al mover
--      pedidos: la mesa podía verse "Ocupada" y aun así vencerse al escanear.
--   3. Las sesiones sin consumo siguen venciendo a las 4 h, como hoy.
--
-- Mismo cuerpo que la versión vigente en producción en todo lo demás.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_table_qr(p_qr_token uuid)
returns table(
  restaurant_id uuid,
  restaurant_name text,
  restaurant_slug text,
  table_id uuid,
  table_number integer,
  session_token uuid
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_table public.tables%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_session public.table_sessions%rowtype;
begin
  -- for update: el candado que hace atómico todo lo que sigue.
  select *
  into v_table
  from public.tables
  where qr_token = p_qr_token
    and status <> 'INACTIVE'
    and kind = 'TABLE'  -- C2: el mostrador no tiene QR de cliente.
  for update;

  if not found then
    raise exception 'QR inválido o mesa no disponible';
  end if;

  select *
  into v_restaurant
  from public.restaurants
  where id = v_table.restaurant_id
    and status = 'ACTIVE';

  if not found then
    raise exception 'Restaurante no disponible';
  end if;

  select ts.*
  into v_session
  from public.table_sessions ts
  where ts.table_id = v_table.id
    and ts.status = 'ACTIVE'
  order by ts.started_at desc
  limit 1
  for update;

  -- Solo vence por inactividad una sesión SIN consumo por cobrar.
  if found
     and public.table_session_last_activity(v_session.id) < now() - interval '4 hours'
     and not public.table_session_has_unpaid_consumption(v_session.id) then
    update public.table_sessions
    set status = 'EXPIRED'
    where id = v_session.id;

    v_session := null;
  end if;

  if v_session.id is null then
    insert into public.table_sessions (restaurant_id, table_id)
    values (v_restaurant.id, v_table.id)
    returning * into v_session;
  else
    update public.table_sessions
    set last_activity_at = now()
    where id = v_session.id;
  end if;

  return query
  select
    v_restaurant.id,
    v_restaurant.name,
    v_restaurant.slug,
    v_table.id,
    v_table.number,
    v_session.session_token;
end;
$$;

create or replace function public.find_or_create_active_table_session(
  p_table_id uuid,
  p_restaurant_id uuid
)
returns public.table_sessions
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session public.table_sessions%rowtype;
begin
  select *
  into v_session
  from public.table_sessions
  where table_id = p_table_id
    and status = 'ACTIVE'
  order by started_at desc
  limit 1
  for update;

  -- Solo vence por inactividad una sesión SIN consumo por cobrar.
  if found
     and public.table_session_last_activity(v_session.id) < now() - interval '4 hours'
     and not public.table_session_has_unpaid_consumption(v_session.id) then
    update public.table_sessions
    set status = 'EXPIRED'
    where id = v_session.id;

    v_session := null;
  end if;

  if v_session.id is null then
    insert into public.table_sessions (restaurant_id, table_id)
    values (p_restaurant_id, p_table_id)
    returning * into v_session;
  else
    update public.table_sessions
    set last_activity_at = now()
    where id = v_session.id
    returning * into v_session;
  end if;

  return v_session;
end;
$$;

-- CREATE OR REPLACE conserva los grants; se reafirman por claridad.
revoke all on function public.resolve_table_qr(uuid) from public;
grant execute on function public.resolve_table_qr(uuid) to anon, authenticated, service_role;

revoke all on function public.find_or_create_active_table_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.find_or_create_active_table_session(uuid, uuid) to service_role;
