
create or replace function public.handle_waiter_call(p_call_id uuid, p_status waiter_call_status)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_call public.waiter_calls%rowtype;
  v_active_session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_status not in ('ACCEPTED', 'ATTENDED', 'REJECTED') then
    raise exception 'Estado de solicitud inválido';
  end if;

  select * into v_call
  from public.waiter_calls
  where id = p_call_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_call.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_call.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_call.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para atender solicitudes';
  end if;

  if v_call.status not in ('PENDING', 'ACCEPTED') then
    raise exception 'La solicitud ya fue cerrada (estado actual: %)', v_call.status;
  end if;

  update public.waiter_calls
  set status = p_status,
      handled_by = auth.uid(),
      handled_at = now()
  where id = p_call_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_call.restaurant_id, auth.uid(), 'HANDLE_WAITER_CALL', 'WAITER_CALL', p_call_id,
    jsonb_build_object('status', p_status)
  );

  -- Cuando el mesero marca una solicitud de "Pedir cuenta" como atendida
  -- (la cobró), se cierra la sesión de esa mesa para que el total deje
  -- de contarse en el panel de Mesas — de lo contrario `get_tables_status`
  -- seguía sumando las órdenes DELIVERED del día aunque ya estén pagadas.
  -- Solo se cierra si no quedan pedidos sin entregar (mismo resguardo que
  -- ya tenía `close_table_session`); si quedan, se deja la sesión abierta
  -- y el total sigue mostrándose, en vez de fallar el clic del mesero.
  if p_status = 'ATTENDED' and v_call.type = 'BILL' then
    select id into v_active_session_id
    from public.table_sessions
    where table_id = v_call.table_id
      and status = 'ACTIVE';

    if v_active_session_id is not null
       and not exists (
         select 1 from public.orders
         where table_session_id = v_active_session_id
           and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
       )
    then
      update public.table_sessions
      set status = 'CLOSED',
          closed_at = now()
      where id = v_active_session_id;
    end if;
  end if;
end;
$function$;

create or replace function public.get_tables_status(p_restaurant_id uuid)
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
        'id',            t.id,
        'number',        t.number,
        'name',          t.name,
        'status',        t.status,
        'qr_token',      t.qr_token,
        'active_orders', (
          select count(*)
          from public.orders o
          where o.table_id = t.id
            and o.status in ('PENDING','ACCEPTED','PREPARING','READY')
        ),
        'pending_calls', (
          select count(*)
          from public.waiter_calls wc
          where wc.table_id = t.id
            and wc.status in ('PENDING','ACCEPTED')
        ),
        'active_total', (
          -- El total a cobrar es el de la sesión ACTIVA actual de la mesa,
          -- no "todo lo entregado hoy": antes usaba date_trunc('day', now())
          -- y por eso una cuenta ya cobrada (sesión cerrada) seguía sumando
          -- hasta la medianoche. Al cerrarse la sesión (ver
          -- handle_waiter_call) esta suma vuelve a cero de inmediato.
          select coalesce(sum(o.total), 0)
          from public.orders o
          join public.table_sessions ts on ts.id = o.table_session_id
          where o.table_id = t.id
            and ts.status = 'ACTIVE'
            and o.status not in ('REJECTED', 'CANCELLED')
        )
      )
      order by t.number
    ),
    '[]'::jsonb
  )
  into v_result
  from public.tables t
  where t.restaurant_id = p_restaurant_id;

  return v_result;
end;
$function$;
