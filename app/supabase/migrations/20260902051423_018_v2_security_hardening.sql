
-- 1. set_updated_at necesita search_path fijo
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Revocar funciones internas del API público
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.user_belongs_to_restaurant(uuid) from public, anon, authenticated;
revoke execute on function public.user_has_restaurant_role(uuid, public.member_role) from public, anon, authenticated;

-- 3. RPCs del cliente: revocar de public, otorgar explícitamente
revoke execute on function public.resolve_table_qr(uuid) from public;
revoke execute on function public.create_customer_order(uuid, jsonb, text) from public;
revoke execute on function public.get_customer_order(uuid, uuid) from public;
revoke execute on function public.create_waiter_call(uuid, public.waiter_call_type) from public;

grant execute on function public.resolve_table_qr(uuid) to anon, authenticated;
grant execute on function public.create_customer_order(uuid, jsonb, text) to anon, authenticated;
grant execute on function public.get_customer_order(uuid, uuid) to anon, authenticated;
grant execute on function public.create_waiter_call(uuid, public.waiter_call_type) to anon, authenticated;
