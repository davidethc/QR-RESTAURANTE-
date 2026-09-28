-- ---------------------------------------------------------------------------
-- Venta de mostrador · C5 · RPCs.
--
-- Depende de C1–C4, M8 (lock_bill, recompute_bill, bill_json) y
-- business_today / business_day_bounds (M1).
--
--   create_counter_sale(items, notes, label, key, restaurant?)
--       OWNER, ADMIN, WAITER (los mismos que create_staff_order).
--       Crea la venta (sesión del mostrador), el pedido directo a
--       preparación y la cuenta abierta, en una transacción. Idempotente
--       por p_idempotency_key. Cobrar sigue siendo record_payment.
--   cancel_counter_sale(bill, reason)
--       OWNER, ADMIN. Venta sin pagos vigentes: anula la cuenta, cancela
--       sus pedidos en curso y cierra la sesión. Con pagos: anularlos antes
--       (void_payment), igual que void_bill.
--
-- Candados:
--   create: mesa del mostrador (FOR UPDATE) -> filas nuevas. Serializa el
--           correlativo #N del día y los reintentos con la misma clave.
--   cancel: pedidos de la venta -> lock_bill (mesa -> cuenta) -> sesión.
--           Mismo orden que mark_order_* (pedido -> trigger -> mesa ->
--           cuenta), así no hay abrazo mortal con una entrega en paralelo.
-- ---------------------------------------------------------------------------

-- Interna: la mesa "Mostrador" del restaurante, creada si no existe, y
-- bloqueada (FOR UPDATE) para quien llama.
create or replace function public.lock_counter_table(p_restaurant_id uuid)
returns public.tables
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_table public.tables%rowtype;
begin
  insert into public.tables (restaurant_id, number, name, kind)
  values (p_restaurant_id, 0, 'Mostrador', 'COUNTER')
  on conflict (restaurant_id) where kind = 'COUNTER' do nothing;

  select * into v_table
  from public.tables
  where restaurant_id = p_restaurant_id
    and kind = 'COUNTER'
  for update;

  return v_table;
end;
$$;

revoke all on function public.lock_counter_table(uuid) from public, anon, authenticated;


-- Interna: respuesta común de create_counter_sale (también en reintentos).
create or replace function public.counter_sale_json(p_session_id uuid, p_replayed boolean)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'order_id', (
      select o.id from public.orders o
      where o.table_session_id = ts.id
      order by o.created_at, o.order_number
      limit 1
    ),
    'bill_id',          b.id,
    'bill_number',      b.bill_number,
    'table_session_id', ts.id,
    'counter_number',   ts.counter_number,
    'customer_label',   ts.customer_label,
    'place_label',      public.place_label('COUNTER', 0, ts.counter_number, ts.customer_label),
    'replayed',         p_replayed,
    'bill',             public.bill_json(b.id)
  )
  from public.table_sessions ts
  join public.bills b on b.table_session_id = ts.id and b.status <> 'VOID'
  where ts.id = p_session_id;
$$;

revoke all on function public.counter_sale_json(uuid, boolean) from public, anon, authenticated;


