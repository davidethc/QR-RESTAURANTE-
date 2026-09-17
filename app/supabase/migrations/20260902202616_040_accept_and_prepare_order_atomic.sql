create or replace function public.accept_and_prepare_order(p_order_id uuid)
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
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para aceptar pedidos';
  end if;

  if v_order.status <> 'PENDING' then
    raise exception 'El pedido ya fue procesado (estado actual: %)', v_order.status;
  end if;

  update public.orders
  set status = 'PREPARING',
      accepted_by = auth.uid(),
      accepted_at = now(),
      preparing_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values
    (v_order.restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', p_order_id),
    (v_order.restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', p_order_id);
end;
$function$;

revoke all on function public.accept_and_prepare_order(uuid) from public;
grant execute on function public.accept_and_prepare_order(uuid) to authenticated;
