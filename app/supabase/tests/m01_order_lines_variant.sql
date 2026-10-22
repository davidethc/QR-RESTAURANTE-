-- ---------------------------------------------------------------------------
-- Pruebas · M01-T05a variant_id en líneas de pedido
-- (migración 20261021170000; requiere 20261020150000 product_variants).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK, solo sobre el restaurante monky-qa.
-- Se corre como postgres (MCP execute_sql o psql) DESPUÉS de aplicar la
-- migración. El último SELECT lista cada prueba con ok = true/false.
--
--   O01 staff: con variant_id cobra el precio de ESA variante (no el mínimo)
--       y guarda variant_id / variant_name / variant_price
--   O02 staff: producto de 1 sola variante sin variant_id usa esa variante
--       (precio de la variante y snapshot)
--   O06 varias variantes sin variant_id -> 'Elige una variante'
--   O07 variante agotada (availability) -> 'Uno de los productos no está disponible'
--   O03 variant_id de otro producto se rechaza; nada se escribe
--   O04 variant_id inexistente / mal formado se rechaza
--   O05 cliente (create_customer_order): con variant_id cobra su precio
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
create temp table _ctx (k text primary key, v uuid) on commit drop;
grant select, insert on _r to public;
grant select, insert on _ctx to public;

do $$
declare
  v_r uuid; v_p uuid; v_q uuid; v_s uuid;
begin
  select id into v_r from public.restaurants where slug = 'monky-qa';
  if v_r is null then
    raise exception 'No existe monky-qa: estas pruebas no corren sobre otro restaurante';
  end if;

  insert into public.products (restaurant_id, name, price) values (v_r, 'QA T05a camiseta', 2.00)
  returning id into v_p;
  insert into public.products (restaurant_id, name, price) values (v_r, 'QA T05a otro', 9.00)
  returning id into v_q;

  -- El alta crea la variante '' (2.00); la renombramos y añadimos una cara.
  update public.product_variants set name = 'Chico', price = 2.00 where product_id = v_p;
  insert into public.product_variants (product_id, name, price, position) values (v_p, 'Grande', 5.50, 1);

  insert into public.products (restaurant_id, name, price) values (v_r, 'QA T05a unica', 3.00)
  returning id into v_s;

  insert into _ctx values
    ('restaurant', v_r), ('p', v_p), ('q', v_q), ('s', v_s),
    ('v_s', (select id from public.product_variants where product_id = v_s)),
    ('v_chico', (select id from public.product_variants where product_id = v_p and name = 'Chico')),
    ('v_grande', (select id from public.product_variants where product_id = v_p and name = 'Grande')),
    ('v_q', (select id from public.product_variants where product_id = v_q)),
    ('staff', (select user_id from public.restaurant_members
               where restaurant_id = v_r and role in ('OWNER','ADMIN','WAITER') and status = 'ACTIVE' limit 1)),
    ('tbl', (select id from public.tables where restaurant_id = v_r and kind = 'TABLE' and status <> 'INACTIVE' order by number limit 1));

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;
end $$;

-- O01 / O02 / O03 / O04 · staff
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'staff'), 'role', 'authenticated')::text, true);

do $$
declare
  v_o1 uuid; v_o2 uuid;
  v_s uuid := (select v from _ctx where k = 's');
  v_t uuid := (select v from _ctx where k = 'tbl');
  v_p uuid := (select v from _ctx where k = 'p');
begin
  v_o1 := public.create_staff_order(v_t, jsonb_build_array(
    jsonb_build_object('product_id', v_p, 'quantity', 2,
                       'variant_id', (select v from _ctx where k = 'v_grande'))));
  insert into _ctx values ('o1', v_o1);

  v_o2 := public.create_staff_order(v_t, jsonb_build_array(
    jsonb_build_object('product_id', v_s, 'quantity', 1)));
  insert into _ctx values ('o2', v_o2);
exception when others then
  insert into _r (test, ok, detail) values ('O01/O02 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  perform public.create_staff_order(
    (select v from _ctx where k = 'tbl'),
    jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'p'), 'quantity', 1,
                                         'variant_id', (select v from _ctx where k = 'v_q'))));
  insert into _r (test, ok, detail) values ('O03a variante de otro producto rechazada', false, 'no falló');
exception when others then
  insert into _r (test, ok, detail)
  values ('O03a variante de otro producto rechazada', sqlerrm like '%variante%', sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  perform public.create_staff_order(
    (select v from _ctx where k = 'tbl'),
    jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'p'), 'quantity', 1,
                                         'variant_id', gen_random_uuid())));
  insert into _r (test, ok, detail) values ('O04a variante inexistente rechazada', false, 'no falló');
