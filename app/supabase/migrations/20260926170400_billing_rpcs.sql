-- ---------------------------------------------------------------------------
-- Módulo 1 · M10 · RPCs de cobro.
--
-- Depende de M4 (audit_action), M5 (billing_enabled,
-- max_waiter_discount_pct), M8 (recompute_bill, finalize_bill,
-- resolve_open_cash_session, bill_json) y M9.
--
--   open_bill(session)                       OWNER, ADMIN, WAITER · idempotente
--   get_bill(bill)                           OWNER, ADMIN, WAITER
--   set_bill_split(bill, mode, parts)        OWNER, ADMIN, WAITER
--   list_open_bills(restaurant)              OWNER, ADMIN, WAITER
--   apply_bill_discount(...)                 OWNER, ADMIN; WAITER hasta el tope
--   remove_bill_discount(discount, reason)   OWNER, ADMIN
--   record_payment(...)                      OWNER, ADMIN, WAITER
--   void_payment(payment, reason)            OWNER, ADMIN (caja del pago abierta)
--   close_bill(bill)                         OWNER, ADMIN, WAITER
--   void_bill(bill, reason)                  OWNER, ADMIN (sin pagos)
--
-- Candados: lock_bill() (mesa -> cuenta) antes de cualquier otra cosa.
-- ---------------------------------------------------------------------------

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
    or public.user_has_restaurant_role(v_session.restaurant_id, 'WAITER')
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

revoke all on function public.open_bill(uuid) from public;
revoke execute on function public.open_bill(uuid) from anon;
grant execute on function public.open_bill(uuid) to authenticated, service_role;


