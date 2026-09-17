
-- El cliente necesita ver QUÉ pidió y POR QUÉ se lo rechazaron.
-- La versión anterior solo devolvía totales.
drop function if exists public.get_customer_order(uuid, uuid);

create or replace function public.get_customer_order(
  p_session_token uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_result jsonb;
begin
  select o.*
  into v_order
  from public.orders o
  join public.table_sessions ts on ts.id = o.table_session_id
  where ts.session_token = p_session_token
    and o.id = p_order_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  select jsonb_build_object(
    'id',               v_order.id,
    'order_number',     v_order.order_number,
    'status',           v_order.status,
    'subtotal',         v_order.subtotal,
    'total',            v_order.total,
    'notes',            v_order.notes,
    'rejection_reason', v_order.rejection_reason,
    'created_at',       v_order.created_at,
    'accepted_at',      v_order.accepted_at,
    'preparing_at',     v_order.preparing_at,
    'ready_at',         v_order.ready_at,
    'delivered_at',     v_order.delivered_at,
    'table_number',     (select t.number from public.tables t where t.id = v_order.table_id),
    'items', coalesce(
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
        where oi.order_id = v_order.id
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_customer_order(uuid, uuid) from public;
grant execute on function public.get_customer_order(uuid, uuid) to anon, authenticated;


-- Todos los pedidos de la sesión: el cliente vuelve a la carta y quiere
-- seguir viendo sus pedidos activos sin guardar ids en el navegador.
create or replace function public.get_session_orders(
  p_session_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session public.table_sessions%rowtype;
  v_result jsonb;
begin
  select * into v_session
  from public.table_sessions
  where session_token = p_session_token;

  if not found then
    raise exception 'Sesión de mesa inválida';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',               o.id,
        'order_number',     o.order_number,
        'status',           o.status,
        'total',            o.total,
        'rejection_reason', o.rejection_reason,
        'created_at',       o.created_at,
        'item_count',       (select count(*) from public.order_items oi where oi.order_id = o.id)
      )
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.orders o
  where o.table_session_id = v_session.id;

  return v_result;
end;
$$;

revoke execute on function public.get_session_orders(uuid) from public;
grant execute on function public.get_session_orders(uuid) to anon, authenticated;
