-- Corrección sobre la versión anterior de create_staff_order.
--
-- Insertaba con status ACCEPTED, lo que en este sistema es un estado que en
-- la práctica no existe: accept_and_prepare_order (lo que corre cuando un
-- mesero acepta un pedido del cliente) salta directo a PREPARING, porque
-- aceptar y empezar a cocinar son el mismo momento real. La columna "Nuevos"
-- de /kitchen, que muestra ACCEPTED, nunca recibe nada en el flujo normal.
--
-- Dejar los pedidos del mesero en ACCEPTED los habría mandado justo a esa
-- columna que la cocina ya aprendió a ignorar por estar siempre vacía.
--
-- Un pedido que el mesero escribe en la mesa es exactamente equivalente a uno
-- que el cliente manda y el mesero acepta acto seguido. Así que termina igual:
-- PREPARING, con accepted_at/preparing_at y las mismas dos entradas de
-- auditoría. Sin esto la auditoría tenía un hueco: no quedaba registro de
-- quién había aceptado estos pedidos.
create or replace function public.create_staff_order(
  p_table_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_table public.tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_notes text;
  v_item_subtotal numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- for update: el mismo candado que usa resolve_table_qr. Sin él, dos meseros
  -- enviando a la vez en la misma mesa podrían crear dos sesiones.
  select *
  into v_table
  from public.tables
  where id = p_table_id
    and status <> 'INACTIVE'
  for update;

  if not found then
    raise exception 'Mesa no encontrada o inactiva';
  end if;

  if not (
    public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para tomar pedidos';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener productos';
  end if;

  v_session := public.find_or_create_active_table_session(
    v_table.id,
    v_table.restaurant_id
  );

  -- Los precios se calculan acá, nunca se toman de lo que mande el navegador.
  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::integer;

    if v_quantity <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and restaurant_id = v_table.restaurant_id
      and active = true
      and available = true;

    if not found then
      raise exception 'Uno de los productos no está disponible';
    end if;

    v_item_subtotal := v_product.price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;
  end loop;

  insert into public.orders (
    restaurant_id,
    table_id,
    table_session_id,
    status,
    subtotal,
    total,
    notes,
    accepted_by,
    accepted_at,
    preparing_at
  )
  values (
    v_table.restaurant_id,
    v_table.id,
    v_session.id,
    'PREPARING',
    v_subtotal,
    v_subtotal,
    p_notes,
    auth.uid(),
    now(),
    now()
  )
  returning id
  into v_order_id;

  for v_item in
    select * from jsonb_array_elements(p_items)
  loop
    select *
    into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and restaurant_id = v_table.restaurant_id
      and active = true
      and available = true;

    v_quantity := (v_item ->> 'quantity')::integer;
    v_notes := v_item ->> 'notes';

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      notes
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_quantity,
      v_product.price,
      v_product.price * v_quantity,
      v_notes
    );
  end loop;

  -- Mismas dos entradas que deja accept_and_prepare_order: el pedido pasó por
  -- los dos momentos a la vez, y quién lo hizo tiene que quedar registrado.
  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values
    (v_table.restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order_id),
    (v_table.restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order_id);

  -- Si la mesa había llamado al mesero, esa llamada acaba de ser atendida por
  -- definición: él está ahí, tomándole el pedido. Cerrarla sola evita que la
  -- pestaña Solicitudes acumule avisos ya resueltos.
  update public.waiter_calls
  set status = 'ATTENDED',
      handled_by = auth.uid(),
      handled_at = now()
  where table_id = v_table.id
    and type = 'WAITER'
    and status in ('PENDING', 'ACCEPTED');

  return v_order_id;
end;
$function$;

revoke all on function public.create_staff_order(uuid, jsonb, text) from public;
revoke execute on function public.create_staff_order(uuid, jsonb, text) from anon;
grant execute on function public.create_staff_order(uuid, jsonb, text) to authenticated, service_role;
