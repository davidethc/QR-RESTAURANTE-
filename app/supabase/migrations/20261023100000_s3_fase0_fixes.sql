-- ---------------------------------------------------------------------------
-- S3 · Fase 0 · Pendientes de la tanda 2 (EXPAND; firmas compatibles).
--   a) cancel_counter_sale marca orders.cancelled/cancel_reason/cancelled_by.
--   b) session_place_label: "Para comer aquí #N" / "Para llevar #N" /
--      "Domicilio #N [· proveedor]" según orders.service_type; lo usan
--      bill_json y list_open_bills (place_label de 4 args queda igual).
--   c) bill_json: por línea variant_name y options[] (name, value_name, qty,
--      price_modifier).
--   d) PII: authenticated pierde SELECT sobre orders.customer_phone y
--      orders.delivery_address (grant por columna del resto). Se leen con
--      get_order_contact(p_order_id). Columnas futuras de orders requieren
--      su propio GRANT SELECT (columna) a authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.session_place_label(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when t.kind <> 'COUNTER' then 'Mesa ' || t.number::text
    else
      case o.service_type
        when 'delivery' then 'Domicilio'
        when 'dine_in_no_table' then 'Para comer aquí'
        else 'Para llevar'
      end
      || ' #' || coalesce(ts.counter_number::text, '?')
      || case when o.service_type = 'delivery' then
           coalesce(' · ' || case o.delivery_provider
             when 'uber_eats' then 'Uber Eats'
             when 'rappi' then 'Rappi'
             when 'didi_food' then 'DiDi Food'
             else null end, '')
         else '' end
      || coalesce(' · ' || nullif(btrim(ts.customer_label), ''), '')
  end
  from public.table_sessions ts
  join public.tables t on t.id = ts.table_id
  left join lateral (
    select ord.service_type, ord.delivery_provider
    from public.orders ord
    where ord.table_session_id = ts.id
    order by ord.created_at
    limit 1
  ) o on true
  where ts.id = p_session_id;
$$;

revoke all on function public.session_place_label(uuid) from public, anon;
grant execute on function public.session_place_label(uuid) to authenticated, service_role;


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
        rejection_reason = v_reason,
        cancelled = true,            -- S3-F0
        cancel_reason = v_reason,    -- S3-F0
        cancelled_by = auth.uid()    -- S3-F0
    where table_session_id = v_bill.table_session_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_cancelled from c;

  -- S3-F0: igual que cancel_order_with_reason, líneas y comandas pendientes.
  update public.order_items set cancelled = true
  where order_id = any(v_cancelled) and not cancelled;
  update public.tickets
  set kitchen_status = 'completed', completed_at = now(), is_new = false
  where order_id = any(v_cancelled) and kitchen_status = 'pending';

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
    -- C3
    'table_kind',       v_table.kind,
    'counter_number',   v_session.counter_number,
    'customer_label',   v_session.customer_label,
    'place_label',      public.session_place_label(v_bill.table_session_id),  -- S3-F0
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
                'variant_name', oi.variant_name,  -- S3-F0
                'options', coalesce((  -- S3-F0
                  select jsonb_agg(
                    jsonb_build_object(
                      'name',           oo.option_name,
                      'value_name',     oo.value_name,
                      'qty',            oo.qty,
                      'price_modifier', oo.price_modifier
                    )
                    order by oo.created_at, oo.id
                  )
                  from public.order_item_options oo
                  where oo.order_item_id = oi.id
                ), '[]'::jsonb),
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
    select jsonb_agg(e.item order by e.opened_at)
    from (
      select
        b.opened_at,
        jsonb_build_object(
          'id',               b.id,
          'bill_number',      b.bill_number,
          'table_id',         b.table_id,
          'table_number',     t.number,
          'table_name',       t.name,
          -- C3
          'table_kind',       t.kind,
          'counter_number',   ts.counter_number,
          'customer_label',   ts.customer_label,
          'place_label',      public.session_place_label(b.table_session_id),  -- S3-F0
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
          ),
          'has_bill',         true
        ) as item
      from public.bills b
      join public.tables t on t.id = b.table_id
      join public.table_sessions ts on ts.id = b.table_session_id
      where b.restaurant_id = p_restaurant_id
        and b.status in ('OPEN', 'PAID')

      union all

      select
        ts.started_at,
        jsonb_build_object(
          'id',               null,
          'bill_number',      null,
          'table_id',         ts.table_id,
          'table_number',     t.number,
          'table_name',       t.name,
          'table_kind',       t.kind,
          'counter_number',   ts.counter_number,
          'customer_label',   ts.customer_label,
          'place_label',      public.place_label(t.kind, t.number, ts.counter_number, ts.customer_label),
          'table_session_id', ts.id,
          'session_status',   ts.status,
          'status',           'OPEN',
          'total',            s.total,
          'paid_total',       0,
          'balance',          s.total,
          'split_mode',       'NONE',
          'split_parts',      1,
          'opened_at',        ts.started_at,
          'active_orders',    s.active_orders,
          'has_bill',         false
        )
      from public.table_sessions ts
      join public.tables t on t.id = ts.table_id
      cross join lateral (
        select
          round(coalesce(sum(o.total) filter (where o.status not in ('REJECTED', 'CANCELLED')), 0), 2) as total,
          count(*) filter (where o.status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')) as active_orders
        from public.orders o
        where o.table_session_id = ts.id
      ) s
      where ts.restaurant_id = p_restaurant_id
        and ts.status = 'ACTIVE'
        and ts.table_kind = 'TABLE'
        and not exists (
          select 1 from public.bills b
          where b.table_session_id = ts.id
            and b.status <> 'VOID'
        )
        and public.table_session_has_unpaid_consumption(ts.id)
    ) e
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.bill_json(uuid) from public, anon, authenticated;
grant execute on function public.bill_json(uuid) to service_role;
revoke all on function public.list_open_bills(uuid) from public, anon;
grant execute on function public.list_open_bills(uuid) to authenticated, service_role;
revoke all on function public.cancel_counter_sale(uuid, text) from public, anon;
grant execute on function public.cancel_counter_sale(uuid, text) to authenticated, service_role;


-- d) PII --------------------------------------------------------------------
create or replace function public.get_order_contact(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rid uuid;
  v_phone text;
  v_addr jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select restaurant_id, customer_phone, delivery_address
    into v_rid, v_phone, v_addr
  from public.orders where id = p_order_id;

  if v_rid is null or not (
    public.user_has_restaurant_role(v_rid, 'OWNER')
    or public.user_has_restaurant_role(v_rid, 'ADMIN')
    or public.user_has_restaurant_role(v_rid, 'WAITER')
    or exists (
      select 1 from public.restaurant_members rm
      where rm.restaurant_id = v_rid and rm.user_id = auth.uid()
        and rm.status = 'ACTIVE' and 'CASHIER' = any(rm.roles)
    )
  ) then
    raise exception 'No autorizado';
  end if;

  return jsonb_build_object('customer_phone', v_phone, 'delivery_address', v_addr);
end;
$$;

revoke all on function public.get_order_contact(uuid) from public, anon;
grant execute on function public.get_order_contact(uuid) to authenticated, service_role;

revoke select on public.orders from authenticated;
grant select (accepted_at, accepted_by, cancel_reason, cancelled, cancelled_by, client_request_id, created_at, customer_name, delivered_at, delivery_provider, external_order_id, folio, general_comment, id, notes, order_number, pays_with_amount, preferred_payment_method, preparing_at, ready_at, rejection_reason, restaurant_id, service_type, shipping_cost, short_code, status, status_review, subtotal, table_id, table_session_id, total, updated_at) on public.orders to authenticated;
