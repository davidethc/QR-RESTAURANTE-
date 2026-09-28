-- ---------------------------------------------------------------------------
-- Robustez de sesiones (5/6) · Barrido de sesiones vacías abandonadas.
--
-- Hoy las sesiones vencen de forma perezosa (solo al volver a escanear o al
-- tomar un pedido en esa mesa). Esta función la llama pg_cron cada 30 min
-- (migración siguiente) y vence SOLO sesiones:
--   · ACTIVE de mesa (table_kind = 'TABLE', nunca mostrador)
--   · sin NINGÚN pedido (en cualquier estado)
--   · sin llamadas abiertas (PENDING/ACCEPTED)
--   · sin cuenta viva (OPEN/PAID)
--   · con más de 4 h de inactividad (table_session_last_activity)
-- Una sesión con cualquier pedido nunca la toca este barrido.
--
-- Candados en el mismo orden que resolve_table_qr / create_staff_order
-- (mesa -> sesión) y con SKIP LOCKED: si alguien está usando la mesa en ese
-- instante, se salta y se reintenta en el próximo barrido. Sin esto el
-- trigger table_sessions_refresh_table_status (que toca tables) podía
-- cruzarse con un escaneo y producir un deadlock.
--
-- p_restaurant_id (opcional) limita el barrido a un restaurante; el job lo
-- llama sin argumento. Corre como el dueño del job (postgres). No se expone
-- por la API.
-- ---------------------------------------------------------------------------

create or replace function public.expire_idle_empty_table_sessions(p_restaurant_id uuid default null)
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_candidate record;
  v_count integer := 0;
begin
  for v_candidate in
    select ts.id, ts.table_id
    from public.table_sessions ts
    where ts.status = 'ACTIVE'
      and ts.table_kind = 'TABLE'
      and (p_restaurant_id is null or ts.restaurant_id = p_restaurant_id)
      and ts.last_activity_at < now() - interval '4 hours'
      and not exists (select 1 from public.orders o where o.table_session_id = ts.id)
  loop
    perform 1
    from public.tables
    where id = v_candidate.table_id
    for update skip locked;

    if not found then
      continue;
    end if;

    perform 1
    from public.table_sessions
    where id = v_candidate.id
    for update skip locked;

    if not found then
      continue;
    end if;

    update public.table_sessions ts
    set status = 'EXPIRED'
    where ts.id = v_candidate.id
      and ts.status = 'ACTIVE'
      and not exists (select 1 from public.orders o where o.table_session_id = ts.id)
      and not exists (
        select 1 from public.waiter_calls wc
        where wc.table_session_id = ts.id
          and wc.status in ('PENDING', 'ACCEPTED')
      )
      and not exists (
        select 1 from public.bills b
        where b.table_session_id = ts.id
          and b.status in ('OPEN', 'PAID')
      )
      and public.table_session_last_activity(ts.id) < now() - interval '4 hours';

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_idle_empty_table_sessions(uuid) is
  'Vence sesiones de mesa ACTIVE sin ningún pedido y con más de 4 h de inactividad. pg_cron la llama sin argumento (todos los restaurantes) cada 30 min; p_restaurant_id la limita a uno (pruebas). Devuelve cuántas venció.';

revoke all on function public.expire_idle_empty_table_sessions(uuid) from public, anon, authenticated;
grant execute on function public.expire_idle_empty_table_sessions(uuid) to service_role;
