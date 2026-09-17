
create or replace function public.resolve_table_qr(p_qr_token uuid)
returns table(restaurant_id uuid, restaurant_name text, restaurant_slug text, table_id uuid, table_number integer, session_token uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_table public.tables%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_session public.table_sessions%rowtype;
begin
  select *
  into v_table
  from public.tables
  where qr_token = p_qr_token
    and status <> 'INACTIVE';

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

  -- Reutiliza la sesión ACTIVA de la mesa si ya existe (un cliente que
  -- vuelve a escanear el mismo QR, o pierde la cookie) en vez de crear
  -- una nueva: antes cada escaneo insertaba otra fila ACTIVE, y las
  -- viejas quedaban huérfanas para siempre inflando active_total en
  -- /tables aunque su cuenta ya se hubiera pagado.
  select *
  into v_session
  from public.table_sessions
  where table_id = v_table.id
    and status = 'ACTIVE'
  order by started_at desc
  limit 1;

  if not found then
    insert into public.table_sessions (
      restaurant_id,
      table_id
    )
    values (
      v_restaurant.id,
      v_table.id
    )
    returning *
    into v_session;
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
