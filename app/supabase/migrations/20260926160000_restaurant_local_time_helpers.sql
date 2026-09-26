-- ---------------------------------------------------------------------------
-- Fase 0 · M1 · Hora local del restaurante y día comercial.
--
-- Hasta ahora "hoy" se calculaba con date_trunc('day', now()) en UTC. En
-- Guayaquil (UTC-5) eso corta el día a las 19:00 locales. Todo cálculo por
-- día (dashboard, reportes, cierres diarios) debe pasar por estos helpers.
--
-- Día comercial: una venta a las 01:30 locales pertenece al día anterior
-- mientras la hora local sea menor que business_day_cutoff (04:00 por
-- defecto).
--
--   business_date(r, ts)          = ((ts at time zone tz) - cutoff)::date
--   business_day_bounds(r, d1, d2) = [d1 + cutoff, d2 + 1 + cutoff) en tz,
--                                     devuelto como timestamptz (semiabierto)
--
-- Los helpers son SECURITY INVOKER a propósito: leen restaurants con los
-- permisos de quien llama. Dentro de las RPCs SECURITY DEFINER corren como
-- el owner, así que funcionan; llamados directo por un usuario, RLS solo le
-- deja ver sus propios restaurantes. anon no tiene execute.
-- ---------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists business_day_cutoff time not null default '04:00';

-- Solo el OWNER puede cambiarla: lo protege el trigger
-- restaurants_guard_owner_settings de la migración billing_enums_and_settings.
comment on column public.restaurants.business_day_cutoff is
  'Hora local a la que empieza el día comercial. Antes de esta hora, las ventas cuentan para el día anterior.';


-- El timezone es texto libre. Un valor inválido haría fallar "at time zone"
-- en cada RPC que calcula días, así que se valida al escribir.
create or replace function public.validate_restaurant_timezone()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.timezone is null
     or not exists (
       select 1 from pg_catalog.pg_timezone_names where name = new.timezone
     )
  then
    raise exception 'Zona horaria inválida: %', new.timezone
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_restaurant_timezone() from public, anon, authenticated;

drop trigger if exists restaurants_validate_timezone on public.restaurants;
create trigger restaurants_validate_timezone
before insert or update of timezone on public.restaurants
for each row execute function public.validate_restaurant_timezone();


create or replace function public.restaurant_tz(p_restaurant_id uuid)
returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz text;
begin
  select timezone into v_tz
  from public.restaurants
  where id = p_restaurant_id;

  if v_tz is null then
    raise exception 'Restaurante no encontrado';
  end if;

  return v_tz;
end;
$$;


create or replace function public.business_date(
  p_restaurant_id uuid,
  p_ts timestamptz default now()
)
returns date
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz text;
  v_cutoff time;
begin
  select timezone, business_day_cutoff
  into v_tz, v_cutoff
  from public.restaurants
  where id = p_restaurant_id;

  if v_tz is null then
    raise exception 'Restaurante no encontrado';
  end if;

  return ((p_ts at time zone v_tz) - v_cutoff::interval)::date;
end;
$$;


create or replace function public.business_day_bounds(
  p_restaurant_id uuid,
  p_from date,
  p_to date
)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tz text;
  v_cutoff time;
begin
  if p_from is null or p_to is null then
    raise exception 'Rango de fechas incompleto';
  end if;

  if p_to < p_from then
    raise exception 'La fecha final es anterior a la inicial';
  end if;

  select timezone, business_day_cutoff
  into v_tz, v_cutoff
  from public.restaurants
  where id = p_restaurant_id;

  if v_tz is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- date + time = timestamp sin zona (hora local); "at time zone tz" lo
  -- convierte al instante real, respetando cambios de horario si los hay.
  return query
  select
    ((p_from + v_cutoff) at time zone v_tz),
    (((p_to + 1) + v_cutoff) at time zone v_tz);
end;
$$;


create or replace function public.business_today(p_restaurant_id uuid)
returns date
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select public.business_date(p_restaurant_id, now());
$$;


revoke all on function public.restaurant_tz(uuid) from public, anon;
revoke all on function public.business_date(uuid, timestamptz) from public, anon;
revoke all on function public.business_day_bounds(uuid, date, date) from public, anon;
revoke all on function public.business_today(uuid) from public, anon;

grant execute on function public.restaurant_tz(uuid) to authenticated, service_role;
grant execute on function public.business_date(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.business_day_bounds(uuid, date, date) to authenticated, service_role;
grant execute on function public.business_today(uuid) to authenticated, service_role;
