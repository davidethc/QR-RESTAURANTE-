-- ---------------------------------------------------------------------------
-- M02-T02 / M02-T03 · Disponibilidad efectiva y cambio por rol (EXPAND).
-- Spec: docs/pos-spec/M02-disponibilidad.md §5 y §6. Requiere
-- 20261021150000_m02_availability. Solo agrega funciones; no toca tablas.
--
-- T02 product_effective_available(product_id): true si al menos una variante
--   está disponible. Variante sin fila en availability = disponible. Producto
--   inexistente = null; producto sin variantes = false. SECURITY DEFINER para
--   que la carta pública/QR (anon) pueda consultarlo sin leer availability.
--   Solo devuelve un booleano.
--
-- T03 set_item_availability(item_type, item_id, available): SECURITY DEFINER,
--   search_path ''. Roles permitidos, miembro ACTIVE del MISMO restaurante del
--   ítem: OWNER, ADMIN, WAITER, KITCHEN y CASHIER. El rol se compara como texto
--   porque member_role hoy no tiene CASHIER y restaurant_members no tiene
--   columna roles; cuando exista el valor, la función ya lo admite.
--   El restaurante sale del ítem (no lo manda el cliente). Ítem inexistente,
--   ajeno o sin rol dan el mismo 42501. Upsert + audit_logs (UPDATE,
--   entity_type 'availability'). Revoke a public/anon.
--
-- Rollback:
--   drop function public.set_item_availability(text, uuid, boolean);
--   drop function public.product_effective_available(uuid);
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';

create or replace function public.product_effective_available(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.products p where p.id = p_product_id)
      then null
    else exists (
      select 1
      from public.product_variants v
      left join public.availability a
        on a.item_type = 'variant' and a.item_id = v.id
      where v.product_id = p_product_id
        and coalesce(a.available, true)
    )
  end;
$$;

revoke all on function public.product_effective_available(uuid) from public;
grant execute on function public.product_effective_available(uuid)
  to anon, authenticated, service_role;

create or replace function public.set_item_availability(
  p_item_type text,
  p_item_id uuid,
  p_available boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id uuid;
  v_product_id uuid;
  v_group_id uuid;
  v_previous boolean;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para cambiar la disponibilidad'
      using errcode = '42501';
  end if;

  if p_item_type is null or p_item_type not in ('variant', 'modifier_option')
     or p_item_id is null or p_available is null then
    raise exception 'Datos de disponibilidad inválidos' using errcode = '22023';
  end if;

  -- El restaurante sale del ítem, nunca del cliente.
  if p_item_type = 'variant' then
    select p.restaurant_id, p.id into v_restaurant_id, v_product_id
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = p_item_id;
  else
    select g.restaurant_id, g.id into v_restaurant_id, v_group_id
    from public.modifier_options o
    join public.modifier_groups g on g.id = o.group_id
    where o.id = p_item_id;
  end if;

  if v_restaurant_id is null
     or not exists (
       select 1 from public.restaurant_members rm
       where rm.restaurant_id = v_restaurant_id
         and rm.user_id = v_uid
         and rm.status = 'ACTIVE'
         and rm.role::text in ('OWNER', 'ADMIN', 'WAITER', 'KITCHEN', 'CASHIER')
     ) then
    raise exception 'El ítem no existe o no puedes cambiar su disponibilidad'
      using errcode = '42501';
  end if;

  select a.available into v_previous
  from public.availability a
  where a.restaurant_id = v_restaurant_id
    and a.item_type = p_item_type
    and a.item_id = p_item_id
  for update;

  insert into public.availability
    (restaurant_id, item_type, item_id, product_id, group_id, available)
  values
    (v_restaurant_id, p_item_type, p_item_id, v_product_id, v_group_id, p_available)
  on conflict (restaurant_id, item_type, item_id)
  do update set available = excluded.available;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_restaurant_id, v_uid, 'UPDATE'::public.audit_action,
    'availability', p_item_id,
    jsonb_build_object(
      'item_type', p_item_type,
      'available', p_available,
      'previous', coalesce(v_previous, true)
    )
  );
end;
$$;

revoke all on function public.set_item_availability(text, uuid, boolean) from public;
revoke execute on function public.set_item_availability(text, uuid, boolean) from anon;
grant execute on function public.set_item_availability(text, uuid, boolean)
  to authenticated, service_role;
