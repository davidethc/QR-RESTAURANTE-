-- ---------------------------------------------------------------------------
-- Pruebas · M01-T04 RPC save_product_with_variants
-- (migración 20261021100000; requiere 20261020150000 product_variants).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO escribe sobre el restaurante
-- monky-qa. De otros restaurantes solo se LEEN ids (producto y categoría
-- ajenos) para comprobar que la RPC los rechaza. Se corre como postgres
-- (MCP execute_sql o psql) DESPUÉS de aplicar la migración. El último
-- SELECT lista cada prueba con ok = true/false.
--
-- Qué demuestra:
--   S01 crear con un solo precio: 1 variante '' y products.price igual; audita CREATE
--   S02 crear con 2 variantes: exactamente 2 (la automática se reutiliza),
--       posiciones 0 y 1, products.price = la más barata
--   S03 actualizar: datos del producto, precios por id, mínimo recalculado,
--       available/featured null conservan el valor; audita UPDATE
--   S04 reemplaza la variante automática de un producto creado por la app
--       actual (insert directo) sin dejar una segunda; volver a un solo precio
--   S05 KITCHEN (o WAITER si no hay cocina) rechazado con 42501; nada escrito
--   S06 otro restaurante: restaurante ajeno 42501, producto ajeno 42501,
--       categoría ajena 22023, bebida ajena 22023
--   S07 nombres repetidos sin distinguir mayúsculas ni espacios: 23514
--   S08 atomicidad: si una variante falla, el producto y sus variantes quedan
--       como estaban; un alta fallida no deja producto
--   S09 validaciones: sin variantes 22023, id de variante ajeno 22023, precio
--       negativo 23514, un solo precio con nombre 23514, varios precios con uno
--       sin nombre 23514, sin sesión 42501
--   S10 permisos: anon y public no ejecutan; authenticated sí
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
create temp table _ctx (k text primary key, v uuid) on commit drop;
grant select, insert on _r to public;
grant select, insert on _ctx to public;

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
    ('owner', (select user_id from public.restaurant_members
               where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1)),
    ('staff', coalesce(
       (select user_id from public.restaurant_members
        where restaurant_id = v_r and role = 'KITCHEN' and status = 'ACTIVE' limit 1),
       (select user_id from public.restaurant_members
        where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1))),
    ('foreign_product', (select id from public.products where restaurant_id <> v_r order by id limit 1)),
    ('foreign_category', (select id from public.categories where restaurant_id <> v_r order by id limit 1));
  insert into _ctx values
    ('foreign_restaurant', (select restaurant_id from public.products where id = (select v from _ctx where k = 'foreign_product')));

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;

  insert into public.categories (restaurant_id, name) values (v_r, 'QA M01 T04 categoría')
  returning id into v_r;
  insert into _ctx values ('category', v_r);
end $$;

-- ---------------------------------------------------------------------------
-- S01..S04, S06..S09 · como OWNER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p uuid;
begin
  -- S01
  v_p := public.save_product_with_variants(
    p_restaurant_id => v_r,
    p_name => '  QA T04 un precio  ',
    p_variants => '[{"name": "", "price": 3.50}]'::jsonb,
    p_category_id => (select v from _ctx where k = 'category'),
    p_description => 'Descripción');
  insert into _ctx values ('p_single', v_p);

  -- S02
  v_p := public.save_product_with_variants(
    p_restaurant_id => v_r,
    p_name => 'QA T04 dos precios',
    p_variants => '[{"name": "Grande", "price": 6.00}, {"name": "Pequeño", "price": 4.25}]'::jsonb);
  insert into _ctx values ('p_double', v_p);
exception when others then
  insert into _r (test, ok, detail) values ('S01-S02 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S01a crear con un solo precio deja 1 variante sin nombre con el mismo precio',
       count(*) = 1 and min(v.name) = '' and min(v.price) = 3.50 and min(v.position) = 0
       and (select price from public.products where id = (select v from _ctx where k = 'p_single')) = 3.50,
       count(*) || ' variantes, name=' || coalesce(min(v.name), 'null') || ', price=' || coalesce(min(v.price)::text, 'null')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'p_single');

insert into _r (test, ok, detail)
select 'S01b el producto queda en monky-qa con nombre recortado, categoría y descripción',
       count(*) = 1 and min(p.name) = 'QA T04 un precio' and min(p.description) = 'Descripción'
       and bool_and(p.category_id = (select v from _ctx where k = 'category'))
       and bool_and(p.restaurant_id = (select v from _ctx where k = 'restaurant'))
       and bool_and(p.available) and not bool_or(p.featured),
       count(*) || ' filas, name=' || coalesce(min(p.name), 'null')
