-- Caja v2 (2026-10-23): EXPAND de bill_json.
--   Cada línea de la cuenta suma dos campos nuevos, sin tocar nada más:
--     image_url: foto del producto (products.image_url), null si no tiene.
--     cancelled: si la línea se canceló con cancel_order_item. Hoy la línea
--                cancelada sigue saliendo igual que una viva aunque ya no
--                suma al total; con esto la caja puede tacharla.
--   Partida de pg_get_functiondef(bill_json) en producción (fvzxfbzujvkkvniyphps).
--   CREATE OR REPLACE conserva dueño, SECURITY DEFINER y grants.
--   Compatible con la app actual: solo agrega llaves al JSON.

CREATE OR REPLACE FUNCTION public.bill_json(p_bill_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
                'notes',        oi.notes,
                -- Expand (Caja v2): foto del producto y si la línea se canceló.
                'image_url',    (select pr.image_url from public.products pr where pr.id = oi.product_id),
                'cancelled',    oi.cancelled
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
$function$;
