
create or replace function public.get_waiter_calls(p_restaurant_id uuid, p_statuses waiter_call_status[] DEFAULT NULL::waiter_call_status[])
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
    jsonb_agg(
      jsonb_build_object(
        'id',            wc.id,
        'type',          wc.type,
        'status',        wc.status,
        'created_at',    wc.created_at,
        'handled_at',    wc.handled_at,
        'table_number',  t.number,
        'table_name',    t.name,
        'handled_by_name', h.full_name,
        'session_total', coalesce((
          select sum(o.total)
          from public.orders o
          where o.table_session_id = wc.table_session_id
            and o.status not in ('REJECTED', 'CANCELLED')
        ), 0),
        'session_orders', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'order_number', o.order_number,
              'created_at',   o.created_at,
              'subtotal',     o.total,
              'items', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'product_name', oi.product_name,
                    'quantity',     oi.quantity,
                    'subtotal',     oi.subtotal
                  )
                  order by oi.created_at
                )
                from public.order_items oi
                where oi.order_id = o.id
              ), '[]'::jsonb)
            )
            order by o.created_at
          )
          from public.orders o
          where o.table_session_id = wc.table_session_id
            and o.status not in ('REJECTED', 'CANCELLED')
        ), '[]'::jsonb)
      )
      order by wc.created_at
    ),
    '[]'::jsonb
  )
  into v_result
  from public.waiter_calls wc
  join public.tables t on t.id = wc.table_id
  left join public.profiles h on h.id = wc.handled_by
  where wc.restaurant_id = p_restaurant_id
    and (p_statuses is null or wc.status = any(p_statuses));

  return v_result;
end;
$function$;
