-- ---------------------------------------------------------------------------
-- Solo OWNER y ADMIN manejan dinero, también en la base.
--
-- Decisión de negocio (2026-09-27, ya aplicada en la app con canHandleMoney):
-- el mesero toma y entrega pedidos, pero cobra el dueño/administrador. Hasta
-- ahora la base seguía aceptando WAITER en estas RPCs; un mesero podía
-- llamarlas directo por PostgREST saltándose la UI.
--
-- Cambia SOLO la condición de rol (cuerpos copiados de la versión viva en
-- producción, verificada por md5 de prosrc):
--   record_payment, open_bill, apply_bill_discount, close_bill,
--   open_cash_session, close_cash_session
-- Ya eran solo OWNER/ADMIN: remove_bill_discount, void_bill, void_payment,
-- add_cash_movement.
-- WAITER se mantiene en: create_staff_order, accept/mark_order_*,
-- close_table_session (liberar mesa; con saldo solo admin fuerza),
-- create_counter_sale.
-- CREATE OR REPLACE conserva los grants existentes (authenticated,
-- service_role; anon sin execute).
-- ---------------------------------------------------------------------------

-- record_payment: sin WAITER (antes en 20260926170400_billing_rpcs.sql).
create or replace function public.record_payment(
  p_bill_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_idempotency_key uuid,
  p_tip_amount numeric default 0,
  p_tendered_amount numeric default null,
  p_reference text default null,
  p_card_type text default null,
  p_items jsonb default null,
  p_cash_session_id uuid default null,
  p_auto_close boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
  v_bill      public.bills%rowtype;
  v_existing  public.payments%rowtype;
  v_payment   public.payments%rowtype;
  v_amount    numeric(10,2);
  v_tip       numeric(10,2);
  v_tendered  numeric(10,2);
  v_change    numeric(10,2);
  v_session   uuid;
  v_item      jsonb;
  v_item_id   uuid;
  v_qty       integer;
  v_item_qty  integer;
  v_paid_qty  integer;
  v_closed    boolean := false;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

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

  -- 2. Candado de la cuenta. Todo cobro de esta cuenta pasa en fila.
  v_bill := public.lock_bill(p_bill_id);

  -- 1. Idempotencia (después del candado: un reintento concurrente con la
  --    misma clave espera y aquí ya ve el pago del primero).
  select * into v_existing
  from public.payments
  where restaurant_id = v_restaurant_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.bill_id <> p_bill_id then
      raise exception 'La clave de idempotencia ya se usó en otra cuenta';
    end if;
    return jsonb_build_object(
      'payment_id', v_existing.id,
      'change_amount', v_existing.change_amount,
      'replayed', true,
      'bill', public.bill_json(p_bill_id)
    );
  end if;

  if v_bill.status <> 'OPEN' then
    raise exception 'La cuenta no tiene saldo por cobrar (estado: %)', v_bill.status;
  end if;

  -- 3. Recalcular con lo último (pedidos/descuentos).
  v_bill := public.recompute_bill(v_bill.id);

  -- 4. Monto.
  if p_method is null then
    raise exception 'Elige la forma de pago';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  v_tip    := round(coalesce(p_tip_amount, 0), 2);

  if v_amount <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;
  if v_tip < 0 then
    raise exception 'La propina no puede ser negativa';
  end if;
  if v_amount > v_bill.balance then
    raise exception 'El monto (%) supera el saldo pendiente (%)', v_amount, v_bill.balance;
  end if;

  -- 5. Caja abierta (FOR SHARE: el cierre de caja espera a este cobro).
  v_session := public.resolve_open_cash_session(v_bill.restaurant_id, p_cash_session_id);

  -- 6. Vuelto.
  if p_method = 'CASH' then
    v_tendered := round(coalesce(p_tendered_amount, v_amount + v_tip), 2);
    if v_tendered < v_amount + v_tip then
      raise exception 'El efectivo recibido (%) no alcanza para % más % de propina',
        v_tendered, v_amount, v_tip;
    end if;
    v_change := v_tendered - v_amount - v_tip;
  else
    v_tendered := null;
    v_change   := null;
  end if;

  -- 7. Pago e ítems.
  insert into public.payments (
    restaurant_id, bill_id, cash_session_id, method, amount, tip_amount,
    tendered_amount, change_amount, reference, card_type, received_by,
    idempotency_key
  )
  values (
    v_bill.restaurant_id, v_bill.id, v_session, p_method, v_amount, v_tip,
    v_tendered, v_change,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_card_type, '')), ''),
    auth.uid(), p_idempotency_key
  )
  returning * into v_payment;

  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    for v_item in select * from jsonb_array_elements(p_items) loop
      begin
        v_item_id := (v_item ->> 'order_item_id')::uuid;
        v_qty     := (v_item ->> 'quantity')::integer;
      exception when others then
        raise exception 'Ítem de pago inválido';
      end;

      if v_item_id is null or v_qty is null or v_qty <= 0 then
        raise exception 'Ítem de pago inválido';
      end if;

      select oi.quantity into v_item_qty
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = v_item_id
        and o.table_session_id = v_bill.table_session_id
        and o.status not in ('REJECTED', 'CANCELLED');

      if v_item_qty is null then
        raise exception 'El ítem no pertenece a esta cuenta';
      end if;

      select coalesce(sum(pi.quantity), 0) into v_paid_qty
      from public.payment_items pi
      join public.payments p on p.id = pi.payment_id
      where pi.order_item_id = v_item_id
        and p.status = 'COMPLETED';

      if v_paid_qty + v_qty > v_item_qty then
        raise exception 'Se está pagando más cantidad de la que tiene el ítem (pagado %, pedido %, máximo %)',
          v_paid_qty, v_qty, v_item_qty;
      end if;

      insert into public.payment_items (payment_id, order_item_id, restaurant_id, quantity)
      values (v_payment.id, v_item_id, v_bill.restaurant_id, v_qty)
      on conflict (payment_id, order_item_id)
      do update set quantity = public.payment_items.quantity + excluded.quantity;
    end loop;
  end if;

  -- 8. Recalcular.
  v_bill := public.recompute_bill(v_bill.id);

  -- 10. Auditar (antes del cierre para que el orden del log sea natural).
  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'RECORD_PAYMENT', 'PAYMENT', v_payment.id,
    jsonb_build_object(
      'bill_id', v_bill.id, 'bill_number', v_bill.bill_number,
      'method', p_method, 'amount', v_amount, 'tip_amount', v_tip,
      'tendered_amount', v_tendered, 'change_amount', v_change,
      'cash_session_id', v_session, 'balance_after', v_bill.balance
    )
  );

  -- 9. Saldo 0 y sin pedidos en curso: se cierra la cuenta y la mesa.
  if coalesce(p_auto_close, true)
     and v_bill.balance = 0
     and not exists (
       select 1 from public.orders
       where table_session_id = v_bill.table_session_id
         and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
     ) then
    perform public.finalize_bill(v_bill.id, auth.uid());
    v_closed := true;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'change_amount', v_change,
    'replayed', false,
    'closed', v_closed,
    'bill', public.bill_json(v_bill.id)
  );
