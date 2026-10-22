-- ---------------------------------------------------------------------------
-- M07 · Cobro · EXPAND (dinero: requiere revisión de security-reviewer).
-- Depende de 20261022040000 (insert_order_lines) y del módulo de caja existente.
--
-- Hallazgo de auditoría (M07-T01): payments YA tiene tendered_amount y
-- change_amount (efectivo recibido y cambio, con CHECK payments_cash_check).
-- NO se crean cash_received / change_given: serían duplicados. Faltaba:
--   · payments.number         consecutivo por cuenta (#1, #2...), asignado
--                             bajo lock_bill; único por (bill_id, number).
--   · payments.cash_register_id  caja donde se procesó (de la sesión de caja).
-- Ambas nullable y rellenadas para los pagos existentes.
--
-- Cambios de comportamiento (firmas intactas):
--   record_payment       + number y cash_register_id; rechaza cuenta VOID
--                          ("anulada") y cuenta sin pedidos vivos ("cancelado");
--                          devuelve payment_number. Resto idéntico (roles
--                          OWNER/ADMIN, billing_enabled, idempotencia, vuelto).
--   record_payments (nueva) cobro con VARIOS métodos en una transacción:
--                          envuelve record_payment (mismas validaciones,
--                          auditoría y candados). Idempotente por p_request_id.
--   void_payment_with_refund (nueva) anula con void_payment y, si el
--                          reembolso usa otro método, deja un evento
--                          VOID_PAYMENT con metadata.refund_method_changed
--                          (aparece en security_events como "refund").
--   create_counter_sale / add_items_to_bill  ahora usan build_order_lines +
--                          insert_order_lines: variantes, personalizaciones y
--                          precio del servidor. CAMBIOS: máx. 50 líneas y
--                          cantidad 1-99 (antes 100 y 999); un producto sin
--                          variantes ya no se vende (igual que create_staff_order).
--
-- Rollback: reaplicar 20260928153039 (record_payment), 20260927205720
-- (create_counter_sale), 20260928135237 (add_items_to_bill); drop de
-- record_payments y void_payment_with_refund; las columnas son inofensivas.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.payments
  add column if not exists number integer,
  add column if not exists cash_register_id uuid references public.cash_registers (id) on delete restrict;

alter table public.payments
  drop constraint if exists payments_number_positive;
alter table public.payments
  add constraint payments_number_positive check (number is null or number >= 1);

update public.payments p
set number = x.rn
from (
  select id, row_number() over (partition by bill_id order by received_at, created_at, id) as rn
  from public.payments
) x
where p.id = x.id and p.number is null;

update public.payments p
set cash_register_id = cs.register_id
from public.cash_sessions cs
where cs.id = p.cash_session_id and p.cash_register_id is null;

create unique index if not exists payments_bill_number_uq
  on public.payments (bill_id, number) where number is not null;
create index if not exists payments_cash_register_idx
  on public.payments (cash_register_id) where cash_register_id is not null;
create index if not exists payments_session_received_idx
  on public.payments (cash_session_id, received_at);

comment on column public.payments.number is 'M07: consecutivo del pago dentro de su cuenta (#1, #2...). Los anulados conservan su número.';
comment on column public.payments.cash_register_id is 'M07: caja de la sesión donde se procesó el pago.';

-- ======================= record_payment (extendida) =========================
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
  v_number    integer;
  v_register  uuid;
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
      'payment_number', v_existing.number,
      'bill', public.bill_json(p_bill_id)
    );
  end if;

  if v_bill.status = 'VOID' then
    raise exception 'La cuenta está anulada y no se puede cobrar';
  end if;

  if v_bill.status <> 'OPEN' then
    raise exception 'La cuenta no tiene saldo por cobrar (estado: %)', v_bill.status;
  end if;

  -- 3. Recalcular con lo último (pedidos/descuentos).
  v_bill := public.recompute_bill(v_bill.id);

  -- S2: un pedido cancelado no se cobra por ningún camino.
  if not exists (
    select 1 from public.orders
    where table_session_id = v_bill.table_session_id
      and status not in ('REJECTED', 'CANCELLED')
      and not cancelled
  ) then
    raise exception 'El pedido está cancelado y no se puede cobrar';
  end if;

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

  -- 7. Pago e ítems. Número consecutivo por cuenta (bajo lock_bill) y caja.
  select coalesce(max(number), 0) + 1 into v_number
  from public.payments where bill_id = v_bill.id;

  select register_id into v_register from public.cash_sessions where id = v_session;

  insert into public.payments (
    restaurant_id, bill_id, cash_session_id, method, amount, tip_amount,
    tendered_amount, change_amount, reference, card_type, received_by,
    idempotency_key, number, cash_register_id
  )
  values (
    v_bill.restaurant_id, v_bill.id, v_session, p_method, v_amount, v_tip,
    v_tendered, v_change,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_card_type, '')), ''),
    auth.uid(), p_idempotency_key, v_number, v_register
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
      'cash_session_id', v_session, 'balance_after', v_bill.balance,
      'payment_number', v_number, 'cash_register_id', v_register
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
    'payment_number', v_number,
    'replayed', false,
    'closed', v_closed,
    'bill', public.bill_json(v_bill.id)
  );
