-- ---------------------------------------------------------------------------
-- Pruebas · M01-T04 RPC save_product_variants
-- (migración 20261021120000; requiere 20261020150000 product_variants).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO escribe sobre el restaurante
-- monky-qa. De otros restaurantes solo se LEE el id de un producto ajeno para
-- comprobar que la RPC lo rechaza. Se corre como postgres (MCP execute_sql o
-- psql) DESPUÉS de aplicar la migración. El último SELECT lista cada prueba
-- con ok = true/false.
--
-- Qué demuestra:
--   V01 reemplazar variantes: la automática se reutiliza por id, la nueva se
--       inserta, orden = posición; audita UPDATE
--   V02 reemplazar sin ids reutiliza las filas existentes y borra las que
--       sobran; volver a un solo precio
--   V03 products.price queda en la variante más barata tras cada guardado
--   V04 no cambia ningún otro campo del producto (name, description,
--       category_id, paired_drink_id, available, featured, ...)
--   V05 KITCHEN (o WAITER si no hay cocina) rechazado con 42501; nada escrito
--   V06 producto ajeno 42501, producto inexistente 42501, sin producto 42501
--   V07 nombres repetidos sin distinguir mayúsculas ni espacios: 23514
--   V08 atomicidad: si una variante falla, las variantes y el precio quedan
--       como estaban; nunca queda el producto sin variantes
--   V09 validaciones: precio negativo 23514, id de otro producto 22023,
--       un solo precio con nombre 23514, sin sesión 42501
--   V10 permisos: anon y public no ejecutan; authenticated sí; definer y
--       search_path vacío
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
create temp table _ctx (k text primary key, v uuid) on commit drop;
create temp table _snap (k text primary key, v jsonb) on commit drop;
grant select, insert on _r to public;
grant select, insert on _ctx to public;

-- ---------------------------------------------------------------------------
-- Contexto (monky-qa): producto con datos en todos los campos editables
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid;
  v_c uuid;
  v_d uuid;
  v_p uuid;
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
    ('foreign_product', (select id from public.products where restaurant_id <> v_r order by id limit 1));

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;

  insert into public.categories (restaurant_id, name) values (v_r, 'QA M01 T04 variantes')
  returning id into v_c;
  insert into public.products (restaurant_id, name, price) values (v_r, 'QA T04V bebida', 1.00)
  returning id into v_d;
  insert into public.products (restaurant_id, category_id, name, description, price,
                               available, featured, paired_drink_id)
  values (v_r, v_c, 'QA T04V producto', 'Descripción QA', 2.00, false, true, v_d)
  returning id into v_p;

  insert into _ctx values
    ('category', v_c), ('drink', v_d), ('product', v_p),
    ('v_auto', (select id from public.product_variants where product_id = v_p));

  insert into _snap
  select 'before', to_jsonb(p) - 'price' - 'updated_at'
  from public.products p where p.id = v_p;
  insert into _snap
  select 'foreign', coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]')
  from public.product_variants v where v.product_id = (select v from _ctx where k = 'foreign_product');
  insert into _snap
  select 'foreign_product', to_jsonb(p)
  from public.products p where p.id = (select v from _ctx where k = 'foreign_product');
end $$;

-- ---------------------------------------------------------------------------
-- V01 · reemplazar con ids (OWNER)
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
begin
  perform public.save_product_variants(
    p_product_id => (select v from _ctx where k = 'product'),
    p_variants => jsonb_build_array(
      jsonb_build_object('id', (select v from _ctx where k = 'v_auto'), 'name', '  Chico ', 'price', 2.50),
      jsonb_build_object('name', 'Grande', 'price', 4.00)));
exception when others then
  insert into _r (test, ok, detail) values ('V01 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'V01a reemplazar: la automática se reutiliza por id y la nueva se inserta en orden',
       count(*) = 2
       and string_agg(v.name || ':' || v.price || ':' || v.position, ',' order by v.position) = 'Chico:2.50:0,Grande:4.00:1'
       and bool_or(v.id = (select v from _ctx where k = 'v_auto') and v.name = 'Chico'),
       count(*) || ' variantes: ' || coalesce(string_agg(v.name || ':' || v.price || ':' || v.position, ',' order by v.position), '')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'product');

insert into _r (test, ok, detail)
select 'V03a products.price = la más barata (2.50)', price = 2.50, 'price ' || price
from public.products where id = (select v from _ctx where k = 'product');

insert into _r (test, ok, detail)
select 'V01b el guardado queda en audit_logs (UPDATE, product) con las variantes',
       count(*) = 1 and bool_and(jsonb_array_length(a.metadata -> 'variants') = 2),
       count(*) || ' filas'
