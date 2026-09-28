-- ---------------------------------------------------------------------------
-- Módulo 1 · M8 · Funciones internas de cobro (sin grants a roles de API).
--
-- Depende de M3 (refresh_table_status), M4 (audit_action CLOSE_BILL),
-- M6 y M7.
--
--   recompute_bill(bill)           recalcula montos y estado OPEN <-> PAID.
--                                  El llamador ya tiene la cuenta bloqueada.
--   resolve_open_cash_session(r,s) caja abierta donde cae un cobro (FOR SHARE,
--                                  así el cierre de caja espera al cobro).
--   finalize_bill(bill, user)      CLOSED + cierra sesión + llamadas ATTENDED.
--   bill_json(bill)                forma única del JSON de una cuenta, la
--                                  usan open_bill/get_bill/record_payment...
--   Triggers: orders_recompute_bill y bills_notify_session.
--
-- Orden de candados (evita deadlocks): tables -> bills -> cash_sessions ->
-- table_sessions / waiter_calls. Es el orden que ya usan create_staff_order
-- y resolve_table_qr (mesa primero). Por eso toda RPC de cobro entra por
-- lock_bill(), que bloquea la mesa antes que la cuenta, y el trigger de
-- pedidos hace lo mismo antes de recalcular.
-- ---------------------------------------------------------------------------

