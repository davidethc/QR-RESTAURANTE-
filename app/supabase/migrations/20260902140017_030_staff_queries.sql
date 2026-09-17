
-- Arranque del panel: al entrar, saber quién soy, dónde trabajo y qué puedo hacer.
create or replace function public.get_my_restaurant()
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

  select jsonb_build_object(
    'user', jsonb_build_object(
      'id',        p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url
    ),
    'role', rm.role,
    'restaurant', jsonb_build_object(
      'id',       r.id,
      'name',     r.name,
      'slug',     r.slug,
      'logo_url', r.logo_url,
      'timezone', r.timezone
    )
  )
  into v_result
  from public.restaurant_members rm
  join public.restaurants r on r.id = rm.restaurant_id
  join public.profiles p on p.id = rm.user_id
  where rm.user_id = auth.uid()
    and rm.status = 'ACTIVE'
  limit 1;

  if v_result is null then
    raise exception 'Tu cuenta no está asignada a ningún restaurante';
  end if;

  return v_result;
end;
$$;

revoke execute on function public.get_my_restaurant() from public, anon;
grant execute on function public.get_my_restaurant() to authenticated;


-- Pedidos con sus productos, filtrados por estado.
-- Una sola llamada devuelve todo lo que una pantalla del panel necesita pintar.
create or replace function public.get_staff_orders(
  p_restaurant_id uuid,
  p_statuses public.order_status[] default null,
  p_limit integer default 50
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
    jsonb_agg(o order by o.created_at),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      ord.id,
      ord.order_number,
      ord.status,
      ord.subtotal,
      ord.total,
      ord.notes,
      ord.rejection_reason,
      ord.created_at,
      ord.accepted_at,
      ord.preparing_at,
      ord.ready_at,
      ord.delivered_at,
      t.number as table_number,
      t.name   as table_name,
      accepter.full_name as accepted_by_name,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id',           oi.id,
              'product_name', oi.product_name,
              'quantity',     oi.quantity,
              'unit_price',   oi.unit_price,
              'subtotal',     oi.subtotal,
              'notes',        oi.notes
            )
            order by oi.created_at
          )
          from public.order_items oi
          where oi.order_id = ord.id
        ),
        '[]'::jsonb
      ) as items
    from public.orders ord
    join public.tables t on t.id = ord.table_id
    left join public.profiles accepter on accepter.id = ord.accepted_by
    where ord.restaurant_id = p_restaurant_id
      and (p_statuses is null or ord.status = any(p_statuses))
    order by ord.created_at desc
    limit p_limit
  ) o;

  return v_result;
end;
$$;

revoke execute on function public.get_staff_orders(uuid, public.order_status[], integer) from public, anon;
grant execute on function public.get_staff_orders(uuid, public.order_status[], integer) to authenticated;


-- Solicitudes de atención pendientes o en curso.
create or replace function public.get_waiter_calls(
  p_restaurant_id uuid,
  p_statuses public.waiter_call_status[] default null
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
        'id',            wc.id,
        'type',          wc.type,
        'status',        wc.status,
        'created_at',    wc.created_at,
        'handled_at',    wc.handled_at,
        'table_number',  t.number,
        'table_name',    t.name,
        'handled_by_name', h.full_name
      )
      order by wc.created_at
    ),
    '[]'::jsonb
  )
  into v_result
  from public.waiter_calls wc
  join public.tables t on t.id = wc.table_id
  left join public.profiles h on h.id = wc.handled_by
  where wc.restaurant_id = p_restaurant_id
    and (p_statuses is null or wc.status = any(p_statuses));

  return v_result;
end;
$$;

revoke execute on function public.get_waiter_calls(uuid, public.waiter_call_status[]) from public, anon;
grant execute on function public.get_waiter_calls(uuid, public.waiter_call_status[]) to authenticated;
