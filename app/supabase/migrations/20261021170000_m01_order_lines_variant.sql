-- ---------------------------------------------------------------------------
-- M01-T05a · Líneas de pedido con variante (EXPAND).
-- Depende de 20261020150000_m01_product_variants (tabla product_variants).
--
-- Cada línea de p_items puede traer "variant_id" (uuid, opcional):
--   [{"product_id": uuid, "quantity": int, "notes": text?, "variant_id": uuid?}]
--   · con variant_id: debe ser variante de ese producto (y por tanto del
--     restaurante); el precio cobrado es el de la variante.
--   · sin variant_id (o null): products.price, igual que hoy. La app actual
--     sigue funcionando sin cambios.
-- order_items gana variant_id (FK, on delete set null) y snapshots
-- variant_name / variant_price, todas nullable. No se toca ninguna columna
-- existente. unit_price sigue siendo el precio cobrado.
--
-- build_order_lines, create_customer_order y create_staff_order se reemplazan
-- con CREATE OR REPLACE y la MISMA firma; límites e idempotencia intactos.
-- NO cubre create_counter_sale ni add_items_to_bill (siguen sin variantes).
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants (id) on delete set null,
  add column if not exists variant_name text,
  add column if not exists variant_price numeric(10,2);

comment on column public.order_items.variant_id is 'Variante elegida (M01); null si el producto se pidió sin variante.';
comment on column public.order_items.variant_name is 'Snapshot: nombre de la variante al momento del pedido (null si no tenía nombre).';
comment on column public.order_items.variant_price is 'Snapshot: precio de la variante al momento del pedido.';

create index if not exists order_items_variant_id_idx on public.order_items (variant_id) where variant_id is not null;

create or replace function public.build_order_lines(p_restaurant_id uuid, p_items jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_item       jsonb;
  v_product    public.products%rowtype;
  v_product_id uuid;
  v_variant    public.product_variants%rowtype;
  v_variant_id uuid;
  v_unit_price numeric(10,2);
  v_quantity   integer;
  v_notes      text;
  v_lines      jsonb := '[]'::jsonb;
  v_subtotal   numeric(10,2) := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener productos';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Demasiados productos en un solo pedido (máximo 50 líneas)';
  end if;

  -- Primera pasada: forma de cada línea (barato, sin tocar tablas).
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Producto inválido en el pedido';
    end if;

    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity   := (v_item ->> 'quantity')::integer;
      v_variant_id := (v_item ->> 'variant_id')::uuid;  -- opcional
    exception when others then
      raise exception 'Producto inválido en el pedido';
    end;

    if v_product_id is null then
      raise exception 'Producto inválido en el pedido';
    end if;

    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'La cantidad debe estar entre 1 y 99';
    end if;

    if v_item ? 'variant_id'
       and jsonb_typeof(v_item -> 'variant_id') not in ('string', 'null') then
      raise exception 'Producto inválido en el pedido';
    end if;

    if v_item ? 'notes'
       and jsonb_typeof(v_item -> 'notes') not in ('string', 'null') then
      raise exception 'Producto inválido en el pedido';
    end if;

    if length(btrim(coalesce(v_item ->> 'notes', ''))) > 200 then
      raise exception 'La nota de un producto admite hasta 200 caracteres';
    end if;
  end loop;

  -- Segunda pasada: producto y precio del servidor.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity   := (v_item ->> 'quantity')::integer;
    v_notes      := nullif(btrim(coalesce(v_item ->> 'notes', '')), '');
    v_variant_id := (v_item ->> 'variant_id')::uuid;

    select * into v_product
    from public.products
    where id = v_product_id
      and restaurant_id = p_restaurant_id
      and active = true
      and available = true;

    if not found then
      raise exception 'Uno de los productos no está disponible';
    end if;

    v_variant    := null;
    v_unit_price := v_product.price;

    -- Con variant_id: la variante debe ser de ESTE producto (que ya es del
    -- restaurante) y se cobra su precio. Sin variant_id: products.price
    -- (caché de la más barata), igual que antes.
    if v_variant_id is not null then
      select * into v_variant
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product.id;

      if not found then
        raise exception 'La variante elegida no corresponde al producto';
      end if;
      v_unit_price := v_variant.price;
    end if;

    v_subtotal := v_subtotal + v_unit_price * v_quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',   v_product.id,
      'product_name', v_product.name,
      'quantity',     v_quantity,
      'unit_price',   v_unit_price,
      'subtotal',     v_unit_price * v_quantity,
      'notes',        v_notes,
      'variant_id',   v_variant.id,
      'variant_name', nullif(v_variant.name, ''),
      'variant_price', v_variant.price
    ));
  end loop;

  return jsonb_build_object('subtotal', v_subtotal, 'lines', v_lines);
end;
$$;

