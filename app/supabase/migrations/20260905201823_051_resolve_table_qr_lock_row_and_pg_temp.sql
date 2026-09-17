-- Serializa el escaneo del QR sobre la fila de la mesa.
--
-- Con el índice único de la migración 050, dos clientes escaneando el
-- mismo QR a la vez ya no crean dos sesiones — pero el segundo se
-- llevaría una violación de unicidad y vería "QR inválido", que es peor
-- que el problema original. Bloqueando la fila de la mesa, el segundo
-- escaneo espera al primero y luego encuentra la sesión que este acaba
-- de crear, que es exactamente lo que debe pasar: los dos comensales
-- comparten la sesión de su mesa.
--
-- El bloqueo dura lo que dura la función (milisegundos) y solo afecta a
-- escaneos de LA MISMA mesa.
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
as $function$
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
  limit 1;

  if found and v_session.last_activity_at < now() - interval '4 hours' then
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
$function$;

-- pg_temp explícito en TODA función SECURITY DEFINER.
--
-- Cuando no se lista, Postgres antepone pg_temp al buscar tablas: una
-- tabla temporal llamada como una real podría secuestrar las lecturas
-- de dentro de la función, que corre con permisos del dueño. Hoy no es
-- explotable desde la API (PostgREST no acepta SQL suelto), pero es
-- la corrección de una línea por función y cierra la puerta.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c
        where c like 'search_path=%pg_temp%'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;