create or replace function public.get_bill(p_bill_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select restaurant_id into v_restaurant_id from public.bills where id = p_bill_id;

  if v_restaurant_id is null then
    raise exception 'Cuenta no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado';
  end if;

  return public.bill_json(p_bill_id);
end;
$$;

revoke all on function public.get_bill(uuid) from public;
revoke execute on function public.get_bill(uuid) from anon;
grant execute on function public.get_bill(uuid) to authenticated, service_role;


create or replace function public.set_bill_split(
  p_bill_id uuid,
  p_mode public.bill_split_mode,
  p_parts integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill  public.bills%rowtype;
  v_parts integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  v_bill := public.lock_bill(p_bill_id);

  if not (
    public.user_has_restaurant_role(v_bill.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_bill.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_bill.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado';
  end if;

  if v_bill.status <> 'OPEN' then
    raise exception 'Solo se puede dividir una cuenta abierta';
  end if;

  if p_mode is null then
    raise exception 'Modo de división inválido';
  end if;

  if p_mode = 'EQUAL' then
    v_parts := coalesce(p_parts, 0);
    if v_parts < 2 or v_parts > 50 then
      raise exception 'Las partes iguales van de 2 a 50';
    end if;
  else
    v_parts := 1;
  end if;

  update public.bills
  set split_mode = p_mode,
      split_parts = v_parts
  where id = v_bill.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'SET_BILL_SPLIT', 'BILL', v_bill.id,
    jsonb_build_object('mode', p_mode, 'parts', v_parts)
  );

  return public.bill_json(v_bill.id);
end;
$$;

revoke all on function public.set_bill_split(uuid, public.bill_split_mode, integer) from public;
revoke execute on function public.set_bill_split(uuid, public.bill_split_mode, integer) from anon;
grant execute on function public.set_bill_split(uuid, public.bill_split_mode, integer) to authenticated, service_role;


create or replace function public.list_open_bills(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(p_restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',               b.id,
        'bill_number',      b.bill_number,
        'table_id',         b.table_id,
        'table_number',     t.number,
        'table_name',       t.name,
        'table_session_id', b.table_session_id,
        'session_status',   ts.status,
        'status',           b.status,
        'total',            b.total,
        'paid_total',       b.paid_total,
        'balance',          b.balance,
        'split_mode',       b.split_mode,
        'split_parts',      b.split_parts,
        'opened_at',        b.opened_at,
        'active_orders', (
          select count(*) from public.orders o
          where o.table_session_id = b.table_session_id
            and o.status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
        )
      )
      order by b.opened_at
    )
    from public.bills b
    join public.tables t on t.id = b.table_id
    join public.table_sessions ts on ts.id = b.table_session_id
    where b.restaurant_id = p_restaurant_id
      and b.status in ('OPEN', 'PAID')
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_open_bills(uuid) from public;
revoke execute on function public.list_open_bills(uuid) from anon;
grant execute on function public.list_open_bills(uuid) to authenticated, service_role;


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

  if not (v_is_admin or public.user_has_restaurant_role(v_bill.restaurant_id, 'WAITER')) then
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

revoke all on function public.apply_bill_discount(uuid, public.discount_kind, numeric, text, uuid) from public;
revoke execute on function public.apply_bill_discount(uuid, public.discount_kind, numeric, text, uuid) from anon;
grant execute on function public.apply_bill_discount(uuid, public.discount_kind, numeric, text, uuid) to authenticated, service_role;


create or replace function public.remove_bill_discount(
  p_discount_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill_id  uuid;
  v_bill     public.bills%rowtype;
  v_discount public.bill_discounts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select bill_id into v_bill_id from public.bill_discounts where id = p_discount_id;
  if v_bill_id is null then
    raise exception 'Descuento no encontrado';
  end if;

  v_bill := public.lock_bill(v_bill_id);

  if not (
    public.user_has_restaurant_role(v_bill.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_bill.restaurant_id, 'ADMIN')
  ) then
    raise exception 'Solo el dueño o un administrador quitan descuentos';
  end if;

  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'La cuenta ya está cerrada o anulada';
  end if;

  select * into v_discount from public.bill_discounts where id = p_discount_id for update;

  if v_discount.removed_at is not null then
    raise exception 'El descuento ya fue quitado';
  end if;

  update public.bill_discounts
  set removed_by = auth.uid(),
      removed_at = now(),
      removed_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_discount_id;

  perform public.recompute_bill(v_bill.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'REMOVE_DISCOUNT', 'BILL', v_bill.id,
    jsonb_build_object(
      'discount_id', p_discount_id, 'amount', v_discount.amount,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  return public.bill_json(v_bill.id);
end;
$$;

revoke all on function public.remove_bill_discount(uuid, text) from public;
revoke execute on function public.remove_bill_discount(uuid, text) from anon;
grant execute on function public.remove_bill_discount(uuid, text) to authenticated, service_role;


-- p_items (solo para dividir por ítems): [{"order_item_id": uuid, "quantity": int}, ...]
-- El monto lo calcula el front; aquí se valida que no se pague más cantidad
-- de un ítem de la que tiene.
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
    or public.user_has_restaurant_role(v_restaurant_id, 'WAITER')
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

revoke all on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) from public;
revoke execute on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) from anon;
grant execute on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) to authenticated, service_role;


-- Anular un pago solo mientras su caja siga abierta y la cuenta no esté
-- cerrada. Después, la corrección es un cash_movement OUT con motivo REFUND.
create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill_id uuid;
  v_bill    public.bills%rowtype;
  v_payment public.payments%rowtype;
  v_cash_status public.cash_session_status;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select bill_id into v_bill_id from public.payments where id = p_payment_id;
  if v_bill_id is null then
    raise exception 'Pago no encontrado';
  end if;

  v_bill := public.lock_bill(v_bill_id);

  if not (
    public.user_has_restaurant_role(v_bill.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_bill.restaurant_id, 'ADMIN')
  ) then
    raise exception 'Solo el dueño o un administrador anulan pagos';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe el motivo de la anulación (mínimo 3 caracteres)';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;

  if v_payment.status <> 'COMPLETED' then
    raise exception 'El pago ya está anulado';
  end if;

  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'La cuenta ya está cerrada: registra la devolución como salida de caja';
  end if;

  select status into v_cash_status
  from public.cash_sessions
  where id = v_payment.cash_session_id
  for share;

  if v_cash_status <> 'OPEN' then
    raise exception 'La caja de este pago ya se cerró: registra la devolución como salida de caja';
  end if;

  update public.payments
  set status = 'VOIDED',
      voided_by = auth.uid(),
      voided_at = now(),
      void_reason = btrim(p_reason)
  where id = p_payment_id;

  perform public.recompute_bill(v_bill.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'VOID_PAYMENT', 'PAYMENT', p_payment_id,
    jsonb_build_object(
      'bill_id', v_bill.id, 'method', v_payment.method, 'amount', v_payment.amount,
      'tip_amount', v_payment.tip_amount, 'reason', btrim(p_reason)
    )
  );

  return public.bill_json(v_bill.id);
end;
$$;

revoke all on function public.void_payment(uuid, text) from public;
revoke execute on function public.void_payment(uuid, text) from anon;
grant execute on function public.void_payment(uuid, text) to authenticated, service_role;


-- Para cuando se pagó todo antes de que salieran los pedidos (cuenta PAID
-- con pedidos en curso). finalize_bill valida saldo y pedidos, y audita.
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
    or public.user_has_restaurant_role(v_bill.restaurant_id, 'WAITER')
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

revoke all on function public.close_bill(uuid) from public;
revoke execute on function public.close_bill(uuid) from anon;
grant execute on function public.close_bill(uuid) to authenticated, service_role;


-- Solo sin pagos vigentes. Una cortesía NO es anular: es un descuento del
-- 100% con motivo (queda en reportes de descuentos).
create or replace function public.void_bill(p_bill_id uuid, p_reason text)
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
    raise exception 'Solo el dueño o un administrador anulan cuentas';
  end if;

  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'La cuenta ya está cerrada o anulada';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escribe el motivo de la anulación (mínimo 3 caracteres)';
  end if;

  if exists (
    select 1 from public.payments
    where bill_id = v_bill.id and status = 'COMPLETED'
  ) then
    raise exception 'La cuenta tiene pagos: anúlalos primero';
  end if;

  -- balance/total no cambian; VOID no exige saldo 0 (bills_settled_check).
  update public.bills
  set status = 'VOID',
      voided_by = auth.uid(),
      voided_at = now(),
      void_reason = btrim(p_reason)
  where id = v_bill.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'VOID_BILL', 'BILL', v_bill.id,
    jsonb_build_object('bill_number', v_bill.bill_number, 'total', v_bill.total, 'reason', btrim(p_reason))
  );

  perform public.refresh_table_status(v_bill.table_id);

  return public.bill_json(v_bill.id);
end;
$$;

revoke all on function public.void_bill(uuid, text) from public;
revoke execute on function public.void_bill(uuid, text) from anon;
grant execute on function public.void_bill(uuid, text) to authenticated, service_role;