comment on function public.build_order_lines(uuid, jsonb) is
  'Valida (1-50 líneas, cantidad 1-99, nota <= 200, variant_id opcional del producto) y valoriza con precios del servidor las líneas de un pedido. Interna.';

create or replace function public.create_customer_order(
  p_session_token uuid,
  p_items jsonb,
  p_notes text default null,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.table_sessions%rowtype;
  v_existing public.orders%rowtype;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_notes    text;
  v_order_id uuid;
begin
  if p_session_token is null then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  select * into v_session
  from public.table_sessions
  where session_token = p_session_token;

  if not found then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  -- Candados en orden mesa -> sesión.
  perform 1 from public.tables where id = v_session.table_id for update;

  select * into v_session
  from public.table_sessions
  where id = v_session.id
  for update;

  if p_client_request_id is not null then
    select * into v_existing
    from public.orders
    where restaurant_id = v_session.restaurant_id
      and client_request_id = p_client_request_id;

    if found then
      if v_existing.table_session_id is distinct from v_session.id then
        raise exception 'No se pudo enviar el pedido. Vuelve a intentarlo.';
      end if;
      return v_existing.id;
    end if;
  end if;

  if v_session.status <> 'ACTIVE' then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  if length(btrim(coalesce(p_notes, ''))) > 200 then
    raise exception 'La nota del pedido admite hasta 200 caracteres';
  end if;
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  v_built := public.build_order_lines(v_session.restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;

  insert into public.orders (
    restaurant_id,
    table_id,
    table_session_id,
    status,
    subtotal,
    total,
    notes,
    client_request_id
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    'PENDING',
    v_subtotal,
    v_subtotal,
    v_notes,
    p_client_request_id
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, subtotal, notes,
    variant_id, variant_name, variant_price
  )
  select v_order_id,
         (l ->> 'product_id')::uuid,
         l ->> 'product_name',
         (l ->> 'quantity')::integer,
         (l ->> 'unit_price')::numeric,
         (l ->> 'subtotal')::numeric,
         l ->> 'notes',
         (l ->> 'variant_id')::uuid,
         l ->> 'variant_name',
         (l ->> 'variant_price')::numeric
  from jsonb_array_elements(v_built -> 'lines') with ordinality as t(l, n)
  order by n;

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_order_id;
end;
$$;

create or replace function public.create_staff_order(
  p_table_id uuid,
  p_items jsonb,
  p_notes text default null,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_table    public.tables%rowtype;
  v_session  public.table_sessions%rowtype;
  v_existing public.orders%rowtype;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_notes    text;
  v_order_id uuid;
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
    and kind = 'TABLE'  -- C2: el mostrador vende con create_counter_sale.
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

  if p_client_request_id is not null then
    select * into v_existing
    from public.orders
    where restaurant_id = v_table.restaurant_id
      and client_request_id = p_client_request_id;

    if found then
      if v_existing.table_id is distinct from v_table.id then
        raise exception 'La clave de idempotencia ya se usó en otra mesa';
      end if;
      return v_existing.id;
    end if;
  end if;

  if length(btrim(coalesce(p_notes, ''))) > 200 then
    raise exception 'La nota del pedido admite hasta 200 caracteres';
  end if;
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  -- Los precios se calculan acá, nunca se toman de lo que mande el navegador.
  v_built := public.build_order_lines(v_table.restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;

  v_session := public.find_or_create_active_table_session(
    v_table.id,
    v_table.restaurant_id
  );

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
    preparing_at,
    client_request_id
  )
  values (
    v_table.restaurant_id,
    v_table.id,
    v_session.id,
    'PREPARING',
    v_subtotal,
    v_subtotal,
    v_notes,
    auth.uid(),
    now(),
    now(),
    p_client_request_id
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, subtotal, notes,
    variant_id, variant_name, variant_price
  )
  select v_order_id,
         (l ->> 'product_id')::uuid,
         l ->> 'product_name',
         (l ->> 'quantity')::integer,
         (l ->> 'unit_price')::numeric,
         (l ->> 'subtotal')::numeric,
         l ->> 'notes',
         (l ->> 'variant_id')::uuid,
         l ->> 'variant_name',
         (l ->> 'variant_price')::numeric
  from jsonb_array_elements(v_built -> 'lines') with ordinality as t(l, n)
  order by n;

  -- Mismas dos entradas que deja accept_and_prepare_order: el pedido pasó por
  -- los dos momentos a la vez, y quién lo hizo tiene que quedar registrado.
  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values
    (v_table.restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order_id),
    (v_table.restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order_id);

  -- Si la mesa había llamado al mesero, esa llamada acaba de ser atendida por
  -- definición: él está ahí, tomándole el pedido.
  update public.waiter_calls
  set status = 'ATTENDED',
      handled_by = auth.uid(),
      handled_at = now()
  where table_id = v_table.id
    and type = 'WAITER'
    and status in ('PENDING', 'ACCEPTED');

  return v_order_id;
end;
$$;
