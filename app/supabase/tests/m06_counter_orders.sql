-- M06 · Pedidos de mostrador. Ejecutar como postgres DESPUÉS de 20261022110000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m06 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m06 to public;
grant usage on sequence _m06_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_prod public.products%rowtype; v_price numeric;
  v_items jsonb; v_res jsonb; v_res2 jsonb; v_key uuid := gen_random_uuid(); v_hint text;
  v_addr jsonb := '{"calle":"Av. 1","numero":"12","colonia":"Centro","referencias":"frente al parque"}';
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1 order by p.id limit 1;
  if v_owner is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;
  select price into v_price from public.product_variants where product_id = v_prod.id;
  update public.restaurants set billing_enabled = true where id = v_r;
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 2));

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- Tipo obligatorio, con campo en el HINT.
  begin
    perform public.create_counter_order(null, v_items, gen_random_uuid(), v_r);
    insert into _m06 (test, ok) values ('sin tipo se rechaza', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    perform set_config('role', 'postgres', true);
    insert into _m06 (test, ok) values ('sin tipo se rechaza con field=service_type', v_hint = 'field=service_type');
    perform set_config('role', 'authenticated', true);
  end;

  -- Comer aquí / para llevar.
  v_res := public.create_counter_order('dine_in_no_table', v_items, v_key, v_r, 'Ana');
  v_res2 := public.create_counter_order('dine_in_no_table', v_items, v_key, v_r, 'Ana');
  perform set_config('role', 'postgres', true);
  insert into _m06 (test, ok) values
    ('dine_in crea pedido con cuenta abierta', v_res ->> 'bill_id' is not null and (v_res ->> 'total')::numeric = v_price * 2),
    ('idempotente por client_request_id', (v_res2 ->> 'replayed') = 'true' and v_res2 ->> 'order_id' = v_res ->> 'order_id'),
    ('el pedido va a cocina con comanda 1', (select status = 'PREPARING' and service_type = 'dine_in_no_table' and customer_name = 'Ana'
        from public.orders where id = (v_res ->> 'order_id')::uuid)
        and exists (select 1 from public.tickets where order_id = (v_res ->> 'order_id')::uuid and number = 1)),
    ('la línea guarda variante y precio del servidor', exists (
        select 1 from public.order_items where order_id = (v_res ->> 'order_id')::uuid and variant_id is not null and unit_price = v_price));
  perform set_config('role', 'authenticated', true);

  v_res := public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r);
  perform set_config('role', 'postgres', true);
  insert into _m06 (test, ok) values ('takeaway sin nombre es válido', (v_res ->> 'total')::numeric = v_price * 2);
  perform set_config('role', 'authenticated', true);

  -- Domicilio propio: obligatorios.
  begin
    perform public.create_counter_order('delivery', v_items, gen_random_uuid(), v_r, 'Luis', null, 'own', null, v_addr, 2);
    insert into _m06 (test, ok) values ('domicilio propio exige teléfono', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    perform set_config('role', 'postgres', true);
    insert into _m06 (test, ok) values ('domicilio propio exige teléfono', v_hint = 'field=customer_phone');
    perform set_config('role', 'authenticated', true);
  end;
  begin
    perform public.create_counter_order('delivery', v_items, gen_random_uuid(), v_r, 'Luis', '+593 999 111 222', 'own', null, '{"calle":"x"}');
    insert into _m06 (test, ok) values ('domicilio propio exige dirección completa', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    perform set_config('role', 'postgres', true);
    insert into _m06 (test, ok) values ('domicilio propio exige dirección completa', v_hint like 'field=delivery_address%');
    perform set_config('role', 'authenticated', true);
  end;
  begin
    perform public.create_counter_order('delivery', v_items, gen_random_uuid(), v_r, null, null, 'rappi');
    insert into _m06 (test, ok) values ('plataforma exige ID externo', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    perform set_config('role', 'postgres', true);
    insert into _m06 (test, ok) values ('plataforma exige ID externo', v_hint = 'field=external_order_id');
    perform set_config('role', 'authenticated', true);
  end;

  -- Envío: incluido en el total; null = por cotizar.
  v_res := public.create_counter_order('delivery', v_items, gen_random_uuid(), v_r, 'Luis', '+593 999 111 222', 'own', null, v_addr, 2.50, 'timbre roto', 'cash', 50);
  perform set_config('role', 'postgres', true);
  insert into _m06 (test, ok) values
    ('envío suma al total', (v_res ->> 'total')::numeric = v_price * 2 + 2.50
       and (select total - subtotal = 2.50 from public.orders where id = (v_res ->> 'order_id')::uuid)),
    ('la cuenta refleja el envío', (select total = v_price * 2 + 2.50 from public.bills where id = (v_res ->> 'bill_id')::uuid));
  perform set_config('role', 'authenticated', true);
  v_res2 := public.create_counter_order('delivery', v_items, gen_random_uuid(), v_r, 'Luis', '+593 999 111 222', 'own', null, v_addr, null);
  perform set_config('role', 'postgres', true);
  insert into _m06 (test, ok) values ('sin costo de envío queda por cotizar',
    (select shipping_cost is null and total = subtotal from public.orders where id = (v_res2 ->> 'order_id')::uuid));
  perform set_config('role', 'authenticated', true);

  -- Editar.
  perform public.update_counter_order((v_res ->> 'order_id')::uuid, '{"shipping_cost": 4, "customer_phone": "+593 988 000 111"}');
  perform set_config('role', 'postgres', true);
  insert into _m06 (test, ok) values
    ('update cambia envío y recalcula total y cuenta', (select total - subtotal = 4 from public.orders where id = (v_res ->> 'order_id')::uuid)
       and (select total = v_price * 2 + 4 from public.bills where id = (v_res ->> 'bill_id')::uuid)),
    ('update guarda teléfono', (select customer_phone = '+593 988 000 111' from public.orders where id = (v_res ->> 'order_id')::uuid)),
    ('la auditoría no guarda teléfono ni dirección', not exists (
        select 1 from public.audit_logs where entity_id = (v_res ->> 'order_id')::uuid and metadata::text like '%988 000%'));
  perform set_config('role', 'authenticated', true);
  -- Reducir el envío por debajo de lo ya cobrado: mensaje claro (OWNER pasa el control de rol).
  begin
    perform set_config('role', 'postgres', true);
    update public.bills set paid_total = total, balance = 0 where id = (v_res ->> 'bill_id')::uuid;
    perform set_config('role', 'authenticated', true);
    perform public.update_counter_order((v_res ->> 'order_id')::uuid, '{"shipping_cost": 0}');
    insert into _m06 (test, ok) values ('envío no deja la cuenta en negativo', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m06 (test, ok) values ('envío no deja la cuenta en negativo', sqlerrm like '%negativo%');
    perform set_config('role', 'authenticated', true);
  end;
  begin
    perform public.update_counter_order((v_res ->> 'order_id')::uuid, '{"total": 1}');
    insert into _m06 (test, ok) values ('no edita campos ajenos', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m06 (test, ok) values ('no edita campos ajenos', sqlerrm like '%no editable%');
    perform set_config('role', 'authenticated', true);
  end;
  begin
    perform public.update_counter_order((v_res ->> 'order_id')::uuid, '{"customer_name": null}');
    insert into _m06 (test, ok) values ('domicilio propio no admite borrar el nombre', false);
  exception when others then
    insert into _m06 (test, ok) values ('domicilio propio no admite borrar el nombre', true);
  end;

  -- Roles.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r);
    insert into _m06 (test, ok) values ('un extraño no crea pedidos', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m06 (test, ok) values ('un extraño no crea pedidos', sqlerrm like '%No autorizado%');
    perform set_config('role', 'authenticated', true);
  end;
  perform set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r);
    insert into _m06 (test, ok) values ('anon no ejecuta create_counter_order', false);
  exception when insufficient_privilege then
    insert into _m06 (test, ok) values ('anon no ejecuta create_counter_order', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m06 where not ok) then
    raise exception 'M06 falló: %', (select string_agg(test, '; ') from _m06 where not ok);
  end if;
end $$;

select n, test, ok from _m06 order by n;
rollback;
