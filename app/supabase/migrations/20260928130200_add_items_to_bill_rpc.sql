-- ---------------------------------------------------------------------------
-- Caja · agregar producto durante el cobro (3/3).
--
--   add_items_to_bill(bill, items, key, send_to_kitchen = false) -> jsonb
--       OWNER, ADMIN (quien cobra). Agrega un pedido nuevo a la sesión de LA
--       CUENTA (nunca busca ni crea otra sesión). Devuelve bill_json(bill)
--       más 'replayed' y 'added_order_id'. Idempotente por p_idempotency_key
--       (orders.client_request_id).
--
--   send_to_kitchen = false: el pedido nace DELIVERED ("entregado en caja"),
--     delivered_at = now(), accepted_at/preparing_at/ready_at en NULL. Ventas
--     lo cuenta (DELIVERED por delivered_at); report_prep_times no, porque
--     todas sus etapas filtran por accepted_at.
--   send_to_kitchen = true: nace PREPARING, igual que create_staff_order; la
--     cocina lo ve y mark_order_delivered (ACCEPTED/PREPARING/READY) lo cierra.
--
-- Candados: lock_bill (mesa -> cuenta). El INSERT en orders dispara
-- trg_orders_recompute_bill, que vuelve a pedir mesa y cuenta: ya son de esta
-- transacción, no hay espera. No se bloquea ningún pedido existente, así que
-- no hay abrazo mortal con mark_order_* (pedido -> mesa -> cuenta).
--
-- No toca create_staff_order, recompute_bill, finalize_bill, record_payment
-- ni el trigger: los usa tal como están.
-- ---------------------------------------------------------------------------

