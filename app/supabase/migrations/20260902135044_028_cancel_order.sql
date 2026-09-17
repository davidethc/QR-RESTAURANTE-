
-- Cancelar pedido: OWNER/ADMIN, solo antes de que cocina termine.
create or replace function public.cancel_order(
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
  ) then
    raise exception 'No autorizado para cancelar pedidos';
  end if;

  if v_order.status not in ('PENDING', 'ACCEPTED', 'PREPARING') then
    raise exception 'No se puede cancelar un pedido en estado %', v_order.status;
  end if;

  update public.orders
  set status = 'CANCELLED',
      rejection_reason = p_reason
  where id = p_order_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_order.restaurant_id, auth.uid(), 'UPDATE', 'ORDER', p_order_id,
    jsonb_build_object('action', 'CANCEL_ORDER', 'reason', p_reason)
  );
end;
$$;

revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;