from public.audit_logs a
where a.entity_id = (select v from _ctx where k = 'product') and a.action = 'UPDATE'
  and a.entity_type = 'product' and a.user_id = (select v from _ctx where k = 'owner');

-- ---------------------------------------------------------------------------
-- V02 · reemplazar sin ids (reutiliza filas) y volver a un solo precio
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
begin
  perform public.save_product_variants(
    p_product_id => (select v from _ctx where k = 'product'),
    p_variants => '[{"name": "Vaso", "price": 3.00}, {"name": "Jarra", "price": 8.00}, {"name": "Botella", "price": 1.25}]'::jsonb);
exception when others then
  insert into _r (test, ok, detail) values ('V02 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'V02a sin ids: 3 variantes, las 2 filas previas reutilizadas y 1 nueva',
       count(*) = 3
       and string_agg(v.name || ':' || v.price || ':' || v.position, ',' order by v.position) = 'Vaso:3.00:0,Jarra:8.00:1,Botella:1.25:2'
       and bool_or(v.id = (select v from _ctx where k = 'v_auto')),
       coalesce(string_agg(v.name || ':' || v.price || ':' || v.position, ',' order by v.position), '')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'product');

insert into _r (test, ok, detail)
select 'V03b products.price = la más barata aunque no sea la primera (1.25)', price = 1.25, 'price ' || price
from public.products where id = (select v from _ctx where k = 'product');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
begin
  perform public.save_product_variants(
    p_product_id => (select v from _ctx where k = 'product'),
    p_variants => '[{"name": "", "price": 5.00}]'::jsonb);
exception when others then
  insert into _r (test, ok, detail) values ('V02b bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'V02b volver a un solo precio deja 1 variante sin nombre (la primera fila) y price = 5.00',
       count(*) = 1 and min(v.name) = '' and min(v.price) = 5.00
       and bool_and(v.id = (select v from _ctx where k = 'v_auto'))
       and (select price from public.products where id = (select v from _ctx where k = 'product')) = 5.00,
       count(*) || ' variantes'
from public.product_variants v where v.product_id = (select v from _ctx where k = 'product');

-- Deja el producto con 2 variantes para las pruebas de rechazo.
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
begin
  perform public.save_product_variants(
    p_product_id => (select v from _ctx where k = 'product'),
    p_variants => '[{"name": "Mediano", "price": 5.00}, {"name": "Grande", "price": 7.00}]'::jsonb);
exception when others then
  insert into _r (test, ok, detail) values ('V02c bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- V04 · ningún otro campo del producto cambió
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'V04 no cambia name/description/category/paired_drink/available/featured ni otros campos',
       (to_jsonb(p) - 'price' - 'updated_at') = (select v from _snap where k = 'before'),
       format('name=%s available=%s featured=%s', p.name, p.available, p.featured)
from public.products p where p.id = (select v from _ctx where k = 'product');

-- ---------------------------------------------------------------------------
-- V06, V07, V08, V09 · rechazos del OWNER
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_p uuid := (select v from _ctx where k = 'product');
  v_one jsonb := '[{"name": "", "price": 1}]'::jsonb;
  v_cases jsonb := jsonb_build_array(
    -- test, sqlstate esperado, producto, variantes
    jsonb_build_array('V06a producto de otro restaurante', '42501', (select v from _ctx where k = 'foreign_product'), v_one),
    jsonb_build_array('V06b producto inexistente', '42501', gen_random_uuid(), v_one),
    jsonb_build_array('V06c sin producto', '42501', null, v_one),
    jsonb_build_array('V07a nombres repetidos sin distinguir mayúsculas', '23514', v_p,
                      '[{"name": "Grande", "price": 1}, {"name": "grande", "price": 2}]'::jsonb),
    jsonb_build_array('V07b nombres repetidos con espacios', '23514', v_p,
                      '[{"name": "Mediano", "price": 1}, {"name": " MEDIANO ", "price": 2}]'::jsonb),
    jsonb_build_array('V08a sin variantes (nunca queda sin variantes)', '22023', v_p, '[]'::jsonb),
    jsonb_build_array('V08b variantes null', '22023', v_p, null),
    jsonb_build_array('V09a precio negativo', '23514', v_p, '[{"name": "", "price": -0.01}]'::jsonb),
    jsonb_build_array('V09b id de variante de otro producto', '22023', v_p,
                      jsonb_build_array(jsonb_build_object('id', (select id from public.product_variants
                                                                   where product_id = (select v from _ctx where k = 'drink')),
                                                           'name', '', 'price', 1))),
    jsonb_build_array('V09c un solo precio con nombre', '23514', v_p, '[{"name": "Grande", "price": 1}]'::jsonb),
    jsonb_build_array('V09d precio que no es número', '22023', v_p, '[{"name": "", "price": "1"}]'::jsonb)
  );
  v_case jsonb;
begin
  for v_case in select value from jsonb_array_elements(v_cases) loop
    begin
      perform public.save_product_variants(
        p_product_id => (v_case->>2)::uuid,
        p_variants => case when jsonb_typeof(v_case->3) = 'null' then null else v_case->3 end);
      insert into _r (test, ok, detail) values (v_case->>0, false, 'guardó');
    exception when others then
      insert into _r (test, ok, detail) values (v_case->>0, sqlstate = v_case->>1, sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  -- V08c · la tercera variante es inválida después de dos válidas
  begin
    perform public.save_product_variants(
      p_product_id => v_p,
      p_variants => jsonb_build_array(
        jsonb_build_object('name', 'Cambiado', 'price', 0.50),
        jsonb_build_object('name', 'Nueva', 'price', 0.25),
        jsonb_build_object('name', repeat('x', 81), 'price', 1)));
    insert into _r (test, ok, detail) values ('V08c una variante inválida rechaza todo el guardado', false, 'guardó');
  exception when others then
    insert into _r (test, ok, detail) values ('V08c una variante inválida rechaza todo el guardado',
                                              sqlstate in ('22023', '23514'), sqlstate || ' ' || sqlerrm);
  end;
end $$;

reset role;

insert into _r (test, ok, detail)
select 'V08d tras los fallos las variantes y el precio quedan como estaban',
       count(*) = 2
       and string_agg(v.name || ':' || v.price, ',' order by v.position) = 'Mediano:5.00,Grande:7.00'
       and (select price from public.products where id = (select v from _ctx where k = 'product')) = 5.00,
       coalesce(string_agg(v.name || ':' || v.price, ',' order by v.position), '')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'product');

insert into _r (test, ok, detail)
select 'V06d el producto ajeno y sus variantes no se tocaron',
       coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]') = (select v from _snap where k = 'foreign')
       and (select to_jsonb(p) from public.products p where p.id = (select v from _ctx where k = 'foreign_product'))
           = (select v from _snap where k = 'foreign_product'),
       count(*) || ' variantes'
from public.product_variants v where v.product_id = (select v from _ctx where k = 'foreign_product');

-- ---------------------------------------------------------------------------
-- V05 · rol sin permiso de catálogo
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'staff'), 'role', 'authenticated')::text, true);