from public.products p where p.id = (select v from _ctx where k = 'p_single');

insert into _r (test, ok, detail)
select 'S01c el alta queda en audit_logs (CREATE, product)',
       count(*) = 1, count(*) || ' filas'
from public.audit_logs a
where a.entity_id = (select v from _ctx where k = 'p_single') and a.action = 'CREATE' and a.entity_type = 'product'
  and a.user_id = (select v from _ctx where k = 'owner');

insert into _r (test, ok, detail)
select 'S02a crear con 2 variantes deja exactamente 2 (sin la automática de más) en su orden',
       count(*) = 2
       and string_agg(v.name || ':' || v.price || ':' || v.position, ',' order by v.position) = 'Grande:6.00:0,Pequeño:4.25:1',
       count(*) || ' variantes: ' || coalesce(string_agg(v.name || ':' || v.price || ':' || v.position, ',' order by v.position), '')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'p_double');

insert into _r (test, ok, detail)
select 'S02b products.price = la variante más barata (4.25)',
       price = 4.25, 'price ' || price
from public.products where id = (select v from _ctx where k = 'p_double');

-- S03 · actualizar por id
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p uuid := (select v from _ctx where k = 'p_double');
  v_g uuid := (select id from public.product_variants where product_id = (select v from _ctx where k = 'p_double') and name = 'Grande');
  v_s uuid := (select id from public.product_variants where product_id = (select v from _ctx where k = 'p_double') and name = 'Pequeño');
  v_ret uuid;
begin
  insert into _ctx values ('v_grande', v_g), ('v_peq', v_s);
  update public.products set available = false, featured = true where id = v_p;

  v_ret := public.save_product_with_variants(
    p_restaurant_id => v_r,
    p_product_id => v_p,
    p_name => 'QA T04 dos precios v2',
    p_description => 'Nueva',
    p_category_id => (select v from _ctx where k = 'category'),
    p_paired_drink_id => (select v from _ctx where k = 'p_single'),
    p_variants => jsonb_build_array(
      jsonb_build_object('id', v_s, 'name', 'Mediano', 'price', 5.00),
      jsonb_build_object('id', v_g, 'name', 'Grande', 'price', 7.00),
      jsonb_build_object('name', 'Familiar', 'price', 9.00)));
  insert into _r (test, ok, detail) values ('S03a actualizar devuelve el mismo id', v_ret = v_p, coalesce(v_ret::text, 'null'));
exception when others then
  insert into _r (test, ok, detail) values ('S03 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S03b variantes por id actualizadas, la nueva insertada, en el orden enviado',
       count(*) = 3
       and string_agg(v.name || ':' || v.price || ':' || v.position, ',' order by v.position) = 'Mediano:5.00:0,Grande:7.00:1,Familiar:9.00:2'
       and bool_or(v.id = (select v from _ctx where k = 'v_peq') and v.name = 'Mediano')
       and bool_or(v.id = (select v from _ctx where k = 'v_grande') and v.name = 'Grande'),
       coalesce(string_agg(v.name || ':' || v.price || ':' || v.position, ',' order by v.position), '')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'p_double');

insert into _r (test, ok, detail)
select 'S03c producto actualizado; price = mínimo (5.00); available/featured null se conservan',
       p.name = 'QA T04 dos precios v2' and p.description = 'Nueva' and p.price = 5.00
       and p.paired_drink_id = (select v from _ctx where k = 'p_single')
       and p.available = false and p.featured = true,
       format('name=%s price=%s available=%s featured=%s', p.name, p.price, p.available, p.featured)
from public.products p where p.id = (select v from _ctx where k = 'p_double');

insert into _r (test, ok, detail)
select 'S03d la edición queda en audit_logs (UPDATE, product)',
       count(*) = 1, count(*) || ' filas'
from public.audit_logs a
where a.entity_id = (select v from _ctx where k = 'p_double') and a.action = 'UPDATE' and a.entity_type = 'product';

-- S04 · producto creado por la app actual (insert directo: variante automática)
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p uuid;
  v_auto uuid;
begin
  insert into public.products (restaurant_id, name, price) values (v_r, 'QA T04 legacy', 2.00) returning id into v_p;
  select id into v_auto from public.product_variants where product_id = v_p;
  insert into _ctx values ('p_legacy', v_p), ('v_auto', v_auto);

  perform public.save_product_with_variants(
    p_restaurant_id => v_r, p_product_id => v_p, p_name => 'QA T04 legacy',
    p_variants => '[{"name": "Chico", "price": 2.50}, {"name": "Grande", "price": 3.50}]'::jsonb);
