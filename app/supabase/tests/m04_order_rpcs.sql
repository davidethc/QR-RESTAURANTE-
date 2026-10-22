-- M04-T02/T03/T09 · Ejecutar como postgres DESPUÉS de 20261022020000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m04b (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m04b to public;
grant usage on sequence _m04b_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_t1 uuid; v_t2 uuid; v_prod public.products%rowtype;
  v_items jsonb; v_res jsonb; v_res2 jsonb; v_o uuid; v_item uuid; v_msg text;
  v_folio_before int; v_total numeric;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select id into v_t1 from public.tables where restaurant_id = v_r and kind = 'TABLE' and status <> 'INACTIVE' order by number limit 1;
  select id into v_t2 from public.tables t where restaurant_id = v_r and kind = 'TABLE' and status <> 'INACTIVE' and id <> v_t1
    and zone_id is not distinct from (select zone_id from public.tables where id = v_t1) order by number limit 1;
  select * into v_prod from public.products where restaurant_id = v_r and active and available order by id limit 1;
  if v_owner is null or v_t1 is null or v_t2 is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;

  -- Mesas limpias.
  update public.table_sessions set status = 'CLOSED', closed_at = now() where table_id in (v_t1, v_t2) and status = 'ACTIVE';
  update public.orders set status = 'DELIVERED' where table_id in (v_t1, v_t2) and status in ('PENDING','ACCEPTED','PREPARING','READY');
  select coalesce(max(folio), 0) into v_folio_before from public.orders where restaurant_id = v_r;
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 2));

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- open_table: sesión sin pedido ni folio; idempotente.
  v_res := public.open_table(v_t1);
  v_res2 := public.open_table(v_t1);
  insert into _m04b (test, ok) values
    ('open_table crea sesión sin pedido', (v_res ->> 'already_open') = 'false'
       and not exists (select 1 from public.orders where table_session_id = (v_res ->> 'session_id')::uuid)),
    ('open_table es idempotente', (v_res2 ->> 'already_open') = 'true' and v_res2 ->> 'session_id' = v_res ->> 'session_id'),
    ('open_table no consume folio',
       (select coalesce(max(folio), 0) from public.orders where restaurant_id = v_r) = v_folio_before);

  -- add_ticket: primera comanda crea el pedido (#1); segunda ronda = #2; idempotente.
  v_res := public.add_ticket(null, v_items, gen_random_uuid(), v_t1);
  v_o := (v_res ->> 'order_id')::uuid;
  v_res2 := public.add_ticket(v_o, v_items, '11111111-1111-1111-1111-111111111111', null);
  insert into _m04b (test, ok) values
    ('add_ticket sin pedido: comanda 1 con folio', (v_res ->> 'ticket_number') = '1' and (v_res ->> 'folio')::int = v_folio_before + 1),
    ('add_ticket ronda 2: comanda 2', (v_res2 ->> 'ticket_number') = '2'),
    ('total del pedido suma ambas rondas', (select total from public.orders where id = v_o) = 2 * v_prod.price * 2),
    ('comanda con autor y items ligados', (select count(*) = 2 and bool_and(created_by = v_owner) from public.tickets where order_id = v_o)
       and (select count(distinct ticket_id) = 2 from public.order_items where order_id = v_o));
  v_res2 := public.add_ticket(v_o, v_items, '11111111-1111-1111-1111-111111111111', null);
  insert into _m04b (test, ok) values
    ('add_ticket idempotente por request_id', (v_res2 ->> 'replayed') = 'true'
       and (select count(*) from public.tickets where order_id = v_o) = 2);

  -- cancel_order_item: motivo obligatorio, recalcula, audita.
  select id into v_item from public.order_items where order_id = v_o order by created_at limit 1;
  begin
    perform public.cancel_order_item(v_item, 'x');
    insert into _m04b (test, ok) values ('cancel_order_item exige motivo >= 3', false);
  exception when others then
    insert into _m04b (test, ok) values ('cancel_order_item exige motivo >= 3', sqlerrm like '%motivo%');
  end;
  perform public.cancel_order_item(v_item, 'cliente cambió de idea');
  insert into _m04b (test, ok) values
    ('cancel_order_item descuenta del pedido', (select total from public.orders where id = v_o) = v_prod.price * 2),
    ('cancel_order_item audita evento de seguridad',
       exists (select 1 from public.audit_logs where entity_id = v_item and metadata ->> 'action' = 'CANCEL_ORDER_ITEM'
               and (metadata ->> 'security_event')::boolean));

  -- Último producto: se rechaza.
  select id into v_item from public.order_items where order_id = v_o and not cancelled limit 1;
  begin
    perform public.cancel_order_item(v_item, 'quitar todo');
    insert into _m04b (test, ok) values ('no cancela el último producto', false);
  exception when others then
    insert into _m04b (test, ok) values ('no cancela el último producto', sqlerrm like '%último%');
  end;

  -- transfer_order a mesa libre: origen libre, destino ocupado.
  perform public.transfer_order(v_o, v_t2);
  perform set_config('role', 'postgres', true);
  insert into _m04b (test, ok) values
    ('transfer mueve el pedido', (select table_id from public.orders where id = v_o) = v_t2),
    ('transfer mueve la sesión', (select table_id from public.table_sessions where id = (select table_session_id from public.orders where id = v_o)) = v_t2),
    ('transfer: origen disponible', public.table_effective_status(v_t1) = 'AVAILABLE'),
    ('transfer: destino ocupado', public.table_effective_status(v_t2) = 'OCCUPIED');
  perform set_config('role', 'authenticated', true);

  -- cancel_order_with_reason: motivo obligatorio y libera la mesa.
  begin
    perform public.cancel_order_with_reason(v_o, '  ');
    insert into _m04b (test, ok) values ('cancelar pedido exige motivo', false);
  exception when others then
    insert into _m04b (test, ok) values ('cancelar pedido exige motivo', sqlerrm like '%motivo%');
  end;
  perform public.cancel_order_with_reason(v_o, 'error de captura');
  perform set_config('role', 'postgres', true);
  insert into _m04b (test, ok) values
    ('cancelar: marca cancelled/motivo/autor', (select cancelled and cancel_reason = 'error de captura'
        and cancelled_by = v_owner and status = 'CANCELLED' from public.orders where id = v_o)),
    ('cancelar: libera la mesa', public.table_effective_status(v_t2) = 'AVAILABLE'
        and not exists (select 1 from public.table_sessions where table_id = v_t2 and status = 'ACTIVE')),
    ('cancelar: items cancelados', not exists (select 1 from public.order_items where order_id = v_o and not cancelled));

  -- anon no ejecuta.
  perform set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.open_table(v_t1);
    insert into _m04b (test, ok) values ('anon no ejecuta open_table', false);
  exception when insufficient_privilege then
    insert into _m04b (test, ok) values ('anon no ejecuta open_table', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m04b where not ok) then
    raise exception 'M04-T02 falló: %', (select string_agg(test, '; ') from _m04b where not ok);
  end if;
end $$;

select n, test, ok from _m04b order by n;
rollback;
