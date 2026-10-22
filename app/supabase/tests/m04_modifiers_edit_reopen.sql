-- M04 · personalizaciones con precio, edit_order_item, reopen_table.
-- Ejecutar como postgres DESPUÉS de 20261022040000. Solo monky-qa, todo en BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m04c (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m04c to public;
grant usage on sequence _m04c_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_t1 uuid; v_base public.products%rowtype; v_p uuid;
  v_v1 uuid; v_v2 uuid; v_ga uuid; v_gr uuid; v_oa uuid; v_ob uuid; v_oc uuid;
  v_res jsonb; v_o uuid; v_item uuid; v_session uuid; v_total numeric; v_msg text;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select id into v_t1 from public.tables where restaurant_id = v_r and kind = 'TABLE' and status <> 'INACTIVE' order by number limit 1;
  select * into v_base from public.products where restaurant_id = v_r and active and available order by id limit 1;
  if v_owner is null or v_t1 is null or v_base.id is null then raise exception 'Faltan datos de monky-qa'; end if;

  update public.table_sessions set status = 'CLOSED', closed_at = now() where table_id = v_t1 and status = 'ACTIVE';
  update public.orders set status = 'DELIVERED' where table_id = v_t1 and status in ('PENDING','ACCEPTED','PREPARING','READY');

  -- Producto de prueba: 2 variantes (30 / 40); grupo A (1..2, sin repetir: A=5, B=8); grupo R (0..3, repetible: C=2).
  insert into public.products (restaurant_id, category_id, name, price, active, available)
  select restaurant_id, category_id, 'QA modificadores', 30, true, true from public.products where id = v_base.id
  returning id into v_p;
  delete from public.product_variants where product_id = v_p;
  insert into public.product_variants (product_id, name, price, position) values (v_p, 'Chico', 30, 0) returning id into v_v1;
  insert into public.product_variants (product_id, name, price, position) values (v_p, 'Grande', 40, 1) returning id into v_v2;
  insert into public.modifier_groups (restaurant_id, name, min_select, max_select, allow_repeat) values (v_r, 'QA Salsa', 1, 2, false) returning id into v_ga;
  insert into public.modifier_groups (restaurant_id, name, min_select, max_select, allow_repeat) values (v_r, 'QA Extra', 0, 3, true) returning id into v_gr;
  insert into public.modifier_options (group_id, name, price) values (v_ga, 'A', 5) returning id into v_oa;
  insert into public.modifier_options (group_id, name, price) values (v_ga, 'B', 8) returning id into v_ob;
  insert into public.modifier_options (group_id, name, price) values (v_gr, 'C', 2) returning id into v_oc;
  insert into public.product_modifier_groups (product_id, group_id) values (v_p, v_ga), (v_p, v_gr);

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- Compatibilidad: sin "modifiers" no se valida min_select; precio = variante.
  v_res := public.add_ticket(null, jsonb_build_array(jsonb_build_object('product_id', v_p, 'variant_id', v_v1, 'quantity', 1)), gen_random_uuid(), v_t1);
  v_o := (v_res ->> 'order_id')::uuid;
  insert into _m04c (test, ok) values
    ('sin modifiers: precio de la variante', (select total from public.orders where id = v_o) = 30),
    ('sin modifiers: sin filas de opciones', not exists (select 1 from public.order_item_options oio join public.order_items oi on oi.id = oio.order_item_id where oi.order_id = v_o));

  -- Con modifiers: 40 + 5 + 2*2 = 49, x2 unidades = 98. El precio del cliente se ignora.
  v_res := public.add_ticket(v_o, jsonb_build_array(jsonb_build_object('product_id', v_p, 'variant_id', v_v2, 'quantity', 2, 'price', 1,
             'modifiers', jsonb_build_array(jsonb_build_object('option_id', v_oa, 'price', 0), jsonb_build_object('option_id', v_oc, 'qty', 2)))),
             gen_random_uuid(), null);
  insert into _m04c (test, ok) values
    ('modifiers: unit_price = variante + sum(opcion*qty)', exists (select 1 from public.order_items where order_id = v_o and unit_price = 49 and subtotal = 98)),
    ('modifiers: total del pedido', (select total from public.orders where id = v_o) = 128),
    ('modifiers: snapshot de opciones', (select count(*) = 2 and sum(price_modifier * qty) = 9 from public.order_item_options oio
        join public.order_items oi on oi.id = oio.order_item_id where oi.order_id = v_o and oio.modifier_option_id is not null));

  -- Rechazos.
  begin perform public.add_ticket(v_o, jsonb_build_array(jsonb_build_object('product_id', v_p, 'variant_id', v_v1, 'quantity', 1, 'modifiers', '[]'::jsonb)), gen_random_uuid(), null);
    insert into _m04c values (default, 'min_select exigido si viene modifiers', false);
  exception when others then insert into _m04c values (default, 'min_select exigido si viene modifiers', sqlerrm like '%al menos%'); end;
  begin perform public.add_ticket(v_o, jsonb_build_array(jsonb_build_object('product_id', v_p, 'variant_id', v_v1, 'quantity', 1,
      'modifiers', jsonb_build_array(jsonb_build_object('option_id', v_oa), jsonb_build_object('option_id', v_ob), jsonb_build_object('option_id', v_oc, 'qty', 4)))), gen_random_uuid(), null);
    insert into _m04c values (default, 'max_select respetado', false);
  exception when others then insert into _m04c values (default, 'max_select respetado', sqlerrm like '%como máximo%'); end;
  begin perform public.add_ticket(v_o, jsonb_build_array(jsonb_build_object('product_id', v_p, 'variant_id', v_v1, 'quantity', 1,
      'modifiers', jsonb_build_array(jsonb_build_object('option_id', v_oa, 'qty', 2)))), gen_random_uuid(), null);
    insert into _m04c values (default, 'qty>1 solo con allow_repeat', false);
  exception when others then insert into _m04c values (default, 'qty>1 solo con allow_repeat', sqlerrm like '%no se puede repetir%' or sqlerrm like '%como máximo%'); end;
  begin perform public.add_ticket(v_o, jsonb_build_array(jsonb_build_object('product_id', v_base.id, 'quantity', 1,
      'modifiers', jsonb_build_array(jsonb_build_object('option_id', v_oa)))), gen_random_uuid(), null);
    insert into _m04c values (default, 'opcion de otro producto rechazada', false);
  exception when others then insert into _m04c values (default, 'opcion de otro producto rechazada', sqlerrm like '%no corresponde%' or sqlerrm like '%Elige una variante%'); end;
  perform set_config('role', 'postgres', true);
  insert into public.availability (restaurant_id, item_type, item_id, group_id, available) values (v_r, 'modifier_option', v_ob, v_ga, false);
  perform set_config('role', 'authenticated', true);
  begin perform public.add_ticket(v_o, jsonb_build_array(jsonb_build_object('product_id', v_p, 'variant_id', v_v1, 'quantity', 1,
      'modifiers', jsonb_build_array(jsonb_build_object('option_id', v_ob)))), gen_random_uuid(), null);
    insert into _m04c values (default, 'opcion agotada rechazada', false);
  exception when others then insert into _m04c values (default, 'opcion agotada rechazada', sqlerrm like '%no está disponible%'); end;

  -- edit_order_item: Grande(49) -> Chico(30+9=39): baja precio, recalcula pedido y deja evento.
  select id into v_item from public.order_items where order_id = v_o and unit_price = 49;
  v_res := public.edit_order_item(v_item, v_v1, ' sin cebolla ');
  perform set_config('role', 'postgres', true);
  insert into _m04c values (default, 'edit: recalcula linea con opciones', (v_res ->> 'unit_price')::numeric = 39 and (v_res ->> 'subtotal')::numeric = 78);
  insert into _m04c values (default, 'edit: total del pedido', (select total from public.orders where id = v_o) = 108);
  insert into _m04c values (default, 'edit: nota recortada', (select notes from public.order_items where id = v_item) = 'sin cebolla');
  insert into _m04c values (default, 'edit: evento PRICE_REDUCED', exists (select 1 from public.audit_logs where entity_id = v_item and metadata ->> 'action' = 'PRICE_REDUCED'));
  insert into _m04c values (default, 'edit: auditoria EDIT_ORDER_ITEM', exists (select 1 from public.audit_logs where entity_id = v_item and metadata ->> 'action' = 'EDIT_ORDER_ITEM'));
  perform set_config('role', 'authenticated', true);
  begin perform public.edit_order_item(v_item, null, null);
    insert into _m04c values (default, 'edit: sin cambios rechazado', false);
  exception when others then insert into _m04c values (default, 'edit: sin cambios rechazado', sqlerrm like '%No hay cambios%'); end;
  perform public.cancel_order_item(v_item, 'prueba de cancelacion');
  begin perform public.edit_order_item(v_item, v_v2, null);
    insert into _m04c values (default, 'edit: linea cancelada rechazada', false);
  exception when others then insert into _m04c values (default, 'edit: linea cancelada rechazada', sqlerrm like '%cancelado%'); end;

  -- reopen_table: sin cuenta pedida falla; con BILL pendiente vuelve a ACTIVA.
  perform set_config('role', 'postgres', true);
  select table_session_id into v_session from public.orders where id = v_o;
  perform set_config('role', 'authenticated', true);
  begin perform public.reopen_table(v_session);
    insert into _m04c values (default, 'reopen: exige estado cuenta', false);
  exception when others then insert into _m04c values (default, 'reopen: exige estado cuenta', sqlerrm like '%estado cuenta%'); end;
  perform public.request_bill_as_staff(v_t1);
  perform set_config('role', 'postgres', true);
  insert into _m04c values (default, 'reopen: mesa en BILL_REQUESTED', public.table_effective_status(v_t1) = 'BILL_REQUESTED');
  perform set_config('role', 'authenticated', true);
  perform public.reopen_table(v_session);
  perform set_config('role', 'postgres', true);
  insert into _m04c values (default, 'reopen: vuelve a activa', public.table_effective_status(v_t1) <> 'BILL_REQUESTED'
     and (select status from public.table_sessions where id = v_session) = 'ACTIVE');
  insert into _m04c values (default, 'reopen: auditado', exists (select 1 from public.audit_logs where entity_id = v_session and metadata ->> 'action' = 'REOPEN_TABLE'));

  -- anon no ejecuta las nuevas RPC.
  perform set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.reopen_table(v_session);
    insert into _m04c values (default, 'anon no ejecuta reopen_table', false);
  exception when insufficient_privilege then insert into _m04c values (default, 'anon no ejecuta reopen_table', true); end;
  begin perform public.edit_order_item(v_item, null, 'x');
    insert into _m04c values (default, 'anon no ejecuta edit_order_item', false);
  exception when insufficient_privilege then insert into _m04c values (default, 'anon no ejecuta edit_order_item', true); end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m04c where not ok) then
    raise exception 'M04 modifiers/edit/reopen falló: %', (select string_agg(test, '; ') from _m04c where not ok);
  end if;
end $$;

select n, test, ok from _m04c order by n;
rollback;