do $$
begin
  perform public.save_product_variants(
    p_product_id => (select v from _ctx where k = 'product'),
    p_variants => '[{"name": "", "price": 0}]'::jsonb);
  insert into _r (test, ok, detail) values ('V05a KITCHEN/WAITER no edita variantes', false, 'guardó');
exception when others then
  insert into _r (test, ok, detail) values ('V05a KITCHEN/WAITER no edita variantes', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
end $$;

-- V09e · sin sesión
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

do $$
begin
  perform public.save_product_variants(
    p_product_id => (select v from _ctx where k = 'product'),
    p_variants => '[{"name": "", "price": 0}]'::jsonb);
  insert into _r (test, ok, detail) values ('V09e sin sesión se rechaza', false, 'guardó');
exception when others then
  insert into _r (test, ok, detail) values ('V09e sin sesión se rechaza', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'V05b tras los intentos sin permiso nada cambió',
       count(*) = 2
       and string_agg(v.name || ':' || v.price, ',' order by v.position) = 'Mediano:5.00,Grande:7.00'
       and (select count(*) from public.audit_logs
            where entity_id = (select v from _ctx where k = 'product')) = 4,
       coalesce(string_agg(v.name || ':' || v.price, ',' order by v.position), '')
from public.product_variants v where v.product_id = (select v from _ctx where k = 'product');

-- ---------------------------------------------------------------------------
-- V10 · permisos
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'V10 anon no ejecuta; authenticated sí; public no; definer con search_path vacío',
       not has_function_privilege('anon', p.oid, 'execute')
       and has_function_privilege('authenticated', p.oid, 'execute')
       and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
       and p.prosecdef
       and p.proconfig @> array['search_path=""'],
       format('anon=%s authenticated=%s definer=%s config=%s',
              has_function_privilege('anon', p.oid, 'execute'),
              has_function_privilege('authenticated', p.oid, 'execute'), p.prosecdef, p.proconfig)
from pg_proc p
where p.oid = 'public.save_product_variants(uuid, jsonb)'::regprocedure;

select n, test, ok, detail from _r order by n;

rollback;
