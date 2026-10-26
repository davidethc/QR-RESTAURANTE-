-- M05 fix · get_kitchen_tickets shows the counter order comment.
-- Run as postgres AFTER 20261025110000. monky-qa only, inside BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_r     uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid;
  v_o     uuid;
  v_res   jsonb;
  v_notes text;
begin
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select o.id into v_o from public.orders o join public.tickets t on t.order_id = o.id
    where o.restaurant_id = v_r and t.kitchen_status = 'pending' and not o.cancelled
      and o.status in ('ACCEPTED', 'PREPARING') limit 1;
  if v_o is null then raise exception 'monky-qa needs one pending kitchen ticket for this test'; end if;

  update public.orders set general_comment = 'QA comentario cocina', notes = 'Sin cebolla' where id = v_o;
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_res := public.get_kitchen_tickets(v_r, 'pending', 200, 0, null);
  select t ->> 'order_notes' into v_notes
    from jsonb_array_elements(v_res -> 'tickets') t where t ->> 'order_id' = v_o::text limit 1;
  if v_notes is distinct from 'Sin cebolla · QA comentario cocina' then
    raise exception 'order_notes should join notes and the counter comment, got %', v_notes;
  end if;

  perform set_config('role', 'postgres', true);
  update public.orders set general_comment = 'QA comentario cocina', notes = null where id = v_o;
  perform set_config('role', 'authenticated', true);
  v_res := public.get_kitchen_tickets(v_r, 'pending', 200, 0, null);
  select t ->> 'order_notes' into v_notes
    from jsonb_array_elements(v_res -> 'tickets') t where t ->> 'order_id' = v_o::text limit 1;
  if v_notes is distinct from 'QA comentario cocina' then
    raise exception 'a counter comment alone should reach the kitchen, got %', v_notes;
  end if;
  perform set_config('role', 'postgres', true);
end $$;

select 'm05 kds counter comment ok' as result;
rollback;
