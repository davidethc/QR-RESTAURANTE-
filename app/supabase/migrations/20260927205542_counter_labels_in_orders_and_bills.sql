-- ---------------------------------------------------------------------------
-- Venta de mostrador · C3 · Etiqueta "Para llevar #N" en pedidos y cuentas.
--
-- Depende de C1. Solo se AGREGAN claves a los JSON (nada cambia de forma ni
-- de nombre), así que las pantallas actuales siguen funcionando:
--
--   table_kind      'TABLE' | 'COUNTER'
--   counter_number  N del día (null en mesas)
--   customer_label  nombre opcional de la venta (null en mesas)
--   place_label     texto listo para mostrar: "Mesa 4" o
--                   "Para llevar #12" / "Para llevar #12 · Ana"
--
-- get_staff_orders (pedidos y cocina), bill_json (hoja de cobro, ticket,
-- get_bill, record_payment...) y list_open_bills (caja) se redefinen
-- COMPLETAS desde la versión viva (2026-09-27); cambios marcados "-- C3".
-- ---------------------------------------------------------------------------

create or replace function public.place_label(
  p_kind public.table_kind,
  p_table_number integer,
  p_counter_number integer,
  p_customer_label text
)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when p_kind = 'COUNTER' then
      'Para llevar #' || coalesce(p_counter_number::text, '?')
      || coalesce(' · ' || nullif(btrim(p_customer_label), ''), '')
    else
      'Mesa ' || p_table_number::text
  end;
$$;

revoke all on function public.place_label(public.table_kind, integer, integer, text) from public, anon;
grant execute on function public.place_label(public.table_kind, integer, integer, text) to authenticated, service_role;


create or replace function public.get_staff_orders(
  p_restaurant_id uuid,
  p_statuses public.order_status[] default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  select coalesce(
    jsonb_agg(o order by o.created_at),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      ord.id,
      ord.order_number,
      ord.status,
      ord.subtotal,
      ord.total,
      ord.notes,
      ord.rejection_reason,
      ord.created_at,
      ord.accepted_at,
      ord.preparing_at,
      ord.ready_at,
      ord.delivered_at,
      t.number as table_number,
      t.name   as table_name,
      -- C3
      t.kind             as table_kind,
      ts.counter_number  as counter_number,
      ts.customer_label  as customer_label,
      public.place_label(t.kind, t.number, ts.counter_number, ts.customer_label) as place_label,
      accepter.full_name as accepted_by_name,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id',           oi.id,
              'product_name', oi.product_name,
              'quantity',     oi.quantity,
              'unit_price',   oi.unit_price,
              'subtotal',     oi.subtotal,
              'notes',        oi.notes
            )
            order by oi.created_at
          )
          from public.order_items oi
          where oi.order_id = ord.id
        ),
        '[]'::jsonb
      ) as items
    from public.orders ord
    join public.tables t on t.id = ord.table_id
    left join public.table_sessions ts on ts.id = ord.table_session_id  -- C3
    left join public.profiles accepter on accepter.id = ord.accepted_by
    where ord.restaurant_id = p_restaurant_id
      and (p_statuses is null or ord.status = any(p_statuses))
    order by ord.created_at desc
    limit p_limit
  ) o;

  return v_result;
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
    'place_label',      public.place_label(v_table.kind, v_table.number,
                                           v_session.counter_number, v_session.customer_label),
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
        -- C3
        'table_kind',       t.kind,
        'counter_number',   ts.counter_number,
        'customer_label',   ts.customer_label,
        'place_label',      public.place_label(t.kind, t.number, ts.counter_number, ts.customer_label),
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
