-- ---------------------------------------------------------------------------
-- M04 · Personalizaciones con precio, editar línea enviada y reabrir mesa (EXPAND).
-- Depende de 20261022030000_integracion_s1 y de M01 (modifier_groups/options).
--
-- a) Personalizaciones con precio. Cada línea de p_items admite un arreglo
--    opcional "modifiers": [{"option_id": uuid, "qty": int?}] (qty por unidad
--    del producto, default 1). build_order_lines valida contra la base:
--      · la opción pertenece a un grupo vinculado al producto
--        (product_modifier_groups) y al restaurante; el cliente NUNCA manda precios.
--      · por grupo: suma de qty entre min_select y max_select; qty > 1 solo si
--        allow_repeat; opción no agotada (availability 'modifier_option').
--      · unit_price = precio_variante + Σ(precio_opción × qty)  (M01 §5).
--    Sin "modifiers" (ausente o null) => comportamiento anterior, SIN validar
--    min_select (compatibilidad con la carta QR y la app actuales). Con
--    "modifiers" presente (aunque sea []) sí se exige min_select de cada grupo
--    vinculado al producto.
--    Persistencia: se REUTILIZA order_item_options (ya existe, con RLS y sin
--    escritura directa) añadiendo modifier_option_id (FK, set null) y qty
--    (default 1); nombre del grupo -> option_name, nombre de la opción ->
--    value_name, price_modifier = precio unitario de la opción (snapshot).
--    Helper interno insert_order_lines() inserta ítems + opciones; lo usan
--    create_customer_order, create_staff_order y add_ticket (mismas firmas).
-- b) edit_order_item(item, variante, nota): cambia variante y/o nota de una
--    línea ya enviada sin tocar cantidad; conserva las personalizaciones.
--    p_variant_id null = no cambia; p_notes null = no cambia, '' = borra.
-- c) reopen_table(session): hoy "cuenta pedida" = waiter_calls type BILL en
--    PENDING/ACCEPTED sobre una sesión ACTIVE (tables.status BILL_REQUESTED);
--    close_table_session cierra la sesión y exige cobro, así que una mesa
--    CLOSED ya no se reabre. Regla: reabrir cancela las llamadas BILL vivas de
--    la mesa (status CANCELLED), exige sesión ACTIVE y cuenta no PAID/CLOSED, y
--    refresca el estado de la mesa. No bloquea add_ticket mientras hay cuenta
--    pedida (decisión de producto pendiente, fuera de esta migración).
-- Rollback: reaplicar 20261022030000 / 20261021170000; DROP FUNCTION
-- edit_order_item/reopen_table/insert_order_lines; las columnas nuevas son inofensivas.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';

alter table public.order_item_options
  add column if not exists modifier_option_id uuid references public.modifier_options (id) on delete set null,
  add column if not exists qty integer not null default 1;

alter table public.order_item_options
  drop constraint if exists order_item_options_qty_check;
alter table public.order_item_options
  add constraint order_item_options_qty_check check (qty >= 1);

comment on column public.order_item_options.modifier_option_id is 'Opción de personalización elegida (M01-T03); null en datos legados.';
comment on column public.order_item_options.qty is 'Veces elegida por unidad del producto (allow_repeat). price_modifier es el precio unitario.';

create index if not exists order_item_options_modifier_option_idx
  on public.order_item_options (modifier_option_id) where modifier_option_id is not null;