-- p_items: [{"product_id": uuid, "quantity": int, "notes": text?}, ...]
create or replace function public.create_counter_sale(
  p_items jsonb,
  p_idempotency_key uuid,
  p_notes text default null,
  p_customer_label text default null,
  p_restaurant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
  v_count         integer;
  v_table         public.tables%rowtype;
  v_existing      uuid;
  v_replay        jsonb;
  v_label         text;
  v_notes         text;
  v_day           date;
  v_start         timestamptz;
  v_end           timestamptz;
  v_number        integer;
  v_session       public.table_sessions%rowtype;
  v_order_id      uuid;
  v_bill          public.bills%rowtype;
  v_item          jsonb;
  v_product_id    uuid;
  v_quantity      integer;
  v_item_notes    text;
  v_product       public.products%rowtype;
  v_subtotal      numeric(10,2) := 0;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  -- Restaurante: el indicado o, si no viene, el único donde el usuario vende.
  if p_restaurant_id is null then
    select count(distinct rm.restaurant_id), min(rm.restaurant_id::text)::uuid
    into v_count, v_restaurant_id
    from public.restaurant_members rm
    where rm.user_id = auth.uid()
      and rm.status = 'ACTIVE'
      and rm.role in ('OWNER', 'ADMIN', 'WAITER');

    if v_count <> 1 then
      raise exception 'Indica el restaurante de la venta';
    end if;
  else
    v_restaurant_id := p_restaurant_id;
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para vender en mostrador';
  end if;

  -- La venta de mostrador nace con su cuenta: sin cobro no tiene sentido.
  if not coalesce((select billing_enabled from public.restaurants where id = v_restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  v_table := public.lock_counter_table(v_restaurant_id);

  -- Idempotencia (después del candado: un reintento concurrente espera y
  -- aquí ya ve la venta del primero).
  select id into v_existing
  from public.table_sessions
  where restaurant_id = v_restaurant_id
    and client_request_id = p_idempotency_key;

  if v_existing is not null then
    v_replay := public.counter_sale_json(v_existing, true);
    -- Venta cancelada (cuenta VOID): counter_sale_json no la encuentra.
    if v_replay is null then
      raise exception 'Esta venta ya fue cancelada';
    end if;
    return v_replay;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener productos';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Demasiados productos en una sola venta (máximo 100 líneas)';
  end if;

  v_label := nullif(btrim(coalesce(p_customer_label, '')), '');
  if length(v_label) > 40 then
    raise exception 'El nombre de la venta admite hasta 40 caracteres';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if length(v_notes) > 500 then
    raise exception 'Las notas admiten hasta 500 caracteres';
  end if;

  -- Precios del servidor, nunca del navegador. Primera pasada: validar y sumar.
  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity   := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Producto inválido en el pedido';
    end;

    if v_product_id is null or v_quantity is null or v_quantity <= 0 or v_quantity > 999 then
      raise exception 'Cantidad inválida';
    end if;

    if length(btrim(coalesce(v_item ->> 'notes', ''))) > 200 then
      raise exception 'La nota de un producto admite hasta 200 caracteres';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id
      and restaurant_id = v_restaurant_id
      and active = true
      and available = true;

    if not found then
      raise exception 'Uno de los productos no está disponible';
    end if;

    v_subtotal := v_subtotal + v_product.price * v_quantity;
  end loop;

  -- "Para llevar #N": correlativo del día de negocio del restaurante.
  v_day := public.business_today(v_restaurant_id);

  select b.start_at, b.end_at into v_start, v_end
  from public.business_day_bounds(v_restaurant_id, v_day, v_day) b;

  select coalesce(max(ts.counter_number), 0) + 1 into v_number
  from public.table_sessions ts
  where ts.table_id = v_table.id
    and ts.table_kind = 'COUNTER'
    and ts.started_at >= v_start
    and ts.started_at < v_end;

  insert into public.table_sessions (
    restaurant_id, table_id, table_kind, counter_number, customer_label, client_request_id
  )
  values (
    v_restaurant_id, v_table.id, 'COUNTER', v_number, v_label, p_idempotency_key
  )
  returning * into v_session;

  -- Directo a preparación, igual que un pedido tomado por el personal.
  insert into public.orders (
    restaurant_id, table_id, table_session_id, status, subtotal, total, notes,
    accepted_by, accepted_at, preparing_at
  )
  values (
    v_restaurant_id, v_table.id, v_session.id, 'PREPARING', v_subtotal, v_subtotal, v_notes,
    auth.uid(), now(), now()
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity   := (v_item ->> 'quantity')::integer;
    v_item_notes := nullif(btrim(coalesce(v_item ->> 'notes', '')), '');

    select * into v_product
    from public.products
    where id = v_product_id
      and restaurant_id = v_restaurant_id;

    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price, subtotal, notes
    )
    values (
      v_order_id, v_product.id, v_product.name, v_quantity, v_product.price,
      v_product.price * v_quantity, v_item_notes
    );
  end loop;

  -- La cuenta se abre en el acto: la venta se cobra en el mostrador.
  insert into public.bills (restaurant_id, table_id, table_session_id, opened_by)
  values (v_restaurant_id, v_table.id, v_session.id, auth.uid())
  returning * into v_bill;

  v_bill := public.recompute_bill(v_bill.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values
    (v_restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order_id,
     jsonb_build_object('counter_number', v_number)),
    (v_restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order_id, null),
    (v_restaurant_id, auth.uid(), 'OPEN_BILL', 'BILL', v_bill.id,
     jsonb_build_object(
       'bill_number', v_bill.bill_number,
       'table_session_id', v_session.id,
       'counter_number', v_number
     ));

  return public.counter_sale_json(v_session.id, false);
end;
$$;

revoke all on function public.create_counter_sale(jsonb, uuid, text, text, uuid) from public;
revoke execute on function public.create_counter_sale(jsonb, uuid, text, text, uuid) from anon;
grant execute on function public.create_counter_sale(jsonb, uuid, text, text, uuid) to authenticated, service_role;


create or replace function public.cancel_counter_sale(p_bill_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill      public.bills%rowtype;
  v_kind      public.table_kind;
  v_reason    text;
  v_cancelled uuid[];
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_bill
  from public.bills
  where id = p_bill_id;

  if v_bill.id is null then
    raise exception 'Venta no encontrada';
  end if;

  -- Rol antes que tipo: a quien no es admin de ese restaurante no se le
  -- dice si la cuenta existe ni de qué tipo es.
  if not (
    public.user_has_restaurant_role(v_bill.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_bill.restaurant_id, 'ADMIN')
  ) then
    raise exception 'Solo el dueño o un administrador cancelan ventas';
  end if;

  select kind into v_kind from public.tables where id = v_bill.table_id;
  if v_kind is distinct from 'COUNTER' then
    raise exception 'Esta cuenta es de una mesa, no una venta de mostrador';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if length(v_reason) < 3 then
    raise exception 'Escribe el motivo de la cancelación (mínimo 3 caracteres)';
  end if;

  -- Pedidos primero (ver cabecera), después mesa -> cuenta.
  perform 1
  from public.orders
  where table_session_id = v_bill.table_session_id
  order by id
  for update;

  v_bill := public.lock_bill(p_bill_id);

  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'La venta ya está cerrada o anulada';
  end if;

  if exists (
    select 1 from public.payments
    where bill_id = v_bill.id and status = 'COMPLETED'
  ) then
    raise exception 'La venta tiene pagos: anúlalos primero';
  end if;

  -- La cuenta se anula ANTES de cancelar pedidos: así el trigger de pedidos
  -- ya no encuentra cuenta viva y no intenta recalcular ni cerrar nada.
  update public.bills
  set status = 'VOID',
      voided_by = auth.uid(),
      voided_at = now(),
      void_reason = v_reason
  where id = v_bill.id;

  with c as (
    update public.orders
    set status = 'CANCELLED',
        rejection_reason = v_reason
    where table_session_id = v_bill.table_session_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_cancelled from c;

  update public.table_sessions
  set status = 'CLOSED',
      closed_at = coalesce(closed_at, now())
  where id = v_bill.table_session_id
    and status = 'ACTIVE';

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  select v_bill.restaurant_id, auth.uid(), 'UPDATE', 'ORDER', oid,
         jsonb_build_object('action', 'CANCEL_ORDER', 'reason', v_reason, 'counter_sale', true)
  from unnest(v_cancelled) as oid;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'VOID_BILL', 'BILL', v_bill.id,
    jsonb_build_object(
      'bill_number', v_bill.bill_number, 'total', v_bill.total,
      'reason', v_reason, 'counter_sale', true,
      'cancelled_orders', to_jsonb(v_cancelled)
    )
  );

  return public.bill_json(v_bill.id);
end;
$$;

revoke all on function public.cancel_counter_sale(uuid, text) from public;
revoke execute on function public.cancel_counter_sale(uuid, text) from anon;
grant execute on function public.cancel_counter_sale(uuid, text) to authenticated, service_role;
