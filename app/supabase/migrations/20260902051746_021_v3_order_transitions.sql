
-- ACEPTAR PEDIDO: PENDING -> ACCEPTED (OWNER, ADMIN, WAITER)
create or replace function public.accept_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para aceptar pedidos';
  end if;

  if v_order.status <> 'PENDING' then
    raise exception 'El pedido ya fue procesado (estado actual: %)', v_order.status;
  end if;

  update public.orders
  set status = 'ACCEPTED',
      accepted_by = auth.uid(),
      accepted_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values (
    v_order.restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', p_order_id
  );
end;
$$;

-- RECHAZAR PEDIDO: PENDING -> REJECTED (OWNER, ADMIN, WAITER)
create or replace function public.reject_order(
  p_order_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para rechazar pedidos';
  end if;

  if v_order.status <> 'PENDING' then
    raise exception 'El pedido ya fue procesado (estado actual: %)', v_order.status;
  end if;

  update public.orders
  set status = 'REJECTED',
      rejection_reason = p_reason,
      accepted_by = auth.uid()
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_order.restaurant_id, auth.uid(), 'REJECT_ORDER', 'ORDER', p_order_id,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- PREPARAR: ACCEPTED -> PREPARING (OWNER, ADMIN, KITCHEN)
create or replace function public.start_order_preparing(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'KITCHEN')
  ) then
    raise exception 'No autorizado para preparar pedidos';
  end if;

  if v_order.status <> 'ACCEPTED' then
    raise exception 'El pedido debe estar aceptado (estado actual: %)', v_order.status;
  end if;

  update public.orders
  set status = 'PREPARING',
      preparing_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values (
    v_order.restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', p_order_id
  );
end;
$$;

-- MARCAR LISTO: PREPARING -> READY (OWNER, ADMIN, KITCHEN)
create or replace function public.mark_order_ready(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'KITCHEN')
  ) then
    raise exception 'No autorizado para marcar pedidos como listos';
  end if;

  if v_order.status <> 'PREPARING' then
    raise exception 'El pedido debe estar en preparación (estado actual: %)', v_order.status;
  end if;

  update public.orders
  set status = 'READY',
      ready_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values (
    v_order.restaurant_id, auth.uid(), 'MARK_ORDER_READY', 'ORDER', p_order_id
  );
end;
$$;

-- ENTREGAR: READY -> DELIVERED (OWNER, ADMIN, WAITER)
create or replace function public.mark_order_delivered(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para entregar pedidos';
  end if;

  if v_order.status <> 'READY' then
    raise exception 'El pedido debe estar listo (estado actual: %)', v_order.status;
  end if;

  update public.orders
  set status = 'DELIVERED',
      delivered_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values (
    v_order.restaurant_id, auth.uid(), 'MARK_ORDER_DELIVERED', 'ORDER', p_order_id
  );
end;
$$;

-- ATENDER SOLICITUD (OWNER, ADMIN, WAITER)
create or replace function public.handle_waiter_call(
  p_call_id uuid,
  p_status public.waiter_call_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call public.waiter_calls%rowtype;
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
end;
$$;