-- ======================= build_order_lines =================================
create or replace function public.build_order_lines(p_restaurant_id uuid, p_items jsonb)
returns jsonb
language plpgsql
stable
set search_path to ''
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
  v_mod        jsonb;
  v_opt_id     uuid;
  v_qty        integer;
  v_opt        record;
  v_mods       jsonb;
  v_mods_total numeric(10,2);
  v_seen       uuid[];
  v_grp        record;
  v_sum        integer;
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

    if v_item ? 'modifiers' then
      if jsonb_typeof(v_item -> 'modifiers') not in ('array', 'null') then
        raise exception 'Personalizaciones inválidas';
      end if;
      if jsonb_typeof(v_item -> 'modifiers') = 'array'
         and jsonb_array_length(v_item -> 'modifiers') > 30 then
        raise exception 'Demasiadas personalizaciones en un producto (máximo 30)';
      end if;
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

    -- Con variant_id: la variante debe ser de ESTE producto (que ya es del
    -- restaurante) y se cobra su precio. Sin variant_id: si el producto tiene
    -- exactamente 1 variante se usa esa; con 0 o más de 1 hay que elegir.
    if v_variant_id is not null then
      select * into v_variant
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product.id;

      if not found then
        raise exception 'La variante elegida no corresponde al producto';
      end if;
    else
      if (select count(*) from public.product_variants where product_id = v_product.id) <> 1 then
        raise exception 'Elige una variante';
      end if;
      select * into v_variant
      from public.product_variants
      where product_id = v_product.id;
    end if;

    if exists (
      select 1 from public.availability a
      where a.item_type = 'variant'
        and a.item_id = v_variant.id
        and a.available = false
    ) then
      raise exception 'Uno de los productos no está disponible';
    end if;

    v_unit_price := v_variant.price;

    -- Personalizaciones (opcional). Precio y reglas salen de la base.
    v_mods       := '[]'::jsonb;
    v_mods_total := 0;
    v_seen       := '{}';

    if jsonb_typeof(v_item -> 'modifiers') = 'array' then
      for v_mod in select * from jsonb_array_elements(v_item -> 'modifiers') loop
        if jsonb_typeof(v_mod) <> 'object' then
          raise exception 'Personalizaciones inválidas';
        end if;
        begin
          v_opt_id := (v_mod ->> 'option_id')::uuid;
          v_qty    := coalesce((v_mod ->> 'qty')::integer, 1);
        exception when others then
          raise exception 'Personalizaciones inválidas';
        end;
        if v_opt_id is null or v_qty is null or v_qty < 1 or v_qty > 99 then
          raise exception 'Personalizaciones inválidas';
        end if;
        if v_opt_id = any (v_seen) then
          raise exception 'Personalización repetida: usa la cantidad de la opción';
        end if;
        v_seen := v_seen || v_opt_id;

        select o.id, o.name as option_name, o.price, g.id as group_id, g.name as group_name,
               g.allow_repeat
        into v_opt
        from public.modifier_options o
        join public.modifier_groups g on g.id = o.group_id
        join public.product_modifier_groups pmg
          on pmg.group_id = g.id and pmg.product_id = v_product.id
        where o.id = v_opt_id
          and g.restaurant_id = p_restaurant_id;

        if not found then
          raise exception 'Una personalización no corresponde al producto';
        end if;

        if exists (
          select 1 from public.availability a
          where a.item_type = 'modifier_option'
            and a.item_id = v_opt.id
            and a.available = false
        ) then
          raise exception 'Una personalización no está disponible';
        end if;

        if v_qty > 1 and not v_opt.allow_repeat then
          raise exception 'La personalización "%" no se puede repetir', v_opt.option_name;
        end if;

        if v_opt.price < 0 then
          raise exception 'Personalización inválida';
        end if;

        v_mods_total := v_mods_total + v_opt.price * v_qty;
        v_mods := v_mods || jsonb_build_array(jsonb_build_object(
          'option_id',  v_opt.id,
          'group_id',   v_opt.group_id,
          'group_name', v_opt.group_name,
          'name',       v_opt.option_name,
          'price',      v_opt.price,
          'qty',        v_qty
        ));
      end loop;

      -- min/max por cada grupo vinculado al producto (también los no elegidos).
      for v_grp in
        select g.id, g.name, g.min_select, g.max_select
        from public.product_modifier_groups pmg
        join public.modifier_groups g on g.id = pmg.group_id
        where pmg.product_id = v_product.id
          and g.restaurant_id = p_restaurant_id
      loop
        select coalesce(sum((m ->> 'qty')::integer), 0) into v_sum
        from jsonb_array_elements(v_mods) m
        where (m ->> 'group_id')::uuid = v_grp.id;

        if v_sum < v_grp.min_select then
          raise exception 'Elige al menos % en "%"', v_grp.min_select, v_grp.name;
        end if;
        if v_sum > v_grp.max_select then
          raise exception 'Elige como máximo % en "%"', v_grp.max_select, v_grp.name;
        end if;
      end loop;
    end if;

    v_unit_price := v_unit_price + v_mods_total;

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
      'variant_price', v_variant.price,
      'modifiers',    v_mods
    ));
  end loop;

  return jsonb_build_object('subtotal', v_subtotal, 'lines', v_lines);