-- Interna: bloquea mesa y luego cuenta, en ese orden, y devuelve la cuenta.
create or replace function public.lock_bill(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_table_id uuid;
  v_bill public.bills%rowtype;
begin
  select table_id into v_table_id from public.bills where id = p_bill_id;

  if v_table_id is null then
    raise exception 'Cuenta no encontrada';
  end if;

  perform 1 from public.tables where id = v_table_id for update;

  select * into v_bill from public.bills where id = p_bill_id for update;

  return v_bill;
end;
$$;

revoke all on function public.lock_bill(uuid) from public, anon, authenticated;


create or replace function public.recompute_bill(p_bill_id uuid)
returns public.bills
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill      public.bills%rowtype;
  v_subtotal  numeric(10,2);
  v_discount  numeric(10,2);
  v_paid      numeric(10,2);
  v_tip       numeric(10,2);
  v_total     numeric(10,2);
  v_balance   numeric(10,2);
  v_status    public.bill_status;
begin
  select * into v_bill from public.bills where id = p_bill_id;

  if not found then
    raise exception 'Cuenta no encontrada';
  end if;

  -- CLOSED y VOID son estados finales: sus montos quedan congelados.
  if v_bill.status in ('CLOSED', 'VOID') then
    return v_bill;
  end if;

  select round(coalesce(sum(o.total), 0), 2)
  into v_subtotal
  from public.orders o
  where o.table_session_id = v_bill.table_session_id
    and o.status not in ('REJECTED', 'CANCELLED');

  -- Monto de cada descuento activo sobre su base bruta:
  --   · de ítem: subtotal del ítem (0 si su pedido fue rechazado/cancelado)
  --   · de cuenta: subtotal de la cuenta
  -- PERCENT se recalcula siempre (un pedido nuevo cambia la base).
  -- FIXED nunca supera su base.
  update public.bill_discounts d
  set amount = x.new_amount
  from (
    select
      d2.id,
      case
        when d2.kind = 'PERCENT' then round(b.base * d2.value / 100, 2)
        else least(d2.value, b.base)
      end as new_amount
    from public.bill_discounts d2
    left join public.order_items oi on oi.id = d2.order_item_id
    left join public.orders o on o.id = oi.order_id
    cross join lateral (
      select case
        when d2.order_item_id is null then v_subtotal
        when o.id is null or o.status in ('REJECTED', 'CANCELLED') then 0::numeric
        else oi.subtotal
      end as base
    ) b
    where d2.bill_id = p_bill_id
      and d2.removed_at is null
  ) x
  where d.id = x.id
    and d.amount is distinct from x.new_amount;

  -- Los descuentos nunca llevan el total por debajo de cero.
  select least(round(coalesce(sum(amount), 0), 2), v_subtotal)
  into v_discount
  from public.bill_discounts
  where bill_id = p_bill_id
    and removed_at is null;

  select round(coalesce(sum(amount), 0), 2), round(coalesce(sum(tip_amount), 0), 2)
  into v_paid, v_tip
  from public.payments
  where bill_id = p_bill_id
    and status = 'COMPLETED';

  v_total   := v_subtotal - v_discount;
  v_balance := v_total - v_paid;

  if v_balance < 0 then
    raise exception 'La cuenta #% quedaría con saldo negativo (%): anula primero un pago',
      v_bill.bill_number, v_balance
      using errcode = 'P0001';
  end if;

  -- PAID = saldo 0 con algo que lo salde (pago o descuento). Una cuenta
  -- vacía (total 0 sin descuentos ni pagos) sigue OPEN; se anula con void_bill.
  if v_balance = 0 and (v_paid > 0 or v_discount > 0) then
    v_status := 'PAID';
  else
    v_status := 'OPEN';
  end if;

  update public.bills
  set subtotal       = v_subtotal,
      discount_total = v_discount,
      total          = v_total,
      paid_total     = v_paid,
      tip_total      = v_tip,
      balance        = v_balance,
      status         = v_status,
      paid_at        = case
                         when v_status = 'PAID' then coalesce(v_bill.paid_at, now())
                         else null
                       end
  where id = p_bill_id
  returning * into v_bill;

  return v_bill;
end;
$$;

revoke all on function public.recompute_bill(uuid) from public, anon, authenticated;


create or replace function public.resolve_open_cash_session(
  p_restaurant_id uuid,
  p_cash_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if p_cash_session_id is not null then
    select id into v_id
    from public.cash_sessions
    where id = p_cash_session_id
      and restaurant_id = p_restaurant_id
      and status = 'OPEN'
    for share;

    if v_id is null then
      raise exception 'La caja indicada no está abierta';
    end if;

    return v_id;
  end if;

  select count(*) into v_count
  from public.cash_sessions
  where restaurant_id = p_restaurant_id
    and status = 'OPEN';

  if v_count = 0 then
    raise exception 'Abre la caja antes de cobrar';
  elsif v_count > 1 then
    raise exception 'Hay varias cajas abiertas: elige en cuál registrar el cobro';
  end if;

  select id into v_id
  from public.cash_sessions
  where restaurant_id = p_restaurant_id
    and status = 'OPEN'
  for share;

  -- Se cerró entre el conteo y el candado.
  if v_id is null then
    raise exception 'Abre la caja antes de cobrar';
  end if;

  return v_id;
end;
$$;

revoke all on function public.resolve_open_cash_session(uuid, uuid) from public, anon, authenticated;


create or replace function public.finalize_bill(p_bill_id uuid, p_user_id uuid)
returns public.bills
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill
  from public.bills
  where id = p_bill_id
  for update;

  if not found then
    raise exception 'Cuenta no encontrada';
  end if;

  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'La cuenta ya está cerrada o anulada';
  end if;

  if v_bill.balance <> 0 then
    raise exception 'La cuenta tiene saldo pendiente (%)', v_bill.balance;
  end if;

  if exists (
    select 1 from public.orders
    where table_session_id = v_bill.table_session_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
  ) then
    raise exception 'Aún hay pedidos sin entregar en esta mesa';
  end if;

  update public.bills
  set status    = 'CLOSED',
      closed_by = p_user_id,
      closed_at = now(),
      paid_at   = coalesce(paid_at, now())
  where id = p_bill_id
  returning * into v_bill;

  -- Una sesión EXPIRED se queda EXPIRED (ya no está activa).
  update public.table_sessions
  set status = 'CLOSED',
      closed_at = coalesce(closed_at, now())
  where id = v_bill.table_session_id
    and status = 'ACTIVE';

  -- Llamadas abiertas de esta sesión (o sin sesión). No toca las de una
  -- sesión ACTIVE distinta: pueden ser clientes nuevos en la misma mesa.
  update public.waiter_calls wc
  set status = 'ATTENDED',
      handled_by = p_user_id,
      handled_at = now()
  where wc.table_id = v_bill.table_id
    and wc.status in ('PENDING', 'ACCEPTED')
    and (
      wc.table_session_id is null
      or wc.table_session_id = v_bill.table_session_id
      or not exists (
        select 1 from public.table_sessions ts
        where ts.id = wc.table_session_id
          and ts.status = 'ACTIVE'
      )
    );

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, p_user_id, 'CLOSE_BILL', 'BILL', v_bill.id,
    jsonb_build_object(
      'bill_number', v_bill.bill_number,
      'total', v_bill.total,
      'paid_total', v_bill.paid_total,
      'tip_total', v_bill.tip_total,
      'discount_total', v_bill.discount_total
    )
  );

  perform public.refresh_table_status(v_bill.table_id);

  return v_bill;
end;
$$;

revoke all on function public.finalize_bill(uuid, uuid) from public, anon, authenticated;


-- JSON completo de una cuenta. Lectura pura: no bloquea ni recalcula.
create or replace function public.bill_json(p_bill_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill        public.bills%rowtype;
  v_table       public.tables%rowtype;
  v_session     public.table_sessions%rowtype;
  v_share       numeric(10,2);
  v_next_share  numeric(10,2);
  v_active      integer;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'Cuenta no encontrada';
  end if;

  select * into v_table from public.tables where id = v_bill.table_id;
  select * into v_session from public.table_sessions where id = v_bill.table_session_id;

  select count(*) into v_active
  from public.orders
  where table_session_id = v_bill.table_session_id
    and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY');

  -- Partes iguales: cada parte = total/partes truncado al centavo; la
  -- última absorbe el residuo. Regla sin contar pagos: si después de pagar
  -- una parte quedaría menos de otra parte, la que toca es todo el saldo.
  -- 3 x 10.00 -> 3.33, 3.33, 3.34.
  if v_bill.split_mode = 'EQUAL' and v_bill.balance > 0 then
    v_share := trunc(v_bill.total / v_bill.split_parts, 2);
    if v_share <= 0 or v_bill.balance < 2 * v_share then
      v_next_share := v_bill.balance;
    else
      v_next_share := v_share;
    end if;
  end if;

  return jsonb_build_object(
    'id',               v_bill.id,
    'bill_number',      v_bill.bill_number,
    'restaurant_id',    v_bill.restaurant_id,
    'table_id',         v_bill.table_id,
    'table_number',     v_table.number,
    'table_name',       v_table.name,
    'table_session_id', v_bill.table_session_id,
    'session_status',   v_session.status,
    'status',           v_bill.status,
    'subtotal',         v_bill.subtotal,
    'discount_total',   v_bill.discount_total,
    'total',            v_bill.total,
    'paid_total',       v_bill.paid_total,
    'tip_total',        v_bill.tip_total,
    'balance',          v_bill.balance,
    'split_mode',       v_bill.split_mode,
    'split_parts',      v_bill.split_parts,
    'next_equal_share', v_next_share,
    'active_orders',    v_active,
    'can_close',        (v_bill.status = 'PAID' and v_active = 0),
    'opened_by',        v_bill.opened_by,
    'opened_at',        v_bill.opened_at,
    'paid_at',          v_bill.paid_at,
    'closed_by',        v_bill.closed_by,
    'closed_at',        v_bill.closed_at,
    'voided_at',        v_bill.voided_at,
    'void_reason',      v_bill.void_reason,
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',           o.id,
          'order_number', o.order_number,
          'status',       o.status,
          'total',        o.total,
          'created_at',   o.created_at,
          'billable',     o.status not in ('REJECTED', 'CANCELLED'),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id',           oi.id,
                'product_id',   oi.product_id,
                'product_name', oi.product_name,
                'quantity',     oi.quantity,
                'unit_price',   oi.unit_price,
                'subtotal',     oi.subtotal,
                'notes',        oi.notes
              )
              order by oi.created_at, oi.id
            )
            from public.order_items oi
            where oi.order_id = o.id
          ), '[]'::jsonb)
        )
        order by o.created_at, o.order_number
      )
      from public.orders o
      where o.table_session_id = v_bill.table_session_id
    ), '[]'::jsonb),
    'discounts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',            d.id,
          'order_item_id', d.order_item_id,
          'kind',          d.kind,
          'value',         d.value,
          'amount',        d.amount,
          'reason',        d.reason,
          'applied_by',    d.applied_by,
          'applied_at',    d.applied_at
        )
        order by d.applied_at
      )
      from public.bill_discounts d
      where d.bill_id = v_bill.id
        and d.removed_at is null
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',              p.id,
          'method',          p.method,
          'amount',          p.amount,
          'tip_amount',      p.tip_amount,
          'tendered_amount', p.tendered_amount,
          'change_amount',   p.change_amount,
          'reference',       p.reference,
          'card_type',       p.card_type,
          'status',          p.status,
          'received_by',     p.received_by,
          'received_at',     p.received_at,
          'voided_at',       p.voided_at,
          'void_reason',     p.void_reason,
          'cash_session_id', p.cash_session_id
        )
        order by p.received_at
      )
      from public.payments p
      where p.bill_id = v_bill.id
    ), '[]'::jsonb),
    'items_paid_qty', coalesce((
      select jsonb_object_agg(x.order_item_id, x.qty)
      from (
        select pi.order_item_id, sum(pi.quantity) as qty
        from public.payment_items pi
        join public.payments p on p.id = pi.payment_id
        where p.bill_id = v_bill.id
          and p.status = 'COMPLETED'
        group by pi.order_item_id
      ) x
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.bill_json(uuid) from public, anon, authenticated;


-- Un pedido nuevo, rechazado o con total distinto recalcula la cuenta
-- viva de su sesión. Si el rechazo dejaría saldo negativo, recompute_bill
-- lanza error y el cambio de estado del pedido se revierte: primero hay
-- que anular un pago (diseño, sección Internas).
create or replace function public.trg_orders_recompute_bill()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill_id uuid;
begin
  if new.table_session_id is null then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.total is not distinct from old.total
     and new.table_session_id is not distinct from old.table_session_id then
    return null;
  end if;

  -- Lectura sin candado: si no hay cuenta viva (restaurantes sin cobro),
  -- el trigger no bloquea nada.
  select id into v_bill_id
  from public.bills
  where table_session_id = new.table_session_id
    and status in ('OPEN', 'PAID');

  if v_bill_id is not null then
    perform public.lock_bill(v_bill_id);
    perform public.recompute_bill(v_bill_id);
  end if;

  return null;
end;
$$;

revoke all on function public.trg_orders_recompute_bill() from public, anon, authenticated;

create trigger orders_recompute_bill
after insert or update of status, total, table_session_id on public.orders
for each row execute function public.trg_orders_recompute_bill();


-- Reutiliza notify_table_session_change(): lee NEW.table_session_id, que
-- bills también tiene, y avisa al canal privado del cliente.
create trigger bills_notify_session
after insert or update on public.bills
for each row execute function public.notify_table_session_change();
