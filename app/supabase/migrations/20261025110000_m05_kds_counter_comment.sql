-- ---------------------------------------------------------------------------
-- M05 fix · Kitchen tickets show the counter order comment.
--
-- Counter orders (create_counter_order, M06) save the "Comentario para
-- cocina" in orders.general_comment, but get_kitchen_tickets only returned
-- orders.notes, so the comment never reached the KDS or the printed ticket.
-- order_notes now joins both (notes · general_comment). Same signature,
-- grants and rules; only that one field changes.
--
-- Rollback: reapply get_kitchen_tickets from 20261022100000_m05_kds.sql.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.get_kitchen_tickets(
  p_restaurant_id uuid,
  p_status text default 'pending',
  p_limit integer default 50,
  p_offset integer default 0,
  p_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_pending integer;
  v_total integer;
  v_r public.restaurants%rowtype;
  v_tickets jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(p_restaurant_id, 'KITCHEN')
  ) then
    raise exception 'No autorizado para ver las comandas';
  end if;

  if p_status not in ('pending', 'completed') then
    raise exception 'Estado de comanda inválido';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'El límite debe estar entre 1 y 200';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Desplazamiento inválido';
  end if;

  select * into v_r from public.restaurants where id = p_restaurant_id;

  -- Contador: filas de tickets pendientes de pedidos vivos en cocina.
  select count(*) into v_pending
  from public.tickets t join public.orders o on o.id = t.order_id
  where o.restaurant_id = p_restaurant_id
    and t.kitchen_status = 'pending'
    and not o.cancelled
    and o.status in ('ACCEPTED', 'PREPARING');

  select count(*) into v_total
  from public.tickets t join public.orders o on o.id = t.order_id
  where o.restaurant_id = p_restaurant_id
    and not o.cancelled
    and (p_since is null or t.created_at >= p_since)
    and case when p_status = 'pending'
      then t.kitchen_status = 'pending' and o.status in ('ACCEPTED', 'PREPARING')
      else t.kitchen_status = 'completed' and o.status not in ('REJECTED', 'CANCELLED') end;

  select coalesce(jsonb_agg(x.j order by x.s1, x.s2), '[]'::jsonb) into v_tickets
  from (
    select
      case when p_status = 'pending' then extract(epoch from t.created_at)
           else -extract(epoch from t.completed_at) end as s1,
      t.number as s2,
      jsonb_build_object(
        'ticket_id', t.id,
        'number', t.number,
        'kitchen_status', t.kitchen_status,
        'is_new', t.is_new,
        'created_at', t.created_at,
        'completed_at', t.completed_at,
        'elapsed_seconds', greatest(0, floor(extract(epoch from (coalesce(t.completed_at, now()) - t.created_at)))::integer),
        'order_id', o.id,
        'folio', o.folio,
        'short_code', o.short_code,
        'service_type', o.service_type,
        'order_status', o.status,
        -- Counter orders (M06) keep the kitchen comment in general_comment.
        'order_notes', nullif(concat_ws(' · ',
          nullif(btrim(o.notes), ''),
          nullif(btrim(o.general_comment), '')), ''),
        'place_label', case
          when ts.id is null then 'Mesa ' || tb.number::text
          else public.place_label(ts.table_kind, tb.number, ts.counter_number, ts.customer_label) end,
        'table_number', case when tb.kind = 'TABLE' then tb.number end,
        -- orders.customer_name lo agrega M06; to_jsonb tolera que aún no exista.
        'customer_name', coalesce(
          nullif(btrim(to_jsonb(o) ->> 'customer_name'), ''),
          nullif(btrim(ts.customer_label), '')),
        'author_user_id', t.created_by,
        'author_name', pr.full_name,
        'source', case when t.created_by is null then 'digital_menu' else 'staff' end,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', oi.id,
            'quantity', oi.quantity,
            'product_name', oi.product_name,
            'variant_name', oi.variant_name,
            'notes', oi.notes,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'group', oio.option_name, 'name', oio.value_name, 'qty', oio.qty)
                order by oio.created_at, oio.ctid)
              from public.order_item_options oio where oio.order_item_id = oi.id), '[]'::jsonb)
          ) order by oi.created_at, oi.ctid)
          from public.order_items oi
          where oi.ticket_id = t.id and not oi.cancelled), '[]'::jsonb)
      ) as j
    from public.tickets t
    join public.orders o on o.id = t.order_id
    join public.tables tb on tb.id = o.table_id
    left join public.table_sessions ts on ts.id = o.table_session_id
    left join public.profiles pr on pr.id = t.created_by
    where o.restaurant_id = p_restaurant_id
      and not o.cancelled
      and (p_since is null or t.created_at >= p_since)
      and case when p_status = 'pending'
        then t.kitchen_status = 'pending' and o.status in ('ACCEPTED', 'PREPARING')
        else t.kitchen_status = 'completed' and o.status not in ('REJECTED', 'CANCELLED') end
    order by 1, 2
    limit p_limit offset p_offset
  ) x;

  return jsonb_build_object(
    'pending_count', v_pending,
    'total', v_total,
    'kds_enabled', v_r.kds_enabled,
    'thresholds', jsonb_build_object('warn_minutes', v_r.kds_warn_minutes, 'alert_minutes', v_r.kds_alert_minutes),
    'tickets', v_tickets
  );
end;
$$;