create or replace function public.add_items_to_bill(
  p_bill_id uuid,
  p_items jsonb,
  p_idempotency_key uuid,
  p_send_to_kitchen boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
  v_bill          public.bills%rowtype;
  v_session       public.table_sessions%rowtype;
  v_existing      public.orders%rowtype;
  v_item          jsonb;
  v_product       public.products%rowtype;
  v_product_id    uuid;
  v_quantity      integer;
  v_notes         text;
  v_lines         jsonb := '[]'::jsonb;
  v_subtotal      numeric(10,2) := 0;
  v_kitchen       boolean := coalesce(p_send_to_kitchen, false);
  v_order_id      uuid;
begin
  -- 1. Sesión y clave.
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  -- 2. Restaurante (lectura sin candado), rol y cobro habilitado. Rol antes
  --    que nada más: a quien no cobra no se le dice cómo está la cuenta.
  select restaurant_id into v_restaurant_id from public.bills where id = p_bill_id;
  if v_restaurant_id is null then
    raise exception 'Cuenta no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado para cobrar';
  end if;

  if not coalesce((select billing_enabled from public.restaurants where id = v_restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  -- 3. Forma de la carga (sin tocar productos todavía).
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Demasiados productos en una sola tanda (máximo 50 líneas)';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Producto inválido en el pedido';
    end if;

    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity   := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Producto inválido en el pedido';
    end;

    if v_product_id is null then
      raise exception 'Producto inválido en el pedido';
    end if;

    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'La cantidad debe estar entre 1 y 99';
    end if;

    if v_item ? 'notes'
       and jsonb_typeof(v_item -> 'notes') not in ('string', 'null') then
      raise exception 'Producto inválido en el pedido';
    end if;

    if length(btrim(coalesce(v_item ->> 'notes', ''))) > 200 then
      raise exception 'La nota de un producto admite hasta 200 caracteres';
    end if;
  end loop;

  -- 4. Candado mesa -> cuenta (mismo orden que el trigger y open_bill).
  v_bill := public.lock_bill(p_bill_id);

  -- 5. Idempotencia, ya bajo el candado: un reintento concurrente con la
  --    misma clave espera aquí y ve el pedido del primero.
  select * into v_existing
  from public.orders
  where restaurant_id = v_restaurant_id
    and client_request_id = p_idempotency_key;

  if found then
    if v_existing.table_session_id is distinct from v_bill.table_session_id then
      raise exception 'La clave de idempotencia ya se usó en otra cuenta';
    end if;
    return public.bill_json(p_bill_id)
      || jsonb_build_object('replayed', true, 'added_order_id', v_existing.id);
  end if;

  -- 6. Estados, con el mensaje que el cajero necesita.
  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'Esta cuenta ya se cerró: usa Venta rápida';
  end if;

  select * into v_session
  from public.table_sessions
  where id = v_bill.table_session_id;

  -- El trigger también lo rechazaría, pero con un mensaje pensado para el
  -- cliente del QR. Nunca se busca ni se crea otra sesión: el ítem se
  -- cobraría en una cuenta distinta.
  if v_session.status = 'EXPIRED' then
    raise exception 'La mesa lleva más de 4 h sin actividad: cobra lo pendiente y abre una venta nueva';
  elsif v_session.status is distinct from 'ACTIVE' then
    raise exception 'La sesión de esta mesa ya está cerrada: cobra lo pendiente y abre una venta nueva';
  end if;

  -- 7. Precios del servidor, nunca del navegador. Se guarda la foto de cada
  --    línea para insertar exactamente lo que se validó.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity   := (v_item ->> 'quantity')::integer;
    v_notes      := nullif(btrim(coalesce(v_item ->> 'notes', '')), '');

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
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',   v_product.id,
      'product_name', v_product.name,
      'quantity',     v_quantity,
      'unit_price',   v_product.price,
      'subtotal',     v_product.price * v_quantity,
      'notes',        v_notes
    ));
  end loop;

  -- 8. Pedido en la sesión de la cuenta. El total queda fijo en el INSERT,
  --    antes de que el trigger recalcule la cuenta.
  if v_kitchen then
    insert into public.orders (
      restaurant_id, table_id, table_session_id, status, subtotal, total,
      accepted_by, accepted_at, preparing_at, client_request_id
    )
    values (
      v_restaurant_id, v_bill.table_id, v_bill.table_session_id, 'PREPARING',
      v_subtotal, v_subtotal, auth.uid(), now(), now(), p_idempotency_key
    )
    returning id into v_order_id;
  else
    insert into public.orders (
      restaurant_id, table_id, table_session_id, status, subtotal, total,
      accepted_by, delivered_at, client_request_id
    )
    values (
      v_restaurant_id, v_bill.table_id, v_bill.table_session_id, 'DELIVERED',
      v_subtotal, v_subtotal, auth.uid(), now(), p_idempotency_key
    )
    returning id into v_order_id;
  end if;

  -- 9. Ítems (no hay trigger en order_items).
  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, subtotal, notes
  )
  select v_order_id,
         (l ->> 'product_id')::uuid,
         l ->> 'product_name',
         (l ->> 'quantity')::integer,
         (l ->> 'unit_price')::numeric,
         (l ->> 'subtotal')::numeric,
         l ->> 'notes'
  from jsonb_array_elements(v_lines) with ordinality as t(l, n)
  order by n;

  -- 10. Recalcular explícito (idempotente): PAID vuelve a OPEN si sube el
  --     saldo y los descuentos PERCENT se ajustan a la base nueva.
  v_bill := public.recompute_bill(p_bill_id);

  -- 11. Auditoría.
  if v_kitchen then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id)
    values
      (v_restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order_id),
      (v_restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order_id);
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_restaurant_id, auth.uid(), 'ADD_BILL_ITEMS', 'BILL', v_bill.id,
    jsonb_build_object(
      'bill_number',     v_bill.bill_number,
      'order_id',        v_order_id,
      'items',           v_lines,
      'total',           v_subtotal,
      'send_to_kitchen', v_kitchen,
      'balance_after',   v_bill.balance
    )
  );

  return public.bill_json(p_bill_id)
    || jsonb_build_object('replayed', false, 'added_order_id', v_order_id);
end;
$$;

-- 12. Solo usuarios autenticados (el rol se valida adentro).
revoke all on function public.add_items_to_bill(uuid, jsonb, uuid, boolean) from public, anon;
grant execute on function public.add_items_to_bill(uuid, jsonb, uuid, boolean) to authenticated, service_role;