exception when others then
  insert into _r (test, ok, detail)
  values ('O04a variante inexistente rechazada', sqlerrm like '%variante%', sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  perform public.create_staff_order(
    (select v from _ctx where k = 'tbl'),
    jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'p'), 'quantity', 1,
                                         'variant_id', 'no-es-uuid')));
  insert into _r (test, ok, detail) values ('O04b variant_id mal formado rechazado', false, 'no falló');
exception when others then
  insert into _r (test, ok, detail)
  values ('O04b variant_id mal formado rechazado', sqlerrm = 'Producto inválido en el pedido', sqlstate || ' ' || sqlerrm);
end $$;

do $$
begin
  perform public.create_staff_order(
    (select v from _ctx where k = 'tbl'),
    jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'p'), 'quantity', 1)));
  insert into _r (test, ok, detail) values ('O06 varias variantes sin variant_id rechazado', false, 'no falló');
exception when others then
  insert into _r (test, ok, detail)
  values ('O06 varias variantes sin variant_id rechazado', sqlerrm = 'Elige una variante', sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'O01 con variant_id cobra 5.50 x2 = 11.00 y guarda el snapshot',
       count(*) = 1 and bool_and(i.unit_price = 5.50 and i.subtotal = 11.00
         and i.variant_id = (select v from _ctx where k = 'v_grande')
         and i.variant_name = 'Grande' and i.variant_price = 5.50
         and o.total = 11.00),
       count(*) || ' filas'
from public.order_items i join public.orders o on o.id = i.order_id
where i.order_id = (select v from _ctx where k = 'o1');

insert into _r (test, ok, detail)
select 'O02 1 variante sin variant_id usa su precio (3.00) y guarda variant_id',
       count(*) = 1 and bool_and(i.unit_price = 3.00 and i.variant_id = (select v from _ctx where k = 'v_s')
         and i.variant_price = 3.00 and o.total = 3.00),
       count(*) || ' filas'
from public.order_items i join public.orders o on o.id = i.order_id
where i.order_id = (select v from _ctx where k = 'o2');

insert into _r (test, ok, detail)
select 'O03b los rechazos no escribieron pedidos',
       count(*) = 1, count(*) || ' pedidos del producto'
from public.order_items where product_id = (select v from _ctx where k = 'p');

-- O05 · cliente (anon) sobre la sesión activa que dejó el pedido del staff
do $$
declare
  v_tok uuid;
  v_o uuid;
begin
  select session_token into v_tok from public.table_sessions
  where table_id = (select v from _ctx where k = 'tbl') and status = 'ACTIVE' limit 1;
  perform set_config('role', 'anon', true);
  v_o := public.create_customer_order(v_tok, jsonb_build_array(
    jsonb_build_object('product_id', (select v from _ctx where k = 'p'), 'quantity', 1,
                       'variant_id', (select v from _ctx where k = 'v_grande'))));
  perform set_config('role', 'postgres', true);
  insert into _ctx values ('o3', v_o);
exception when others then
  perform set_config('role', 'postgres', true);
  insert into _r (test, ok, detail) values ('O05 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

insert into _r (test, ok, detail)
select 'O05 cliente con variant_id cobra 5.50',
       count(*) = 1 and bool_and(i.unit_price = 5.50 and i.variant_name = 'Grande'),
       count(*) || ' filas'
from public.order_items i
where i.order_id = (select v from _ctx where k = 'o3');

do $$
begin
  insert into public.availability (restaurant_id, item_type, item_id, product_id, available)
  values ((select v from _ctx where k = 'restaurant'), 'variant', (select v from _ctx where k = 'v_grande'),
          (select v from _ctx where k = 'p'), false)
  on conflict (restaurant_id, item_type, item_id) do update set available = false;
exception when others then
  insert into _r (test, ok, detail) values ('O07 preparar agotado', false, sqlstate || ' ' || sqlerrm);
end $$;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'staff'), 'role', 'authenticated')::text, true);

do $$
begin
  perform public.create_staff_order(
    (select v from _ctx where k = 'tbl'),
    jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'p'), 'quantity', 1,
                                         'variant_id', (select v from _ctx where k = 'v_grande'))));
  insert into _r (test, ok, detail) values ('O07 variante agotada rechazada', false, 'no falló');
exception when others then
  insert into _r (test, ok, detail)
  values ('O07 variante agotada rechazada', sqlerrm = 'Uno de los productos no está disponible', sqlstate || ' ' || sqlerrm);
end $$;

reset role;

select n, test, ok, detail from _r order by n;

rollback;
