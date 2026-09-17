
-- Las transiciones son operaciones de personal: anon nunca debe alcanzarlas
revoke execute on function public.accept_order(uuid) from public, anon;
revoke execute on function public.reject_order(uuid, text) from public, anon;
revoke execute on function public.start_order_preparing(uuid) from public, anon;
revoke execute on function public.mark_order_ready(uuid) from public, anon;
revoke execute on function public.mark_order_delivered(uuid) from public, anon;
revoke execute on function public.handle_waiter_call(uuid, public.waiter_call_status) from public, anon;

grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.reject_order(uuid, text) to authenticated;
grant execute on function public.start_order_preparing(uuid) to authenticated;
grant execute on function public.mark_order_ready(uuid) to authenticated;
grant execute on function public.mark_order_delivered(uuid) to authenticated;
grant execute on function public.handle_waiter_call(uuid, public.waiter_call_status) to authenticated;
