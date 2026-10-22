-- S3-F0 · Pendientes de la tanda 2. Ejecutar como postgres DESPUÉS de 20261023100000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _s3f0 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _s3f0 to public;
grant usage on sequence _s3f0_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_prod public.products%rowtype; v_items jsonb;
  v_del jsonb; v_take jsonb; v_dine jsonb; v_bill jsonb; v_c jsonb; v_denied boolean;
  v_addr jsonb := '{"calle":"Av. 1","numero":"12","colonia":"Centro"}';
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1 order by p.id limit 1;
  if v_owner is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;
  update public.restaurants set billing_enabled = true where id = v_r;
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 1));

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_dine := public.create_counter_order('dine_in_no_table', v_items, gen_random_uuid(), v_r);
  v_take := public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r);
  v_del  := public.create_counter_order('delivery', v_items, gen_random_uuid(), v_r, 'Luis', '+593 988 000 111', 'own', null, v_addr, 2);

  -- b) etiquetas por tipo
  insert into _s3f0 (test, ok) values
    ('etiqueta comer aquí', (public.bill_json((v_dine ->> 'bill_id')::uuid) ->> 'place_label') like 'Para comer aquí #%'),
    ('etiqueta para llevar', (public.bill_json((v_take ->> 'bill_id')::uuid) ->> 'place_label') like 'Para llevar #%'),
    ('etiqueta domicilio', (public.bill_json((v_del ->> 'bill_id')::uuid) ->> 'place_label') like 'Domicilio #%'),
    ('list_open_bills usa la etiqueta por tipo', exists (
       select 1 from jsonb_array_elements(public.list_open_bills(v_r)) e where e ->> 'place_label' like 'Domicilio #%'));

  -- c) variante y opciones por línea
  v_bill := public.bill_json((v_dine ->> 'bill_id')::uuid);
  insert into _s3f0 (test, ok) values
    ('bill_json trae variant_name y options en cada línea', (
       select bool_or(i ? 'variant_name' and jsonb_typeof(i -> 'options') = 'array')
       from jsonb_array_elements(v_bill -> 'orders') o, jsonb_array_elements(o -> 'items') i));

  -- d) PII: columnas bloqueadas, resto legible, RPC con rol
  begin
    perform customer_phone from public.orders limit 1;
    v_denied := false;
  exception when insufficient_privilege then v_denied := true; end;
  insert into _s3f0 (test, ok) values ('authenticated no lee customer_phone', v_denied);
  begin
    perform delivery_address from public.orders limit 1;
    v_denied := false;
  exception when insufficient_privilege then v_denied := true; end;
  insert into _s3f0 (test, ok) values ('authenticated no lee delivery_address', v_denied);
  perform id, folio, status, total, service_type, customer_name from public.orders limit 1;
  insert into _s3f0 (test, ok) values ('el resto de columnas sigue legible', true);

  v_c := public.get_order_contact((v_del ->> 'order_id')::uuid);
  insert into _s3f0 (test, ok) values
    ('get_order_contact devuelve teléfono y dirección', v_c ->> 'customer_phone' = '+593 988 000 111' and v_c -> 'delivery_address' ->> 'calle' = 'Av. 1');

  -- a) cancel_counter_sale marca cancelled
  perform public.cancel_counter_sale((v_del ->> 'bill_id')::uuid, 'prueba fase 0');
  perform set_config('role', 'postgres', true);
  insert into _s3f0 (test, ok) values
    ('cancel_counter_sale marca cancelled, motivo y autor', (
       select status = 'CANCELLED' and cancelled and cancel_reason = 'prueba fase 0' and cancelled_by = v_owner
       from public.orders where id = (v_del ->> 'order_id')::uuid)),
    ('cancel_counter_sale cancela las líneas', not exists (
       select 1 from public.order_items where order_id = (v_del ->> 'order_id')::uuid and not cancelled));

  -- d) sin sesión de restaurante no se obtiene contacto
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.get_order_contact((v_take ->> 'order_id')::uuid);
    v_denied := false;
  exception when others then v_denied := true; end;
  perform set_config('role', 'postgres', true);
  insert into _s3f0 (test, ok) values ('get_order_contact rechaza a un extraño', v_denied);

  if exists (select 1 from _s3f0 where not ok) then
    raise exception 'S3-F0 falló: %', (select string_agg(test, '; ') from _s3f0 where not ok);
  end if;
end $$;

select n, test, ok from _s3f0 order by n;
rollback;