exception when others then
  insert into _r (test, ok, detail) values ('S04 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S04a la variante automática se reutiliza: 2 variantes, sin una tercera',
       count(*) = 2 and bool_or(v.id = (select v from _ctx where k = 'v_auto') and v.name = 'Chico' and v.price = 2.50)
       and not bool_or(v.name = ''),
       count(*) || ' variantes: ' || coalesce(string_agg(v.name || ':' || v.price, ',' order by v.position), '')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'p_legacy');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
begin
  perform public.save_product_with_variants(
    p_restaurant_id => (select v from _ctx where k = 'restaurant'),
    p_product_id => (select v from _ctx where k = 'p_legacy'), p_name => 'QA T04 legacy',
    p_variants => '[{"name": "", "price": 1.75}]'::jsonb);
exception when others then
  insert into _r (test, ok, detail) values ('S04b bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S04b volver a un solo precio deja 1 variante sin nombre y products.price = 1.75',
       count(*) = 1 and min(v.name) = '' and min(v.price) = 1.75
       and (select price from public.products where id = (select v from _ctx where k = 'p_legacy')) = 1.75,
       count(*) || ' variantes'
from public.product_variants v where v.product_id = (select v from _ctx where k = 'p_legacy');

-- S06..S09 · rechazos del OWNER
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p uuid := (select v from _ctx where k = 'p_double');
  v_one jsonb := '[{"name": "", "price": 1}]'::jsonb;
  v_cases jsonb := jsonb_build_array(
    -- test, sqlstate esperado, restaurante, producto, categoría, bebida, variantes
    jsonb_build_array('S06a restaurante ajeno', '42501', (select v from _ctx where k = 'foreign_restaurant'), null, null, null, v_one),
    jsonb_build_array('S06b producto ajeno (con mi restaurante)', '42501', v_r, (select v from _ctx where k = 'foreign_product'), null, null, v_one),
    jsonb_build_array('S06c categoría de otro restaurante', '22023', v_r, null, (select v from _ctx where k = 'foreign_category'), null, v_one),
    jsonb_build_array('S06d bebida de otro restaurante', '22023', v_r, null, null, (select v from _ctx where k = 'foreign_product'), v_one),
    jsonb_build_array('S07a nombres repetidos sin distinguir mayúsculas', '23514', v_r, null, null, null,
                      '[{"name": "Grande", "price": 1}, {"name": "grande", "price": 2}]'::jsonb),
    jsonb_build_array('S07b nombres repetidos al editar', '23514', v_r, v_p, null, null,
                      '[{"name": "Mediano", "price": 1}, {"name": "MEDIANO", "price": 2}]'::jsonb),
    jsonb_build_array('S09a sin variantes', '22023', v_r, null, null, null, '[]'::jsonb),
    jsonb_build_array('S09b id de variante de otro producto', '22023', v_r, v_p, null, null,
                      jsonb_build_array(jsonb_build_object('id', (select v from _ctx where k = 'v_auto'), 'name', '', 'price', 1))),
    jsonb_build_array('S09c precio negativo', '23514', v_r, null, null, null, '[{"name": "", "price": -0.01}]'::jsonb),
    jsonb_build_array('S09d un solo precio con nombre', '23514', v_r, null, null, null, '[{"name": "Grande", "price": 1}]'::jsonb),
    jsonb_build_array('S09e varios precios con uno sin nombre', '23514', v_r, null, null, null,
                      '[{"name": "Grande", "price": 1}, {"name": "", "price": 2}]'::jsonb),
    jsonb_build_array('S09f precio con más de dos decimales', '22023', v_r, null, null, null, '[{"name": "", "price": 1.234}]'::jsonb),
    jsonb_build_array('S09g precio que no es número', '22023', v_r, null, null, null, '[{"name": "", "price": "1"}]'::jsonb),
    jsonb_build_array('S09h nombre de producto vacío', '22023', v_r, null, null, null, v_one)
  );
  v_case jsonb;
begin
  for v_case in select value from jsonb_array_elements(v_cases) loop
    begin
      perform public.save_product_with_variants(
        p_restaurant_id => (v_case->>2)::uuid,
        p_product_id => (v_case->>3)::uuid,
        p_name => case when v_case->>0 like 'S09h%' then '   ' else 'QA T04 rechazo' end,
        p_category_id => (v_case->>4)::uuid,
        p_paired_drink_id => (v_case->>5)::uuid,
        p_variants => v_case->6);
      insert into _r (test, ok, detail) values (v_case->>0, false, 'guardó');
    exception when others then
      insert into _r (test, ok, detail) values (v_case->>0, sqlstate = v_case->>1, sqlstate || ' ' || sqlerrm);
    end;
  end loop;
end $$;

-- S08 · atomicidad (OWNER)
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p uuid := (select v from _ctx where k = 'p_double');
begin
  begin
    perform public.save_product_with_variants(
      p_restaurant_id => v_r, p_product_id => v_p, p_name => 'QA T04 NO DEBE QUEDAR',
      p_variants => jsonb_build_array(
        jsonb_build_object('id', (select v from _ctx where k = 'v_peq'), 'name', 'Cambiado', 'price', 0.50),
        jsonb_build_object('name', 'Nueva', 'price', 0.25),
        jsonb_build_object('name', repeat('x', 81), 'price', 1)));
    insert into _r (test, ok, detail) values ('S08a una variante inválida rechaza todo el guardado', false, 'guardó');
  exception when others then
    insert into _r (test, ok, detail) values ('S08a una variante inválida rechaza todo el guardado', sqlstate in ('22023', '23514'), sqlstate || ' ' || sqlerrm);
  end;

  begin
    perform public.save_product_with_variants(
      p_restaurant_id => v_r, p_name => 'QA T04 alta fallida',
      p_variants => '[{"name": "A", "price": 1}, {"name": "B", "price": -1}]'::jsonb);
    insert into _r (test, ok, detail) values ('S08c alta fallida', false, 'guardó');
  exception when others then
    null;
  end;
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S08b tras el fallo el producto y sus variantes quedan como estaban',
       count(*) = 3
       and string_agg(v.name || ':' || v.price, ',' order by v.position) = 'Mediano:5.00,Grande:7.00,Familiar:9.00'
       and (select name || ':' || price from public.products where id = (select v from _ctx where k = 'p_double')) = 'QA T04 dos precios v2:5.00',
       coalesce(string_agg(v.name || ':' || v.price, ',' order by v.position), '')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'p_double');

