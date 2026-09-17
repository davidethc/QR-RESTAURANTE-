create or replace function public.start_order_preparing(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
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
$function$;

create or replace function public.mark_order_ready(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
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
$function$;
