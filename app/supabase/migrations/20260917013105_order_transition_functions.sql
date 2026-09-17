-- Function: accept_order() - waiter accepts order
create or replace function public.accept_order(
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.status <> 'PENDING' then
    raise exception 'Pedido no está en estado pendiente';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No tienes permisos para aceptar pedidos';
  end if;

  update public.orders
  set
    status = 'ACCEPTED',
    accepted_by = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  where id = p_order_id
    and status = 'PENDING';

  return true;
end;
$$;

-- Function: reject_order() - waiter rejects order
create or replace function public.reject_order(
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.status <> 'PENDING' then
    raise exception 'Pedido no está en estado pendiente';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No tienes permisos para rechazar pedidos';
  end if;

  update public.orders
  set
    status = 'REJECTED',
    updated_at = now()
  where id = p_order_id
    and status = 'PENDING';

  return true;
end;
$$;

-- Function: start_order_preparing() - kitchen starts preparing order
create or replace function public.start_order_preparing(
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.status <> 'ACCEPTED' then
    raise exception 'Pedido no está aceptado';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'KITCHEN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No tienes permisos para preparar pedidos';
  end if;

  update public.orders
  set
    status = 'PREPARING',
    preparing_at = now(),
    updated_at = now()
  where id = p_order_id
    and status = 'ACCEPTED';

  return true;
end;
$$;

-- Function: mark_order_ready() - kitchen marks order as ready
create or replace function public.mark_order_ready(
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.status <> 'PREPARING' then
    raise exception 'Pedido no está siendo preparado';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'KITCHEN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No tienes permisos para marcar pedidos listos';
  end if;

  update public.orders
  set
    status = 'READY',
    ready_at = now(),
    updated_at = now()
  where id = p_order_id
    and status = 'PREPARING';

  return true;
end;
$$;

-- Function: mark_order_delivered() - waiter delivers order
create or replace function public.mark_order_delivered(
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.status <> 'READY' then
    raise exception 'Pedido no está listo';
  end if;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No tienes permisos para entregar pedidos';
  end if;

  update public.orders
  set
    status = 'DELIVERED',
    delivered_at = now(),
    updated_at = now()
  where id = p_order_id
    and status = 'READY';

  return true;
end;
$$;

-- Function: handle_waiter_call() - mark waiter call as handled
create or replace function public.handle_waiter_call(
  p_waiter_call_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_call public.waiter_calls%rowtype;
begin

  select *
  into v_call
  from public.waiter_calls
  where id = p_waiter_call_id;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_call.status <> 'PENDING' then
    raise exception 'Solicitud no está pendiente';
  end if;

  if not (
    public.user_has_restaurant_role(v_call.restaurant_id, 'WAITER')
    or public.user_has_restaurant_role(v_call.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_call.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No tienes permisos para atender solicitudes';
  end if;

  update public.waiter_calls
  set
    status = 'ATTENDED',
    handled_by = auth.uid(),
    handled_at = now(),
    updated_at = now()
  where id = p_waiter_call_id
    and status = 'PENDING';

  return true;
end;
$$;
