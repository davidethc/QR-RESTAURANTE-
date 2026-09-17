
-- RPC: Resolver QR → sesión de mesa
create or replace function public.resolve_table_qr(
  p_qr_token uuid
)
returns table (
  restaurant_id uuid,
  restaurant_name text,
  restaurant_slug text,
  table_id uuid,
  table_number integer,
  session_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
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

  return query
  select
    v_restaurant.id,
    v_restaurant.name,
    v_restaurant.slug,
    v_table.id,
    v_table.number,
    v_session.session_token;
end;
$$;

-- RPC: Crear pedido del cliente (server-side validation + price calculation)
create or replace function public.create_customer_order(
  p_session_token uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.table_sessions%rowtype;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_notes text;
  v_item_subtotal numeric(10,2);
begin
  select *
  into v_session
  from public.table_sessions
  where session_token = p_session_token
    and status = 'ACTIVE';

  if not found then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener productos';
  end if;

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
      and restaurant_id = v_session.restaurant_id
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
    notes
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    'PENDING',
    v_subtotal,
    v_subtotal,
    p_notes
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
      and restaurant_id = v_session.restaurant_id
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

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_order_id;
end;
$$;

-- RPC: Consultar pedido del cliente (sin autenticación, via session_token)
create or replace function public.get_customer_order(
  p_session_token uuid,
  p_order_id uuid
)
returns table (
  order_id uuid,
  order_number bigint,
  status public.order_status,
  subtotal numeric,
  total numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.status,
    o.subtotal,
    o.total,
    o.created_at
  from public.orders o
  join public.table_sessions ts
    on ts.id = o.table_session_id
  where ts.session_token = p_session_token
    and o.id = p_order_id;
$$;

-- RPC: Llamar mesero (cliente anónimo via session_token)
create or replace function public.create_waiter_call(
  p_session_token uuid,
  p_type public.waiter_call_type
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;
