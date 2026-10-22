-- ---------------------------------------------------------------------------
-- Pruebas · M01-T02 product_variants y sincronía con products.price
-- (migración 20261020150000).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO escribe sobre el restaurante
-- monky-qa. De otros restaurantes solo se LEEN conteos y el id de una
-- variante ajena (V10). Se corre como postgres (MCP execute_sql o psql)
-- DESPUÉS de aplicar la migración. El último SELECT lista cada prueba con
-- ok = true/false.
--
-- Qué demuestra:
--   V01 backfill: todo producto tiene ≥ 1 variante y products.price = mínimo
--   V02 un producto nuevo creado solo con price tiene su variante ('' y mismo precio)
--   V03 cambiar products.price con 1 variante actualiza la variante (sin bucle)
--   V04 cambiar el precio de la variante actualiza products.price (sin bucle)
--   V05 con 2 variantes products.price = la más barata; editar products.price
--       a otro valor se rechaza (22023)
--   V06 precio negativo en una variante se rechaza (23514)
--   V07 una variante no cambia de producto (22023)
--   V08 borrar la única variante se rechaza al confirmar (23514); reemplazarla
--       en la misma transacción y borrar el producto entero sí se permiten
--   V09 RLS: OWNER escribe; WAITER lee pero no inserta, actualiza ni borra
--   V10 aislamiento: OWNER y WAITER ven 0 variantes ajenas; OWNER no inserta
--       ni actualiza variantes de otro restaurante
--   V11 anon no lee product_variants
--   V12 un pedido de staff cobra el precio de la variante (= products.price)
--       y sigue el cambio de precio hecho en la variante
-- Usuarios reales de monky-qa (OWNER y WAITER) como authenticated.
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
create temp table _ctx (k text primary key, v uuid) on commit drop;
create temp table _n (k text primary key, n bigint) on commit drop;
grant select, insert on _r to public;
grant select, insert on _ctx to public;
grant select on _n to public;

-- ---------------------------------------------------------------------------
-- Contexto (monky-qa)
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid;
begin
  select id into v_r from public.restaurants where slug = 'monky-qa';
  if v_r is null then
    raise exception 'No existe monky-qa: estas pruebas no corren sobre otro restaurante';
  end if;

  insert into _ctx values
    ('restaurant', v_r),
    ('owner',  (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'OWNER'  and status = 'ACTIVE' limit 1)),
    ('waiter', (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1)),
    ('table',  (select id from public.tables where restaurant_id = v_r and kind = 'TABLE' and status <> 'INACTIVE' order by id limit 1)),
    ('foreign_variant', (select v.id from public.product_variants v join public.products p on p.id = v.product_id
                         where p.restaurant_id <> v_r order by v.id limit 1));
  insert into _ctx values
    ('foreign_product', (select product_id from public.product_variants where id = (select v from _ctx where k = 'foreign_variant')));

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;

  insert into _n values
    ('foreign_variants', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                          where p.restaurant_id <> v_r));
end $$;

-- ---------------------------------------------------------------------------
-- V01 · backfill
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'V01a todo producto (todos los restaurantes) tiene al menos una variante',
       count(*) = 0, count(*) || ' productos sin variante'
from public.products p
where not exists (select 1 from public.product_variants v where v.product_id = p.id);

insert into _r (test, ok, detail)
select 'V01b en monky-qa products.price = precio de la variante más barata',
       count(*) = 0 and (select count(*) from public.products where restaurant_id = (select v from _ctx where k = 'restaurant')) > 0,
       count(*) || ' productos con caché distinta'
from public.products p
where p.restaurant_id = (select v from _ctx where k = 'restaurant')
  and p.price is distinct from (select min(v.price) from public.product_variants v where v.product_id = p.id);

-- ---------------------------------------------------------------------------
-- V02..V05 · como OWNER de monky-qa (el camino de createProduct/updateProduct)
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p uuid;
  v_v uuid;
  v_v2 uuid;
  v_n int;
  v_name text;
  v_vprice numeric;
  v_pprice numeric;