end;
$$;

comment on function public.build_order_lines(uuid, jsonb) is
  'Valida (1-50 líneas, cantidad 1-99, nota <= 200, variant_id y modifiers opcionales) y valoriza con precios del servidor: unit_price = variante + Σ(opción × qty). Interna.';

-- ======================= insert_order_lines (interna) ======================
create or replace function public.insert_order_lines(p_order_id uuid, p_ticket_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_l  jsonb;
  v_id uuid;
begin
  for v_l in select t.l from jsonb_array_elements(p_lines) with ordinality as t(l, n) order by t.n loop
    insert into public.order_items (
      order_id, ticket_id, product_id, product_name, quantity, unit_price, subtotal, notes,
      variant_id, variant_name, variant_price
    )
    values (
      p_order_id, p_ticket_id, (v_l ->> 'product_id')::uuid, v_l ->> 'product_name',
      (v_l ->> 'quantity')::integer, (v_l ->> 'unit_price')::numeric, (v_l ->> 'subtotal')::numeric,
      v_l ->> 'notes', (v_l ->> 'variant_id')::uuid, v_l ->> 'variant_name',
      (v_l ->> 'variant_price')::numeric
    )
    returning id into v_id;

    insert into public.order_item_options (
      order_item_id, option_name, value_name, price_modifier, modifier_option_id, qty
    )
    select v_id, m ->> 'group_name', m ->> 'name', (m ->> 'price')::numeric,
           (m ->> 'option_id')::uuid, (m ->> 'qty')::integer
    from jsonb_array_elements(coalesce(v_l -> 'modifiers', '[]'::jsonb)) m;
  end loop;
end;
$$;

revoke all on function public.insert_order_lines(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_order_lines(uuid, uuid, jsonb) to service_role;

-- ======================= create_customer_order =======================
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

  perform public.insert_order_lines(v_order_id, null, v_built -> 'lines');

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_order_id;
end;
$$;

-- ======================= create_staff_order =======================
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

  perform public.insert_order_lines(v_order_id, null, v_built -> 'lines');

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

-- ======================= add_ticket =======================
create or replace function public.add_ticket(
  p_order_id uuid,
  p_items jsonb,
  p_request_id uuid default null,
  p_table_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table_id uuid;
  v_table    public.tables%rowtype;
  v_order    public.orders%rowtype;
  v_session  public.table_sessions%rowtype;
  v_ticket   public.tickets%rowtype;
  v_exist_o  public.orders%rowtype;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_number   integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_order_id is not null then
    select table_id into v_table_id from public.orders where id = p_order_id;
  else
    v_table_id := p_table_id;
  end if;
  if v_table_id is null then
    raise exception 'Pedido o mesa no encontrados';
  end if;

  -- Orden de candados: mesa -> pedido.
  select * into v_table from public.tables where id = v_table_id for update;
  if not found or v_table.kind <> 'TABLE' or v_table.status = 'INACTIVE' then
    raise exception 'Mesa no encontrada o inactiva';
  end if;

  if not (
    public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para tomar pedidos';
  end if;

  if p_order_id is not null then
    select * into v_order from public.orders where id = p_order_id for update;
    if not found or v_order.table_id is distinct from v_table.id then
      raise exception 'Pedido no encontrado';
    end if;
  end if;

  -- Idempotencia: mismo request_id => misma comanda (si es de este contexto).
  if p_request_id is not null then
    select * into v_ticket from public.tickets where client_request_id = p_request_id;
    if found then
      select * into v_exist_o from public.orders where id = v_ticket.order_id;
      if v_exist_o.restaurant_id <> v_table.restaurant_id
         or v_exist_o.table_id is distinct from v_table.id
         or (p_order_id is not null and v_exist_o.id <> p_order_id) then
        raise exception 'La clave de idempotencia ya se usó en otro pedido';
      end if;
      return jsonb_build_object('order_id', v_exist_o.id, 'ticket_id', v_ticket.id,
        'ticket_number', v_ticket.number, 'folio', v_exist_o.folio,
        'short_code', v_exist_o.short_code, 'replayed', true);
    end if;
  end if;

  -- Precios y límites del servidor (1-50 líneas, cantidad 1-99, notas <= 200).
  v_built := public.build_order_lines(v_table.restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;

  if p_order_id is null then
    -- Primer "Guardar" de la mesa: nace el pedido (folio y código por trigger).
    v_session := public.find_or_create_active_table_session(v_table.id, v_table.restaurant_id);
    if exists (select 1 from public.orders o
               where o.table_session_id = v_session.id
                 and o.status not in ('REJECTED', 'CANCELLED')) then
      raise exception 'La mesa ya tiene un pedido: agrega la comanda a ese pedido';
    end if;

    insert into public.orders (restaurant_id, table_id, table_session_id, status, subtotal, total,
                               accepted_by, accepted_at, preparing_at)
    values (v_table.restaurant_id, v_table.id, v_session.id, 'PREPARING', v_subtotal, v_subtotal,
            auth.uid(), now(), now())
    returning * into v_order;
  else
    if v_order.cancelled or v_order.status in ('REJECTED', 'CANCELLED') then
      raise exception 'El pedido está cancelado';
    end if;
    if v_order.status = 'PENDING' then
      raise exception 'Acepta primero el pedido del cliente';
    end if;
    if v_order.table_session_id is null
       or not exists (select 1 from public.table_sessions s
                      where s.id = v_order.table_session_id and s.status = 'ACTIVE') then
      raise exception 'La mesa ya fue cerrada';
    end if;
    if exists (select 1 from public.bills b
               where b.table_session_id = v_order.table_session_id and b.status in ('PAID', 'CLOSED')) then
      raise exception 'La cuenta ya fue cobrada: no se puede agregar productos';
    end if;

    update public.orders
    set subtotal = subtotal + v_subtotal,
        total = total + v_subtotal,
        status = 'PREPARING',
        accepted_by = coalesce(accepted_by, auth.uid()),
        accepted_at = coalesce(accepted_at, now()),
        preparing_at = case when status = 'PREPARING' then preparing_at else now() end,
        ready_at = case when status = 'PREPARING' then ready_at else null end,
        delivered_at = case when status = 'PREPARING' then delivered_at else null end
    where id = v_order.id
    returning * into v_order;
  end if;

  select coalesce(max(number), 0) + 1 into v_number from public.tickets where order_id = v_order.id;

  insert into public.tickets (order_id, number, created_by, client_request_id)
  values (v_order.id, v_number, auth.uid(), p_request_id)
  returning * into v_ticket;

  perform public.insert_order_lines(v_order.id, v_ticket.id, v_built -> 'lines');

  update public.table_sessions set last_activity_at = now() where id = v_order.table_session_id;

  update public.waiter_calls
  set status = 'ATTENDED', handled_by = auth.uid(), handled_at = now()
  where table_id = v_table.id and type = 'WAITER' and status in ('PENDING', 'ACCEPTED');

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_table.restaurant_id, auth.uid(), 'CREATE', 'TICKET', v_ticket.id,
          jsonb_build_object('order_id', v_order.id, 'ticket_number', v_number,
                             'folio', v_order.folio, 'subtotal', v_subtotal));

  return jsonb_build_object('order_id', v_order.id, 'ticket_id', v_ticket.id,
    'ticket_number', v_number, 'folio', v_order.folio, 'short_code', v_order.short_code,
    'replayed', false);
end;
$$;

-- ======================= edit_order_item ===================================
create or replace function public.edit_order_item(
  p_order_item_id uuid,
  p_variant_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order_id   uuid;
  v_table_id   uuid;
  v_table      public.tables%rowtype;
  v_order      public.orders%rowtype;
  v_item       public.order_items%rowtype;
  v_variant    public.product_variants%rowtype;
  v_bill_id    uuid;
  v_notes      text;
  v_mods_total numeric(10,2);
  v_new_unit   numeric(10,2);
  v_new_sub    numeric(10,2);
  v_delta      numeric(10,2);
  v_new_vid    uuid;
  v_new_vname  text;
  v_new_vprice numeric(10,2);
  v_changed    boolean := false;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select oi.order_id, o.table_id into v_order_id, v_table_id
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;
  if v_order_id is null then
    raise exception 'Producto no encontrado';
  end if;

  -- Orden de candados: mesa -> pedido -> línea (igual que cancel_order_item).
  select * into v_table from public.tables where id = v_table_id for update;
  select * into v_order from public.orders where id = v_order_id for update;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para editar productos';
  end if;

  if p_variant_id is null and p_notes is null then
    raise exception 'No hay cambios que guardar';
  end if;
  if length(btrim(coalesce(p_notes, ''))) > 200 then
    raise exception 'La nota de un producto admite hasta 200 caracteres';
  end if;

  select * into v_item from public.order_items where id = p_order_item_id for update;
  if v_item.cancelled then
    raise exception 'El producto está cancelado';
  end if;
  if v_order.cancelled or v_order.status in ('REJECTED', 'CANCELLED') then
    raise exception 'El pedido está cancelado';
  end if;

  select id into v_bill_id from public.bills
  where table_session_id = v_order.table_session_id and status in ('OPEN', 'PAID', 'CLOSED');
  if exists (select 1 from public.bills where id = v_bill_id and status in ('PAID', 'CLOSED')) then
    raise exception 'La cuenta ya fue cobrada: no se puede editar productos';
  end if;

  v_new_unit   := v_item.unit_price;
  v_new_vid    := v_item.variant_id;
  v_new_vname  := v_item.variant_name;
  v_new_vprice := v_item.variant_price;

  if p_variant_id is not null and p_variant_id is distinct from v_item.variant_id then
    select * into v_variant
    from public.product_variants
    where id = p_variant_id and product_id = v_item.product_id;
    if not found then
      raise exception 'La variante elegida no corresponde al producto';
    end if;
    if exists (select 1 from public.availability a
               where a.item_type = 'variant' and a.item_id = v_variant.id and a.available = false) then
      raise exception 'La variante no está disponible';
    end if;

    -- Se conservan las personalizaciones ya elegidas (snapshot de precio).
    select coalesce(sum(price_modifier * qty), 0) into v_mods_total
    from public.order_item_options where order_item_id = v_item.id;

    v_new_unit   := v_variant.price + v_mods_total;
    v_new_vid    := v_variant.id;
    v_new_vname  := nullif(v_variant.name, '');
    v_new_vprice := v_variant.price;
    v_changed    := true;
  end if;

  if p_notes is not null then
    v_notes := nullif(btrim(p_notes), '');
    if v_notes is distinct from v_item.notes then
      v_changed := true;
    end if;
  else
    v_notes := v_item.notes;
  end if;

  if not v_changed then
    return jsonb_build_object('order_id', v_order.id, 'order_item_id', v_item.id,
      'unit_price', v_item.unit_price, 'subtotal', v_item.subtotal, 'changed', false);
  end if;

  v_new_sub := v_new_unit * v_item.quantity;
  v_delta   := v_new_sub - v_item.subtotal;

  update public.order_items
  set variant_id = v_new_vid, variant_name = v_new_vname, variant_price = v_new_vprice,
      unit_price = v_new_unit, subtotal = v_new_sub, notes = v_notes
  where id = v_item.id;

  if v_delta <> 0 then
    update public.orders
    set subtotal = subtotal + v_delta, total = total + v_delta
    where id = v_order.id;
  end if;

  if v_bill_id is not null then
    perform public.lock_bill(v_bill_id);
    perform public.recompute_bill(v_bill_id);
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_order.restaurant_id, auth.uid(), 'UPDATE', 'ORDER_ITEM', v_item.id,
          jsonb_build_object('action', 'EDIT_ORDER_ITEM', 'order_id', v_order.id,
            'ticket_id', v_item.ticket_id, 'product_name', v_item.product_name,
            'old_variant_id', v_item.variant_id, 'new_variant_id', v_new_vid,
            'old_unit_price', v_item.unit_price, 'new_unit_price', v_new_unit,
            'old_notes', v_item.notes, 'new_notes', v_notes));

  if v_new_sub < v_item.subtotal then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_order.restaurant_id, auth.uid(), 'UPDATE', 'ORDER_ITEM', v_item.id,
            jsonb_build_object('action', 'PRICE_REDUCED', 'security_event', true,
              'order_id', v_order.id, 'product_name', v_item.product_name,
              'old_amount', v_item.subtotal, 'new_amount', v_new_sub, 'amount', v_item.subtotal - v_new_sub));
  end if;

  return jsonb_build_object('order_id', v_order.id, 'order_item_id', v_item.id,
    'unit_price', v_new_unit, 'subtotal', v_new_sub, 'changed', true);
end;
$$;

-- ======================= reopen_table ======================================
create or replace function public.reopen_table(p_table_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table_id uuid;
  v_table    public.tables%rowtype;
  v_session  public.table_sessions%rowtype;
  v_cancelled integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select table_id into v_table_id from public.table_sessions where id = p_table_session_id;
  if v_table_id is null then
    raise exception 'Mesa no encontrada';
  end if;

  -- Orden de candados: mesa -> sesión.
  select * into v_table from public.tables where id = v_table_id for update;
  select * into v_session from public.table_sessions where id = p_table_session_id for update;

  if not (
    public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para reabrir mesas';
  end if;

  if v_session.status <> 'ACTIVE' then
    raise exception 'La mesa ya fue cerrada';
  end if;
  if exists (select 1 from public.bills b
             where b.table_session_id = v_session.id and b.status in ('PAID', 'CLOSED')) then
    raise exception 'La cuenta ya fue cobrada: la mesa no se puede reabrir';
  end if;

  update public.waiter_calls
  set status = 'CANCELLED', handled_by = auth.uid(), handled_at = now()
  where table_id = v_table.id and type = 'BILL' and status in ('PENDING', 'ACCEPTED');
  get diagnostics v_cancelled = row_count;

  if v_cancelled = 0 then
    raise exception 'La mesa no está en estado cuenta';
  end if;

  update public.table_sessions set last_activity_at = now() where id = v_session.id;
  perform public.refresh_table_status(v_table.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_table.restaurant_id, auth.uid(), 'UPDATE', 'TABLE_SESSION', v_session.id,
          jsonb_build_object('action', 'REOPEN_TABLE', 'table_id', v_table.id,
            'cancelled_bill_requests', v_cancelled));

  return jsonb_build_object('session_id', v_session.id, 'table_id', v_table.id);
end;
$$;

revoke all on function public.edit_order_item(uuid, uuid, text) from public, anon;
revoke all on function public.reopen_table(uuid) from public, anon;
grant execute on function public.edit_order_item(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reopen_table(uuid) to authenticated, service_role;
