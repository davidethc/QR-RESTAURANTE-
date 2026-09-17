-- ---------------------------------------------------------------------------
-- 1) Helper de sesión de mesa.
--
-- Duplica a propósito la lógica de resolución de sesión de resolve_table_qr
-- (mismo criterio: 4 h de inactividad = sesión expirada). Se aísla en vez de
-- reutilizar resolve_table_qr porque esa función ya está probada en producción
-- sirviendo el flujo del QR físico, y este plan no puede permitirse tocarla.
-- Refactor natural a futuro: que resolve_table_qr también llame a este helper.
--
-- No lleva grant a nadie: solo se invoca desde funciones SECURITY DEFINER,
-- donde current_user es el owner (postgres) y por tanto tiene permiso.
-- ---------------------------------------------------------------------------
create or replace function public.find_or_create_active_table_session(
  p_table_id uuid,
  p_restaurant_id uuid
)
returns public.table_sessions
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session public.table_sessions%rowtype;
begin
  select *
  into v_session
  from public.table_sessions
  where table_id = p_table_id
    and status = 'ACTIVE'
  order by started_at desc
  limit 1;

  if found and v_session.last_activity_at < now() - interval '4 hours' then
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
$function$;

revoke all on function public.find_or_create_active_table_session(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 2) El mesero toma el pedido en la mesa.
--
-- Diferencia clave con create_customer_order: el pedido nace ACCEPTED, no
-- PENDING. El mesero está parado en la mesa escribiéndolo; al escribirlo ya lo
-- confirmó. Pasarlo por PENDING obligaría a que él mismo fuera después a
-- /orders a aceptar su propio pedido — un paso vacío. Como /kitchen muestra
-- ACCEPTED/PREPARING/READY, el pedido aparece en cocina de inmediato.
--
-- accepted_by da la trazabilidad de quién lo tomó, sin columnas nuevas.
-- ---------------------------------------------------------------------------
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
    accepted_at
  )
  values (
    v_table.restaurant_id,
    v_table.id,
    v_session.id,
    'ACCEPTED',
    v_subtotal,
    v_subtotal,
    p_notes,
    auth.uid(),
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
grant execute on function public.create_staff_order(uuid, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) La regla de la cuenta.
--
-- Cambio aditivo sobre create_waiter_call: no altera ningún caso válido, solo
-- rechaza uno que antes pasaba y no debía. Pedir la cuenta sin haber pedido
-- nada le hacía perder un viaje al mesero (call-card.tsx incluso tenía un caso
-- para renderizar "No hay pedidos registrados en esta mesa").
--
-- Cuenta cualquier pedido que no haya sido rechazado ni cancelado, sin exigir
-- que ya esté entregado: la mesa que todavía espera su último plato tiene todo
-- el derecho a ir pidiendo la cuenta.
-- ---------------------------------------------------------------------------
create or replace function public.create_waiter_call(
  p_session_token uuid,
  p_type waiter_call_type
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session public.table_sessions%rowtype;
  v_existing_call uuid;
  v_call_id uuid;
begin
  select *
  into v_session
  from public.table_sessions
  where session_token = p_session_token
    and status = 'ACTIVE';

  if not found then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  if p_type = 'BILL' then
    if not exists (
      select 1
      from public.orders o
      where o.table_session_id = v_session.id
        and o.status not in ('REJECTED', 'CANCELLED')
    ) then
      raise exception 'Primero hay que hacer un pedido para poder pedir la cuenta';
    end if;
  end if;

  select id
  into v_existing_call
  from public.waiter_calls
  where table_id = v_session.table_id
    and restaurant_id = v_session.restaurant_id
    and type = p_type
    and status = 'PENDING';

  if found then
    raise exception 'Ya existe una solicitud pendiente de este tipo';
  end if;

  insert into public.waiter_calls (
    restaurant_id,
    table_id,
    table_session_id,
    type,
    status
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    p_type,
    'PENDING'
  )
  returning id
  into v_call_id;

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_call_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4) El mesero pide la cuenta por el cliente.
--
-- Solo cubre BILL a propósito: que el mesero "llame al mesero" no significa
-- nada. Aplica exactamente la misma regla de pedidos que create_waiter_call,
-- para que la validación no dependa de por dónde entró la solicitud.
-- ---------------------------------------------------------------------------
create or replace function public.request_bill_as_staff(p_table_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_table public.tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_call_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

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
    raise exception 'No autorizado';
  end if;

  select *
  into v_session
  from public.table_sessions
  where table_id = v_table.id
    and status = 'ACTIVE'
  order by started_at desc
  limit 1;

  -- A diferencia de create_staff_order, acá NO se crea una sesión si no hay:
  -- sin sesión no hay pedidos, y sin pedidos no hay cuenta que pedir.
  if not found then
    raise exception 'Primero hay que hacer un pedido para poder pedir la cuenta';
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.table_session_id = v_session.id
      and o.status not in ('REJECTED', 'CANCELLED')
  ) then
    raise exception 'Primero hay que hacer un pedido para poder pedir la cuenta';
  end if;

  select id
  into v_call_id
  from public.waiter_calls
  where table_id = v_table.id
    and restaurant_id = v_table.restaurant_id
    and type = 'BILL'
    and status = 'PENDING';

  if found then
    raise exception 'Ya existe una solicitud pendiente de este tipo';
  end if;

  insert into public.waiter_calls (
    restaurant_id,
    table_id,
    table_session_id,
    type,
    status
  )
  values (
    v_table.restaurant_id,
    v_table.id,
    v_session.id,
    'BILL',
    'PENDING'
  )
  returning id
  into v_call_id;

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_call_id;
end;
$function$;

revoke all on function public.request_bill_as_staff(uuid) from public;
grant execute on function public.request_bill_as_staff(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) get_waiter_calls: se agrega table_id.
--
-- Cambio aditivo, un campo más en el objeto. Lo necesita el botón "Tomar
-- pedido" de la tarjeta de solicitud: con table_number no se puede construir
-- la ruta /tables/[id]/order sin una consulta extra.
-- ---------------------------------------------------------------------------
create or replace function public.get_waiter_calls(
  p_restaurant_id uuid,
  p_statuses waiter_call_status[] default null::waiter_call_status[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
        'table_id',      wc.table_id,
        'table_number',  t.number,
        'table_name',    t.name,
        'handled_by_name', h.full_name,
        'session_total', coalesce((
          select sum(o.total)
          from public.orders o
          where o.table_session_id = wc.table_session_id
            and o.status not in ('REJECTED', 'CANCELLED')
        ), 0),
        'session_orders', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'order_number', o.order_number,
              'created_at',   o.created_at,
              'subtotal',     o.total,
              'items', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'product_name', oi.product_name,
                    'quantity',     oi.quantity,
                    'subtotal',     oi.subtotal
                  )
                  order by oi.created_at
                )
                from public.order_items oi
                where oi.order_id = o.id
              ), '[]'::jsonb)
            )
            order by o.created_at
          )
          from public.orders o
          where o.table_session_id = wc.table_session_id
            and o.status not in ('REJECTED', 'CANCELLED')
        ), '[]'::jsonb)
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
$function$;

-- ---------------------------------------------------------------------------
-- 6) Los más pedidos, para el acceso rápido del mesero.
--
-- Con 50 productos en la carta, buscar "Capuchino" cuesta teclear; tenerlo en
-- la primera fila lo convierte en un toque. Solo devuelve productos que sigan
-- activos y disponibles, así que un plato retirado de la carta no reaparece.
-- ---------------------------------------------------------------------------
create or replace function public.get_top_products(
  p_restaurant_id uuid,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  with top as (
    select
      p.id,
      p.name,
      p.price,
      sum(oi.quantity) as unidades
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.products p on p.id = oi.product_id
    where o.restaurant_id = p_restaurant_id
      and o.created_at > now() - interval '30 days'
      and o.status not in ('REJECTED', 'CANCELLED')
      and p.active = true
      and p.available = true
    group by p.id, p.name, p.price
    order by unidades desc
    limit greatest(p_limit, 1)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', id, 'name', name, 'price', price)
      order by unidades desc
    ),
    '[]'::jsonb
  )
  into v_result
  from top;

  return v_result;
end;
$function$;

revoke all on function public.get_top_products(uuid, integer) from public;
grant execute on function public.get_top_products(uuid, integer) to authenticated, service_role;