end;
$$;

revoke all on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) from public, anon;
grant execute on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) to authenticated, service_role;

-- ======================= record_payments (varios métodos) ===================
-- p_payments: [{"method":"CASH|CARD|TRANSFER","received":n,"reference":t?,"card_type":t?}]
--   p_amount = monto a cobrar ahora (<= saldo). Tarjeta/transferencia se
--   aplican por su "received" exacto; el efectivo cubre el resto y "received"
--   puede exceder (cambio = recibido - lo que le toca, nunca negativo).
--   La suma recibida debe cubrir p_amount; si no: error con lo que falta.
--   La propina (p_tip_amount) va con el primer método de la lista; si es
--   efectivo, lo recibido debe cubrir también la propina.
--   Idempotencia: p_request_id genera una clave por método; un reintento
--   devuelve los mismos pagos (replayed = true).
create or replace function public.record_payments(
  p_bill_id uuid,
  p_amount numeric,
  p_payments jsonb,
  p_request_id uuid,
  p_tip_amount numeric default 0,
  p_items jsonb default null,
  p_cash_session_id uuid default null,
  p_auto_close boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_restaurant_id uuid;
  v_n         integer;
  v_i         integer := 0;
  v_e         jsonb;
  v_method    public.payment_method;
  v_methods   public.payment_method[] := '{}';
  v_received  numeric(10,2);
  v_due       numeric(10,2) := round(coalesce(p_amount, 0), 2);
  v_tip       numeric(10,2) := round(coalesce(p_tip_amount, 0), 2);
  v_noncash   numeric(10,2) := 0;
  v_cash_rec  numeric(10,2);
  v_cash_pos  integer;
  v_cash_part numeric(10,2);
  v_need      numeric(10,2);
  v_key       uuid;
  v_res       jsonb;
  v_last      jsonb;
  v_ids       jsonb := '[]'::jsonb;
  v_change    numeric(10,2) := 0;
  v_amount    numeric(10,2);
  v_tipi      numeric(10,2);
  v_tend      numeric(10,2);
  v_replayed  boolean := false;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_request_id is null then
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

  if p_payments is null or jsonb_typeof(p_payments) <> 'array'
     or jsonb_array_length(p_payments) not between 1 and 3 then
    raise exception 'Indica de 1 a 3 métodos de pago';
  end if;
  if v_due <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;
  if v_tip < 0 then
    raise exception 'La propina no puede ser negativa';
  end if;

  v_n := jsonb_array_length(p_payments);

  -- Primera pasada: forma, métodos únicos, sumas.
  for v_e in select * from jsonb_array_elements(p_payments) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'Método de pago inválido';
    end if;
    begin
      v_method   := (v_e ->> 'method')::public.payment_method;
      v_received := round((v_e ->> 'received')::numeric, 2);
    exception when others then
      raise exception 'Método de pago inválido';
    end;
    if v_method is null or v_method not in ('CASH', 'CARD', 'TRANSFER') then
      raise exception 'Método de pago inválido (usa efectivo, tarjeta o transferencia)';
    end if;
    if v_method = any (v_methods) then
      raise exception 'Cada método de pago se indica una sola vez';
    end if;
    v_methods := v_methods || v_method;
    if v_received is null or v_received <= 0 then
      raise exception 'El monto recibido de cada método debe ser mayor que cero';
    end if;
    if v_method = 'CASH' then
      v_cash_rec := v_received;
      v_cash_pos := v_i;
    else
      v_noncash := v_noncash + v_received;
    end if;
  end loop;

  if v_noncash > v_due then
    raise exception 'Tarjeta y transferencia (%) superan el monto a cobrar (%)', v_noncash, v_due;
  end if;

  v_cash_part := v_due - v_noncash;  -- lo que debe cubrir el efectivo
  if v_cash_rec is null then
    if v_cash_part > 0 then
      raise exception 'Faltan % para cubrir el monto a cobrar', v_cash_part;
    end if;
  else
    if v_cash_part <= 0 then
      raise exception 'Tarjeta y transferencia ya cubren el monto: quita el efectivo';
    end if;
    -- La propina va con el primer método; si es el efectivo, también debe cubrirla.
    v_need := v_cash_part;
    if v_cash_pos = 1 then
      v_need := v_need + v_tip;
    end if;
    if v_cash_rec < v_need then
      raise exception 'Faltan % para cubrir el monto a cobrar', v_need - v_cash_rec;
    end if;
  end if;

  -- Segunda pasada: un record_payment por método (misma transacción).
  v_i := 0;
  for v_e in select * from jsonb_array_elements(p_payments) loop
    v_i := v_i + 1;
    v_method   := (v_e ->> 'method')::public.payment_method;
    v_received := round((v_e ->> 'received')::numeric, 2);
    v_key      := md5(p_request_id::text || ':' || v_method::text)::uuid;
    v_tipi     := case when v_i = 1 then v_tip else 0 end;
    if v_method = 'CASH' then
      v_amount := v_cash_part;
      v_tend   := v_received;
    else
      v_amount := v_received;
      v_tend   := null;
    end if;

    v_res := public.record_payment(
      p_bill_id, v_method, v_amount, v_key, v_tipi, v_tend,
      v_e ->> 'reference', v_e ->> 'card_type',
      case when v_i = 1 then p_items else null end,
      p_cash_session_id,
      coalesce(p_auto_close, true) and v_i = v_n
    );
    v_last := v_res;
    if (v_res ->> 'replayed')::boolean then v_replayed := true; end if;
    v_ids := v_ids || jsonb_build_array(jsonb_build_object(
      'payment_id', v_res ->> 'payment_id', 'method', v_method,
      'payment_number', (v_res ->> 'payment_number')::integer));
    v_change := v_change + coalesce((v_res ->> 'change_amount')::numeric, 0);
  end loop;

  return jsonb_build_object(
    'payments', v_ids,
    'change_amount', v_change,
    'replayed', v_replayed,
    'closed', coalesce((v_last ->> 'closed')::boolean, false),
    'bill', v_last -> 'bill'
  );
end;
$$;

revoke all on function public.record_payments(uuid, numeric, jsonb, uuid, numeric, jsonb, uuid, boolean) from public, anon;
grant execute on function public.record_payments(uuid, numeric, jsonb, uuid, numeric, jsonb, uuid, boolean) to authenticated, service_role;

-- ======================= reembolso con método distinto ======================
-- void_payment no cambia. Esta RPC la envuelve: p_refund_method es el método
-- con que realmente se devuelve el dinero. Si difiere del cobrado, deja un
-- evento de seguridad (VOID_PAYMENT con refund_method_changed = true, visible
-- en security_events como "refund"; sin 'amount' para no duplicar el monto).
create or replace function public.void_payment_with_refund(
  p_payment_id uuid,
  p_reason text,
  p_refund_method public.payment_method default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_pay    public.payments%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if v_pay.id is null then
    raise exception 'Pago no encontrado';
  end if;

  -- void_payment valida rol (OWNER/ADMIN), motivo, caja y candados.
  v_result := public.void_payment(p_payment_id, p_reason);

  if p_refund_method is not null and p_refund_method is distinct from v_pay.method then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_pay.restaurant_id, auth.uid(), 'VOID_PAYMENT', 'PAYMENT', p_payment_id,
      jsonb_build_object(
        'bill_id', v_pay.bill_id,
        'refund_method_changed', true,
        'original_method', v_pay.method,
        'refund_method', p_refund_method,
        'refund_amount', v_pay.amount,
        'reason', 'Reembolso con método distinto al cobrado: ' || btrim(p_reason)));
  end if;

  return v_result;
end;
$$;

revoke all on function public.void_payment_with_refund(uuid, text, public.payment_method) from public, anon;
grant execute on function public.void_payment_with_refund(uuid, text, public.payment_method) to authenticated, service_role;

-- ======================= create_counter_sale con variantes ==================
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
  v_built         jsonb;
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

  v_label := nullif(btrim(coalesce(p_customer_label, '')), '');
  if length(v_label) > 40 then
    raise exception 'El nombre de la venta admite hasta 40 caracteres';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if length(v_notes) > 500 then
    raise exception 'Las notas admiten hasta 500 caracteres';
  end if;

  -- S2: precios, variantes y personalizaciones del servidor (build_order_lines).
  -- Máximo 50 líneas y cantidad 1-99 por línea (antes 100 y 999).
  v_built    := public.build_order_lines(v_restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;

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

  perform public.insert_order_lines(v_order_id, null, v_built -> 'lines');

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

-- ======================= add_items_to_bill con variantes ====================
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
  v_built         jsonb;
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

  -- 7. Precios, variantes y personalizaciones del servidor (S2: build_order_lines).
  v_built    := public.build_order_lines(v_restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;
  v_lines    := v_built -> 'lines';

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

  -- 9. Ítems y personalizaciones (insert_order_lines; el trigger asigna la comanda).
  perform public.insert_order_lines(v_order_id, null, v_lines);

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

revoke all on function public.add_items_to_bill(uuid, jsonb, uuid, boolean) from public, anon;
grant execute on function public.add_items_to_bill(uuid, jsonb, uuid, boolean) to authenticated, service_role;
