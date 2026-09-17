
-- Carta completa para el panel: incluye inactivos y agotados,
-- que es justo lo que el admin necesita gestionar.
create or replace function public.get_admin_menu(
  p_restaurant_id uuid
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

  select jsonb_build_object(
    'categories', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',          c.id,
            'name',        c.name,
            'description', c.description,
            'position',    c.position,
            'active',      c.active,
            'product_count', (
              select count(*) from public.products p where p.category_id = c.id
            )
          )
          order by c.position, c.name
        )
        from public.categories c
        where c.restaurant_id = p_restaurant_id
      ),
      '[]'::jsonb
    ),
    'products', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',            p.id,
            'category_id',   p.category_id,
            'category_name', c.name,
            'name',          p.name,
            'description',   p.description,
            'price',         p.price,
            'image_url',     p.image_url,
            'active',        p.active,
            'available',     p.available,
            'position',      p.position
          )
          order by p.position, p.name
        )
        from public.products p
        left join public.categories c on c.id = p.category_id
        where p.restaurant_id = p_restaurant_id
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_admin_menu(uuid) from public, anon;
grant execute on function public.get_admin_menu(uuid) to authenticated;


-- Empleados del restaurante.
create or replace function public.get_staff_members(
  p_restaurant_id uuid
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

  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',         rm.id,
        'user_id',    rm.user_id,
        'full_name',  p.full_name,
        'avatar_url', p.avatar_url,
        'role',       rm.role,
        'status',     rm.status,
        'created_at', rm.created_at
      )
      order by rm.role, p.full_name
    ),
    '[]'::jsonb
  )
  into v_result
  from public.restaurant_members rm
  join public.profiles p on p.id = rm.user_id
  where rm.restaurant_id = p_restaurant_id;

  return v_result;
end;
$$;

revoke execute on function public.get_staff_members(uuid) from public, anon;
grant execute on function public.get_staff_members(uuid) to authenticated;


-- Cerrar la sesión de una mesa: el cliente se fue, la mesa queda limpia.
create or replace function public.close_table_session(
  p_table_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  if not public.user_belongs_to_restaurant(v_restaurant_id) then
    raise exception 'No autorizado';
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
$$;

revoke execute on function public.close_table_session(uuid) from public, anon;
grant execute on function public.close_table_session(uuid) to authenticated;
