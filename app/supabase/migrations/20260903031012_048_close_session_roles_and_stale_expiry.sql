
-- close_table_session quedaba abierta a cualquier rol autenticado del
-- restaurante (incluida COCINA) porque solo validaba pertenencia al
-- restaurante, no rol — igual que el resto de acciones de mesero
-- (handle_waiter_call, accept_order, etc.), ahora se restringe a
-- OWNER/ADMIN/WAITER, quienes son los que de verdad atienden mesas.
create or replace function public.close_table_session(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_restaurant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select restaurant_id into v_restaurant_id
  from public.tables
  where id = p_table_id;

  if not found then
    raise exception 'Mesa no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para liberar mesas';
  end if;

  if exists (
    select 1 from public.orders
    where table_id = p_table_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
  ) then
    raise exception 'La mesa tiene pedidos activos';
  end if;

  update public.table_sessions
  set status = 'CLOSED',
      closed_at = now()
  where table_id = p_table_id
    and status = 'ACTIVE';

  perform public.refresh_table_status(p_table_id);
end;
$function$;

revoke execute on function public.close_table_session(uuid) from anon;

-- Red de seguridad: si nadie liberó la mesa a mano (el cliente pagó en
-- efectivo, se fue sin pedir la cuenta por la app, etc.), una sesión
-- "activa" podía quedar viva indefinidamente — y el próximo cliente que
-- escaneara ese QR se mezclaría con la cuenta del anterior. Si la
-- sesión activa encontrada lleva más de 4 horas sin actividad (más que
-- cualquier comida real), se da por abandonada: se marca EXPIRED y se
-- arranca una sesión nueva en vez de reutilizarla.
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