begin
  -- V02
  insert into public.products (restaurant_id, name, price) values (v_r, 'QA M01 variantes', 3.50)
  returning id into v_p;
  select count(*), min(name), min(price) into v_n, v_name, v_vprice from public.product_variants where product_id = v_p;
  insert into _r (test, ok, detail) values
    ('V02 producto nuevo solo con price tiene 1 variante con name '''' y el mismo precio',
     v_n = 1 and v_name = '' and v_vprice = 3.50, format('%s variantes, name=%L, price=%s', v_n, v_name, v_vprice));
  select id into v_v from public.product_variants where product_id = v_p;
  insert into _ctx values ('qa_product', v_p), ('qa_variant', v_v);

  -- V03
  update public.products set price = 4.00 where id = v_p;
  select price into v_vprice from public.product_variants where id = v_v;
  insert into _r (test, ok, detail) values
    ('V03 cambiar products.price con 1 variante actualiza la variante', v_vprice = 4.00, 'variante ' || v_vprice);

  -- V04
  update public.product_variants set price = 4.75 where id = v_v;
  select price into v_pprice from public.products where id = v_p;
  insert into _r (test, ok, detail) values
    ('V04 cambiar el precio de la variante actualiza products.price', v_pprice = 4.75, 'producto ' || v_pprice);

  -- V05
  insert into public.product_variants (product_id, name, price, position) values (v_p, 'Grande', 6.00, 1)
  returning id into v_v2;
  update public.product_variants set name = 'Pequeño' where id = v_v;
  select price into v_pprice from public.products where id = v_p;
  insert into _r (test, ok, detail) values
    ('V05a con 2 variantes (4.75 y 6.00) products.price = 4.75', v_pprice = 4.75, 'producto ' || v_pprice);

  update public.product_variants set price = 2.25 where id = v_v2;
  select price into v_pprice from public.products where id = v_p;
  insert into _r (test, ok, detail) values
    ('V05b bajar la otra variante a 2.25 mueve el mínimo', v_pprice = 2.25, 'producto ' || v_pprice);

  delete from public.product_variants where id = v_v2;
  select price into v_pprice from public.products where id = v_p;
  insert into _r (test, ok, detail) values
    ('V05c borrar la variante más barata recalcula el mínimo', v_pprice = 4.75, 'producto ' || v_pprice);

  insert into public.product_variants (product_id, name, price, position) values (v_p, 'Grande', 6.00, 1);
  begin
    update public.products set price = 9.99 where id = v_p;
    insert into _r (test, ok, detail) values ('V05d con 2 variantes no se edita products.price a otro valor', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('V05d con 2 variantes no se edita products.price a otro valor', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  update public.products set name = 'QA M01 variantes renombrado', price = 4.75 where id = v_p;
  insert into _r (test, ok, detail) values
    ('V05e con 2 variantes se puede editar el producto reenviando el mismo precio', true, '');
exception when others then
  insert into _r (test, ok, detail) values ('V02-V05 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- V06..V08 · restricciones (como postgres: aplican a todos)
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p uuid;
  v_v uuid;
  v_n int;
begin
  begin
    insert into public.product_variants (product_id, price) values ((select v from _ctx where k = 'qa_product'), -0.01);
    insert into _r (test, ok, detail) values ('V06 precio negativo se rechaza', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('V06 precio negativo se rechaza', sqlstate = '23514', sqlstate || ' ' || sqlerrm);
  end;

  insert into public.products (restaurant_id, name, price) values (v_r, 'QA M01 otro', 1.00) returning id into v_p;
  begin
    update public.product_variants set product_id = v_p where id = (select v from _ctx where k = 'qa_variant');
    insert into _r (test, ok, detail) values ('V07 una variante no cambia de producto', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values ('V07 una variante no cambia de producto', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  -- V08a: el chequeo es diferido; se fuerza con SET CONSTRAINTS ... IMMEDIATE.
  begin
    delete from public.product_variants where product_id = v_p;
    set constraints public.product_variants_require_one immediate;
    insert into _r (test, ok, detail) values ('V08a borrar la única variante se rechaza', false, 'borró');
  exception when others then
    insert into _r (test, ok, detail) values ('V08a borrar la única variante se rechaza', sqlstate = '23514', sqlstate || ' ' || sqlerrm);
  end;
  set constraints public.product_variants_require_one deferred;

  begin
    delete from public.product_variants where product_id = v_p;
    insert into public.product_variants (product_id, name, price) values (v_p, '', 1.50);
    set constraints public.product_variants_require_one immediate;
    select count(*) into v_n from public.product_variants where product_id = v_p;
    insert into _r (test, ok, detail) values
      ('V08b reemplazar la única variante en la misma transacción se permite',
       v_n = 1 and (select price from public.products where id = v_p) = 1.50, v_n || ' variantes');
  exception when others then
    insert into _r (test, ok, detail) values ('V08b reemplazar la única variante', false, sqlstate || ' ' || sqlerrm);
  end;
  set constraints public.product_variants_require_one deferred;

  begin
    delete from public.products where id = v_p;
    set constraints public.product_variants_require_one immediate;
    select count(*) into v_n from public.product_variants where product_id = v_p;
    insert into _r (test, ok, detail) values ('V08c borrar el producto borra sus variantes', v_n = 0, v_n || ' variantes');
  exception when others then
    insert into _r (test, ok, detail) values ('V08c borrar el producto borra sus variantes', false, sqlstate || ' ' || sqlerrm);
  end;
  set constraints public.product_variants_require_one deferred;
exception when others then
  insert into _r (test, ok, detail) values ('V06-V08 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- V09a / V10 · OWNER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_n bigint;
begin
  select count(*) into v_n from public.product_variants v
  where not exists (select 1 from public.products p where p.id = v.product_id and p.restaurant_id = v_r);
  insert into _r (test, ok, detail) values
    ('V10a OWNER ve 0 variantes de otros restaurantes',
     v_n = 0 and (select n from _n where k = 'foreign_variants') > 0,
     format('visibles %s de %s ajenas', v_n, (select n from _n where k = 'foreign_variants')));

  begin
    insert into public.product_variants (product_id, name, price)
    values ((select v from _ctx where k = 'foreign_product'), 'QA intruso', 0);
    insert into _r (test, ok, detail) values ('V10b OWNER no inserta variantes en un producto ajeno', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('V10b OWNER no inserta variantes en un producto ajeno', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  update public.product_variants set price = 0 where id = (select v from _ctx where k = 'foreign_variant');
  get diagnostics v_n = row_count;
  insert into _r (test, ok, detail) values ('V10c OWNER no actualiza variantes ajenas', v_n = 0, v_n || ' filas');
exception when others then
  insert into _r (test, ok, detail) values ('V10 OWNER bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- V09b / V10 · WAITER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_n bigint;
begin
  select count(*) into v_n from public.product_variants where id = (select v from _ctx where k = 'qa_variant');
  insert into _r (test, ok, detail) values ('V09a WAITER lee las variantes de su restaurante', v_n = 1, v_n || ' filas');

  select count(*) into v_n from public.product_variants where id = (select v from _ctx where k = 'foreign_variant');
  insert into _r (test, ok, detail) values ('V10d WAITER no ve variantes ajenas', v_n = 0, v_n || ' filas');

  begin
    insert into public.product_variants (product_id, name, price)
    values ((select v from _ctx where k = 'qa_product'), 'QA waiter', 1.00);
    insert into _r (test, ok, detail) values ('V09b WAITER no inserta variantes', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('V09b WAITER no inserta variantes', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  update public.product_variants set price = 0.01 where id = (select v from _ctx where k = 'qa_variant');
  get diagnostics v_n = row_count;
  insert into _r (test, ok, detail) values ('V09c WAITER no actualiza variantes', v_n = 0, v_n || ' filas');

  delete from public.product_variants where id = (select v from _ctx where k = 'qa_variant');
  get diagnostics v_n = row_count;
  insert into _r (test, ok, detail) values ('V09d WAITER no borra variantes', v_n = 0, v_n || ' filas');
exception when others then
  insert into _r (test, ok, detail) values ('V09 WAITER bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'V09e la variante sigue intacta tras los intentos del WAITER',
       count(*) = 1 and min(price) = 4.75, count(*) || ' filas, price ' || coalesce(min(price)::text, 'null')
from public.product_variants where id = (select v from _ctx where k = 'qa_variant');

-- ---------------------------------------------------------------------------
-- V11 · anon no lee
-- ---------------------------------------------------------------------------
select set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  perform 1 from public.product_variants limit 1;
  insert into _r (test, ok, detail) values ('V11 anon no lee product_variants', false, 'leyó');
exception when others then
  insert into _r (test, ok, detail) values ('V11 anon no lee product_variants', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- V12 · pedido de staff: cobra lo mismo que la variante (y que products.price)
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p uuid;
begin
  insert into public.products (restaurant_id, name, price) values (v_r, 'QA M01 pedido', 4.50) returning id into v_p;
  insert into _ctx values ('order_product', v_p);
end $$;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_o uuid;
begin
  v_o := public.create_staff_order(
    (select v from _ctx where k = 'table'),
    jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'order_product'), 'quantity', 2)),
    null, null);
  insert into _ctx values ('order1', v_o);
exception when others then
  insert into _r (test, ok, detail) values ('V12a pedido de staff', false, sqlstate || ' ' || sqlerrm);
end $$;

-- El OWNER cambia el precio en la variante (el camino nuevo).
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

update public.product_variants set price = 5.25 where product_id = (select v from _ctx where k = 'order_product');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_o uuid;
begin
  v_o := public.create_staff_order(
    (select v from _ctx where k = 'table'),
    jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'order_product'), 'quantity', 1)),
    null, null);
  insert into _ctx values ('order2', v_o);
exception when others then
  insert into _r (test, ok, detail) values ('V12b pedido de staff', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'V12a pedido de staff cobra el precio de la única variante (4.50 x 2)',
       count(*) = 1 and min(oi.unit_price) = 4.50 and min(oi.subtotal) = 9.00,
       count(*) || ' líneas, unit_price ' || coalesce(min(oi.unit_price)::text, 'null')
from public.order_items oi where oi.order_id = (select v from _ctx where k = 'order1');

insert into _r (test, ok, detail)
select 'V12b tras cambiar la variante a 5.25 el pedido cobra 5.25',
       count(*) = 1 and min(oi.unit_price) = 5.25
       and (select price from public.products where id = (select v from _ctx where k = 'order_product')) = 5.25,
       count(*) || ' líneas, unit_price ' || coalesce(min(oi.unit_price)::text, 'null')
from public.order_items oi where oi.order_id = (select v from _ctx where k = 'order2');

select n, test, ok, detail from _r order by n;

rollback;