end;
$$;

-- open_bill: sin WAITER (antes en 20260926170400_billing_rpcs.sql).
create or replace function public.open_bill(p_table_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session public.table_sessions%rowtype;
  v_bill    public.bills%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Candados mesa -> sesión (mismo orden que create_staff_order): dos
  -- "abrir cuenta" simultáneos se serializan y el segundo encuentra la
  -- cuenta del primero.
  perform 1
  from public.tables t
  join public.table_sessions ts on ts.table_id = t.id
  where ts.id = p_table_session_id
  for update of t;

  select * into v_session
  from public.table_sessions
  where id = p_table_session_id
  for update;

  if not found then
    raise exception 'Sesión de mesa no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_session.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_session.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado para cobrar';
  end if;

  if not coalesce((select billing_enabled from public.restaurants where id = v_session.restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  select * into v_bill
  from public.bills
  where table_session_id = v_session.id
    and status <> 'VOID'
  for update;

  if found then
    if v_bill.status in ('OPEN', 'PAID') then
      perform public.recompute_bill(v_bill.id);
    end if;
    return public.bill_json(v_bill.id);
  end if;

  -- Una sesión EXPIRED (4 h sin actividad) sigue siendo cobrable.
  if v_session.status not in ('ACTIVE', 'EXPIRED') then
    raise exception 'La sesión de esta mesa ya está cerrada';
  end if;

  insert into public.bills (restaurant_id, table_id, table_session_id, opened_by)
  values (v_session.restaurant_id, v_session.table_id, v_session.id, auth.uid())
  returning * into v_bill;

  perform public.recompute_bill(v_bill.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_session.restaurant_id, auth.uid(), 'OPEN_BILL', 'BILL', v_bill.id,
    jsonb_build_object('bill_number', v_bill.bill_number, 'table_session_id', v_session.id)
  );

  return public.bill_json(v_bill.id);
end;
$$;

-- apply_bill_discount: sin WAITER (antes en 20260926170400_billing_rpcs.sql).
create or replace function public.apply_bill_discount(
  p_bill_id uuid,
  p_kind public.discount_kind,
  p_value numeric,
  p_reason text,
  p_order_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill      public.bills%rowtype;
  v_is_admin  boolean;
  v_value     numeric(10,2);
  v_base      numeric(10,2);
  v_amount    numeric(10,2);
  v_cap       numeric(5,2);
  v_new_total_discount numeric(10,2);
  v_discount_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_bill := public.lock_bill(p_bill_id);

  v_is_admin := public.user_has_restaurant_role(v_bill.restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(v_bill.restaurant_id, 'ADMIN');

  if not v_is_admin then
    raise exception 'No autorizado para aplicar descuentos';
  end if;

  if v_bill.status <> 'OPEN' then
    raise exception 'Solo se descuenta sobre una cuenta abierta con saldo';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe el motivo del descuento (mínimo 3 caracteres)';
  end if;

  if p_kind is null then
    raise exception 'Tipo de descuento inválido';
  end if;

  v_value := round(coalesce(p_value, 0), 2);
  if v_value <= 0 then
    raise exception 'El descuento debe ser mayor que cero';
  end if;
  if p_kind = 'PERCENT' and v_value > 100 then
    raise exception 'Un descuento porcentual no puede superar el 100%%';
  end if;

  v_bill := public.recompute_bill(v_bill.id);

  if p_order_item_id is not null then
    select oi.subtotal into v_base
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = p_order_item_id
      and o.table_session_id = v_bill.table_session_id
      and o.status not in ('REJECTED', 'CANCELLED');

    if v_base is null then
      raise exception 'El ítem no pertenece a esta cuenta';
    end if;
  else
    v_base := v_bill.subtotal;
  end if;

  if p_kind = 'PERCENT' then
    v_amount := round(v_base * v_value / 100, 2);
  else
    if v_value > v_base then
      raise exception 'El descuento supera el valor sobre el que se aplica';
    end if;
    v_amount := v_value;
  end if;

  if v_amount <= 0 then
    raise exception 'El descuento resulta en cero';
  end if;

  if v_amount > v_bill.balance then
    raise exception 'El descuento supera el saldo pendiente (%)', v_bill.balance;
  end if;

  -- Tope del mesero: acumulado de descuentos sobre el subtotal de la cuenta.
  if not v_is_admin then
    select coalesce(max_waiter_discount_pct, 0) into v_cap
    from public.restaurants where id = v_bill.restaurant_id;

    v_new_total_discount := v_bill.discount_total + v_amount;

    if v_cap <= 0
       or v_bill.subtotal <= 0
       or v_new_total_discount * 100 > v_bill.subtotal * v_cap then
      raise exception 'El descuento supera el máximo permitido al mesero (% %%)', coalesce(v_cap, 0);
    end if;
  end if;

  insert into public.bill_discounts (
    restaurant_id, bill_id, order_item_id, kind, value, amount, reason, applied_by
  )
  values (
    v_bill.restaurant_id, v_bill.id, p_order_item_id, p_kind, v_value, v_amount,
    btrim(p_reason), auth.uid()
  )
  returning id into v_discount_id;

  perform public.recompute_bill(v_bill.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'APPLY_DISCOUNT', 'BILL', v_bill.id,
    jsonb_build_object(
      'discount_id', v_discount_id, 'kind', p_kind, 'value', v_value,
      'amount', v_amount, 'order_item_id', p_order_item_id, 'reason', btrim(p_reason)
    )
  );

  return public.bill_json(v_bill.id);
end;
$$;

-- close_bill: sin WAITER (antes en 20260926170400_billing_rpcs.sql).
create or replace function public.close_bill(p_bill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill public.bills%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_bill := public.lock_bill(p_bill_id);

  if not (
    public.user_has_restaurant_role(v_bill.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_bill.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado para cerrar cuentas';
  end if;

  v_bill := public.recompute_bill(v_bill.id);

  if v_bill.status <> 'PAID' then
    raise exception 'La cuenta aún tiene saldo pendiente o ya está cerrada';
  end if;

  perform public.finalize_bill(v_bill.id, auth.uid());

  return public.bill_json(v_bill.id);
end;
$$;

-- open_cash_session: sin WAITER (antes en 20260926170300_cash_session_rpcs.sql).
create or replace function public.open_cash_session(
  p_register_id uuid,
  p_opening_float numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_register public.cash_registers%rowtype;
  v_session  public.cash_sessions%rowtype;
  v_float    numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_register
  from public.cash_registers
  where id = p_register_id
  for update;

  if not found then
    raise exception 'Caja no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_register.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_register.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado para abrir la caja';
  end if;

  if not coalesce((select billing_enabled from public.restaurants where id = v_register.restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  if not v_register.active then
    raise exception 'La caja está desactivada';
  end if;

  v_float := round(coalesce(p_opening_float, 0), 2);
  if v_float < 0 then
    raise exception 'El fondo inicial no puede ser negativo';
  end if;

  begin
    insert into public.cash_sessions (restaurant_id, register_id, opened_by, opening_float)
    values (v_register.restaurant_id, v_register.id, auth.uid(), v_float)
    returning * into v_session;
  exception when unique_violation then
    raise exception 'Ya hay una caja abierta';
  end;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_register.restaurant_id, auth.uid(), 'OPEN_CASH_SESSION', 'CASH_SESSION', v_session.id,
    jsonb_build_object('register_id', v_register.id, 'opening_float', v_float)
  );

  return jsonb_build_object(
    'id',            v_session.id,
    'register_id',   v_session.register_id,
    'register_name', v_register.name,
    'status',        v_session.status,
    'opened_by',     v_session.opened_by,
    'opened_at',     v_session.opened_at,
    'opening_float', v_session.opening_float
  );
end;
$$;

-- close_cash_session: sin WAITER (antes en 20260926170300_cash_session_rpcs.sql).
create or replace function public.close_cash_session(
  p_cash_session_id uuid,
  p_counts jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.cash_sessions%rowtype;
  v_is_admin boolean;
  v_key      text;
  v_counted  numeric(10,2);
  v_cash_expected numeric(10,2);
  v_cash_counted  numeric(10,2);
  r record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id
  for update;

  if not found then
    raise exception 'Turno de caja no encontrado';
  end if;

  v_is_admin := public.user_has_restaurant_role(v_session.restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(v_session.restaurant_id, 'ADMIN');

  if not v_is_admin then
    raise exception 'No autorizado para cerrar la caja';
  end if;

  if v_session.status <> 'OPEN' then
    raise exception 'La caja ya está cerrada';
  end if;

  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    raise exception 'Conteo inválido';
  end if;

  for v_key in select jsonb_object_keys(p_counts) loop
    if v_key not in (select unnest(enum_range(null::public.payment_method))::text) then
      raise exception 'Método de pago desconocido en el conteo: %', v_key;
    end if;
    if jsonb_typeof(p_counts -> v_key) <> 'number' or (p_counts ->> v_key)::numeric < 0 then
      raise exception 'Conteo inválido para %', v_key;
    end if;
  end loop;

  if not (p_counts ? 'CASH') then
    raise exception 'Falta el conteo de efectivo';
  end if;

  for r in select * from public.cash_session_expected(v_session.id) loop
    v_counted := case
      when p_counts ? r.method::text then round((p_counts ->> r.method::text)::numeric, 2)
      else null
    end;

    if r.method = 'CASH' then
      v_cash_expected := r.expected;
      v_cash_counted  := v_counted;
    end if;

    -- Una fila por método, aunque no haya movimiento (snapshot completo).
    insert into public.cash_session_counts (
      cash_session_id, method, restaurant_id, expected, counted, difference
    )
    values (
      v_session.id, r.method, v_session.restaurant_id, r.expected, v_counted,
      case when v_counted is null then null else v_counted - r.expected end
    );
  end loop;

  update public.cash_sessions
  set status          = 'CLOSED',
      closed_by       = auth.uid(),
      closed_at       = now(),
      notes           = nullif(btrim(coalesce(p_notes, '')), '')
  where id = v_session.id
  returning * into v_session;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_session.restaurant_id, auth.uid(), 'CLOSE_CASH_SESSION', 'CASH_SESSION', v_session.id,
    jsonb_build_object(
      'expected_cash', v_cash_expected,
      'counted_cash', v_cash_counted,
      'cash_difference', v_cash_counted - v_cash_expected,
      'counts', p_counts
    )
  );

  if v_is_admin then
    return public.get_cash_session_summary(v_session.id);
  end if;

  return jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'closed_at', v_session.closed_at,
    'can_see_expected', false
  );
end;
$$;