insert into _r (test, ok, detail)
select 'S08c un alta fallida no deja producto ni variantes', count(*) = 0, count(*) || ' productos'
from public.products where name = 'QA T04 alta fallida';

-- S05 · rol sin permiso de catálogo
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'staff'), 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.save_product_with_variants(
      p_restaurant_id => (select v from _ctx where k = 'restaurant'), p_name => 'QA T04 cocina',
      p_variants => '[{"name": "", "price": 1}]'::jsonb);
    insert into _r (test, ok, detail) values ('S05a KITCHEN/WAITER no crea productos', false, 'guardó');
  exception when others then
    insert into _r (test, ok, detail) values ('S05a KITCHEN/WAITER no crea productos', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  begin
    perform public.save_product_with_variants(
      p_restaurant_id => (select v from _ctx where k = 'restaurant'),
      p_product_id => (select v from _ctx where k = 'p_single'), p_name => 'QA T04 cocina',
      p_variants => '[{"name": "", "price": 0}]'::jsonb);
    insert into _r (test, ok, detail) values ('S05b KITCHEN/WAITER no edita productos', false, 'guardó');
  exception when others then
    insert into _r (test, ok, detail) values ('S05b KITCHEN/WAITER no edita productos', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- S09i · sin sesión
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

do $$
begin
  perform public.save_product_with_variants(
    p_restaurant_id => (select v from _ctx where k = 'restaurant'), p_name => 'QA T04 sin sesión',
    p_variants => '[{"name": "", "price": 1}]'::jsonb);
  insert into _r (test, ok, detail) values ('S09i sin sesión se rechaza', false, 'guardó');
exception when others then
  insert into _r (test, ok, detail) values ('S09i sin sesión se rechaza', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S05c tras los intentos sin permiso nada cambió',
       (select count(*) from public.products where name in ('QA T04 cocina', 'QA T04 sin sesión')) = 0
       and (select name || ':' || price from public.products where id = (select v from _ctx where k = 'p_single')) = 'QA T04 un precio:3.50',
       (select name || ':' || price from public.products where id = (select v from _ctx where k = 'p_single'));

-- S10 · permisos
insert into _r (test, ok, detail)
select 'S10 anon no ejecuta; authenticated sí; public no',
       not has_function_privilege('anon', p.oid, 'execute')
       and has_function_privilege('authenticated', p.oid, 'execute')
       and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
       and p.prosecdef
       and p.proconfig @> array['search_path=""'],
       format('anon=%s authenticated=%s definer=%s config=%s',
              has_function_privilege('anon', p.oid, 'execute'),
              has_function_privilege('authenticated', p.oid, 'execute'), p.prosecdef, p.proconfig)
from pg_proc p
where p.oid = 'public.save_product_with_variants(uuid, text, jsonb, uuid, uuid, text, uuid, boolean, boolean)'::regprocedure;

select n, test, ok, detail from _r order by n;

rollback;
