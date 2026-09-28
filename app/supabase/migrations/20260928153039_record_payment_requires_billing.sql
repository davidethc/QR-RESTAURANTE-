-- ---------------------------------------------------------------------------
-- Dinero (3/3) · record_payment revalida billing_enabled.
--
-- Igual que add_items_to_bill y open_bill: si el dueño apaga el cobro, no se
-- registran pagos nuevos aunque haya una hoja de cobro abierta en otra
-- pestaña. El chequeo va después del rol y antes del candado.
--
-- Resto del cuerpo idéntico a la versión vigente en producción.
-- ---------------------------------------------------------------------------

create or replace function public.record_payment(
  p_bill_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_idempotency_key uuid,
  p_tip_amount numeric default 0,
  p_tendered_amount numeric default null::numeric,
  p_reference text default null::text,
  p_card_type text default null::text,
  p_items jsonb default null::jsonb,
  p_cash_session_id uuid default null::uuid,
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

  if not coalesce((select billing_enabled from public.restaurants where id = v_restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
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

revoke all on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) from public, anon;
grant execute on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) to authenticated, service_role;
