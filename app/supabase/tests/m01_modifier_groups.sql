-- ---------------------------------------------------------------------------
-- Pruebas · M01-T03 grupos de personalización (modifier_groups,
-- modifier_options, product_modifier_groups) y su backfill/sincronía desde
-- product_options / product_option_values (migración 20261020160000).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO escribe sobre el restaurante
-- monky-qa. De otros restaurantes solo se LEE (S01, conteos de S06 y un
-- producto ajeno para S04). Se corre como postgres (MCP execute_sql o psql)
-- DESPUÉS de aplicar la migración. El último SELECT lista cada prueba con
-- ok = true/false.
--
-- Qué demuestra:
--   S01 backfill fiel (todos los restaurantes, solo lectura): un grupo por
--       product_options activo, min/max según required y cantidad de opciones,
--       una opción por valor activo con price_modifier >= 0, vínculo con su
--       producto y su position
--   S02 sincronía con escrituras legacy (como service_role, el único que hoy
--       escribe legacy): alta, cambio, desactivación, borrado y valores
--       negativos que no se migran; el updated_at legacy no cambia
--   S03 CHECK de min/max y de precio (23514)
--   S04 el puente rechaza producto y grupo de restaurantes distintos (23503);
--       ninguna fila cambia de padre (22023); legacy_option_id ajeno (23503)
--   S05 un grupo sin vínculos aparece como "Sin usar"
--   S06 aislamiento: OWNER y WAITER de monky-qa ven 0 filas de otros restaurantes
--   S07 OWNER escribe; WAITER lee pero no escribe; anon no lee (42501)
--   S08 un pedido de staff con opciones cobra igual que antes (precio del producto)
--   S09 OWNER borra un producto con personalización legacy (deleteProduct):
--       sin error, 1 fila; su grupo espejo, opciones y vínculos desaparecen;
--       un grupo libre que tenía vinculado sobrevive como "Sin usar"
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
create temp table _ctx (k text primary key, v uuid) on commit drop;
create temp table _n (k text primary key, n numeric) on commit drop;
grant select, insert on _r to public;
grant select, insert on _ctx to public;
grant select, insert on _n to public;

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
    ('table',  (select id from public.tables where restaurant_id = v_r and kind = 'TABLE' and status <> 'INACTIVE' order by name limit 1)),
    ('foreign_product', (select id from public.products where restaurant_id <> v_r order by created_at limit 1));

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- S01 · backfill fiel (lectura de todos los restaurantes)
-- ---------------------------------------------------------------------------
create temp view _expected_groups as
select po.id as option_id, po.product_id, po.position, p.restaurant_id, po.name,
       case when po.required then 1 else 0 end as min_select,
       greatest((select count(*) from public.product_option_values v
                 where v.product_option_id = po.id and v.active and v.price_modifier >= 0), 1)::int as max_select
from public.product_options po
join public.products p on p.id = po.product_id
where po.active;

create temp view _expected_options as
select v.id as value_id, v.product_option_id, v.name, v.price_modifier, v.position
from public.product_option_values v
join public.product_options po on po.id = v.product_option_id
where v.active and po.active and v.price_modifier >= 0;

insert into _r (test, ok, detail)
select 'S01a un grupo por cada product_options activo (y ninguno de más)',
       (select count(*) from public.modifier_groups where legacy_option_id is not null)
         = (select count(*) from _expected_groups),
       format('%s grupos legacy / %s product_options activos',
              (select count(*) from public.modifier_groups where legacy_option_id is not null),
              (select count(*) from _expected_groups));

insert into _r (test, ok, detail)
select 'S01b nombre, restaurante, min_select (required) y max_select (cantidad de opciones) correctos',
       count(*) = 0, count(*) || ' grupos distintos de lo esperado'
from _expected_groups e
left join public.modifier_groups g on g.legacy_option_id = e.option_id
where g.id is null
   or g.restaurant_id <> e.restaurant_id
   or g.name <> e.name
   or g.min_select <> e.min_select
   or g.max_select <> e.max_select
   or g.allow_repeat
   or g.internal_label is not null;

insert into _r (test, ok, detail)
select 'S01c cada grupo legacy vinculado solo a su producto, con su position',
       count(*) = 0, count(*) || ' grupos sin el vínculo esperado'
from _expected_groups e
join public.modifier_groups g on g.legacy_option_id = e.option_id
where not exists (select 1 from public.product_modifier_groups b
                  where b.group_id = g.id and b.product_id = e.product_id and b.position = e.position)
   or (select count(*) from public.product_modifier_groups b where b.group_id = g.id) <> 1;

insert into _r (test, ok, detail)
select 'S01d una opción por valor activo con price_modifier >= 0 (nombre, precio, position, grupo)',
       (select count(*) from public.modifier_options where legacy_value_id is not null)
         = (select count(*) from _expected_options)
       and not exists (
         select 1 from _expected_options e
         left join public.modifier_options o on o.legacy_value_id = e.value_id
         left join public.modifier_groups g on g.id = o.group_id
         where o.id is null or o.name <> e.name or o.price <> e.price_modifier
            or o.position <> e.position or g.legacy_option_id <> e.product_option_id),
       format('%s opciones legacy / %s valores migrables; %s valores con price_modifier < 0 sin migrar',
              (select count(*) from public.modifier_options where legacy_value_id is not null),
              (select count(*) from _expected_options),
              (select count(*) from public.product_option_values where price_modifier < 0));

-- ---------------------------------------------------------------------------
-- S02 · sincronía con escrituras legacy (como service_role)
-- ---------------------------------------------------------------------------
set local role service_role;

do $$
declare
  v_r   uuid := (select v from _ctx where k = 'restaurant');
  v_p   uuid;
  v_o   uuid;
  v_a   uuid;
  v_b   uuid;
  v_neg uuid;
  v_g   uuid;
  v_min int;
  v_max int;
  v_cnt int;
  v_upd timestamptz;
  v_txt text;
begin
  insert into public.products (restaurant_id, name, price)
  values (v_r, 'QA M01-T03 producto', 2.50) returning id into v_p;
  insert into _ctx values ('product', v_p);

  -- Alta de un product_options obligatorio, todavía sin valores.
  insert into public.product_options (product_id, name, type, required, position)
  values (v_p, 'Elige tu salsa', 'single', true, 3) returning id into v_o;
  insert into _ctx values ('option', v_o);

  select g.id, g.min_select, g.max_select into v_g, v_min, v_max
  from public.modifier_groups g where g.legacy_option_id = v_o;
  insert into _r (test, ok, detail) values
    ('S02a product_options nuevo crea su grupo (min 1, max 1) y su vínculo',
     v_g is not null and v_min = 1 and v_max = 1
       and exists (select 1 from public.product_modifier_groups b
                   where b.group_id = v_g and b.product_id = v_p and b.position = 3)
       and (select restaurant_id from public.modifier_groups where id = v_g) = v_r,
     format('grupo %s min %s max %s', v_g, v_min, v_max));

  select updated_at into v_upd from public.product_options where id = v_o;

  -- Valores: dos migrables y uno negativo que no se migra.
  insert into public.product_option_values (product_option_id, name, price_modifier, position)
  values (v_o, 'Ají', 0.50, 1) returning id into v_a;
  insert into public.product_option_values (product_option_id, name, price_modifier, position)
  values (v_o, 'Mayonesa', 0, 2) returning id into v_b;
  insert into public.product_option_values (product_option_id, name, price_modifier, position)
  values (v_o, 'Sin salsa (descuento)', -0.25, 3) returning id into v_neg;

  select g.max_select, (select count(*) from public.modifier_options o where o.group_id = g.id)
  into v_max, v_cnt from public.modifier_groups g where g.legacy_option_id = v_o;
  insert into _r (test, ok, detail) values
    ('S02b valores nuevos crean opciones; max_select = 2; el negativo no se migra',
     v_max = 2 and v_cnt = 2
       and not exists (select 1 from public.modifier_options where legacy_value_id = v_neg)
       and (select price from public.modifier_options where legacy_value_id = v_a) = 0.50,
     format('max %s, %s opciones', v_max, v_cnt));

  insert into _r (test, ok, detail) values
    ('S02c la sincronía no toca updated_at de product_options',
     (select updated_at from public.product_options where id = v_o) = v_upd, '');

  -- Cambio de nombre/precio/posición de un valor.
  update public.product_option_values set name = 'Ají casero', price_modifier = 0.75, position = 5 where id = v_a;
  select o.name || '|' || o.price || '|' || o.position into v_txt
  from public.modifier_options o where o.legacy_value_id = v_a;
  insert into _r (test, ok, detail) values
    ('S02d cambio de un valor se refleja en su opción', v_txt = 'Ají casero|0.75|5', coalesce(v_txt, 'null'));

  -- Desactivar un valor: se quita la opción y baja max_select.
  update public.product_option_values set active = false where id = v_b;
  select g.max_select, (select count(*) from public.modifier_options o where o.group_id = g.id)
  into v_max, v_cnt from public.modifier_groups g where g.legacy_option_id = v_o;
  insert into _r (test, ok, detail) values
    ('S02e valor desactivado: opción quitada, max_select = 1', v_max = 1 and v_cnt = 1,
     format('max %s, %s opciones', v_max, v_cnt));

  -- Reactivar y luego borrar el valor.
  update public.product_option_values set active = true where id = v_b;
  delete from public.product_option_values where id = v_b;
  select g.max_select, (select count(*) from public.modifier_options o where o.group_id = g.id)
  into v_max, v_cnt from public.modifier_groups g where g.legacy_option_id = v_o;
  insert into _r (test, ok, detail) values
    ('S02f valor borrado: opción borrada, max_select = 1', v_max = 1 and v_cnt = 1,
     format('max %s, %s opciones', v_max, v_cnt));

  -- Un valor negativo que pasa a >= 0 se migra.
  update public.product_option_values set price_modifier = 0 where id = v_neg;
  select g.max_select into v_max from public.modifier_groups g where g.legacy_option_id = v_o;
  insert into _r (test, ok, detail) values
    ('S02g valor que deja de ser negativo se migra',
     v_max = 2 and exists (select 1 from public.modifier_options where legacy_value_id = v_neg), format('max %s', v_max));

  -- required -> false y cambio de nombre/posición del product_options.
  update public.product_options set required = false, name = 'Salsas', position = 7 where id = v_o;
  select g.min_select || '|' || g.name || '|' || b.position into v_txt
  from public.modifier_groups g join public.product_modifier_groups b on b.group_id = g.id
  where g.legacy_option_id = v_o;
  insert into _r (test, ok, detail) values
    ('S02h required=false, nombre y position se reflejan', v_txt = '0|Salsas|7', coalesce(v_txt, 'null'));

  -- Desactivar el product_options: el grupo desaparece; reactivarlo lo recrea.
  update public.product_options set active = false where id = v_o;
  insert into _r (test, ok, detail) values
    ('S02i product_options desactivado: grupo, opciones y vínculo desaparecen',
     not exists (select 1 from public.modifier_groups where legacy_option_id = v_o)
       and not exists (select 1 from public.modifier_options where legacy_value_id in (v_a, v_neg)), '');

  update public.product_options set active = true where id = v_o;
  select g.max_select, (select count(*) from public.modifier_options o where o.group_id = g.id)
  into v_max, v_cnt from public.modifier_groups g where g.legacy_option_id = v_o;
  insert into _r (test, ok, detail) values
    ('S02j product_options reactivado: se recrea con sus 2 opciones', v_max = 2 and v_cnt = 2,
     format('max %s, %s opciones', v_max, v_cnt));

  -- Un segundo product_options para S08 y luego borrar el primero.
  insert into public.product_options (product_id, name, type, required, position)
  values (v_p, 'Extras', 'multiple', false, 1) returning id into v_o;
  insert into public.product_option_values (product_option_id, name, price_modifier, position)
  values (v_o, 'Queso', 1.00, 1);
  insert into _ctx values ('option2', v_o);

  delete from public.product_options where id = (select v from _ctx where k = 'option');
  insert into _r (test, ok, detail) values
    ('S02k product_options borrado: su grupo se borra en cascada',
     not exists (select 1 from public.modifier_groups where legacy_option_id = (select v from _ctx where k = 'option'))
       and (select count(*) from public.product_modifier_groups where product_id = v_p) = 1, '');
exception when others then
  insert into _r (test, ok, detail) values ('S02 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S03 · CHECK de min/max y precio
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_g uuid;
  v_case record;
begin
  for v_case in
    select * from (values ('S03a min_select > max_select se rechaza', 3, 2),
                          ('S03b max_select = 0 se rechaza', 0, 0),
                          ('S03c min_select < 0 se rechaza', -1, 1)) as t(label, mn, mx)
  loop
    begin
      insert into public.modifier_groups (restaurant_id, name, min_select, max_select)
      values (v_r, 'QA M01-T03 check', v_case.mn, v_case.mx);
      insert into _r (test, ok, detail) values (v_case.label, false, 'insertó');
    exception when others then
      insert into _r (test, ok, detail) values (v_case.label, sqlstate = '23514', sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  insert into public.modifier_groups (restaurant_id, name, min_select, max_select)
  values (v_r, 'QA M01-T03 ok', 0, 1) returning id into v_g;
  insert into _ctx values ('free_group', v_g);

  begin
    insert into public.modifier_options (group_id, name, price) values (v_g, 'Negativa', -0.01);
    insert into _r (test, ok, detail) values ('S03d precio negativo se rechaza', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('S03d precio negativo se rechaza', sqlstate = '23514', sqlstate || ' ' || sqlerrm);
  end;

  insert into public.modifier_options (group_id, name, price) values (v_g, 'Gratis', 0);
  insert into _r (test, ok, detail) values ('S03e precio 0 y grupo opcional (0..1) se aceptan', true, '');
exception when others then
  insert into _r (test, ok, detail) values ('S03 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- S04 · puente sin mezclar restaurantes; nada cambia de padre
-- ---------------------------------------------------------------------------
do $$
declare
  v_r  uuid := (select v from _ctx where k = 'restaurant');
  v_g  uuid := (select v from _ctx where k = 'free_group');
  v_lg uuid := (select id from public.modifier_groups where legacy_option_id = (select v from _ctx where k = 'option2'));
  v_fo uuid := (select po.id from public.product_options po join public.products p on p.id = po.product_id
                where p.restaurant_id <> (select v from _ctx where k = 'restaurant') limit 1);
begin
  begin
    insert into public.product_modifier_groups (product_id, group_id)
    values ((select v from _ctx where k = 'foreign_product'), v_g);
    insert into _r (test, ok, detail) values ('S04a producto de otro restaurante con grupo de monky-qa se rechaza', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('S04a producto de otro restaurante con grupo de monky-qa se rechaza', sqlstate = '23503', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.modifier_groups set restaurant_id = gen_random_uuid() where id = v_g;
    insert into _r (test, ok, detail) values ('S04b modifier_groups.restaurant_id no cambia', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values ('S04b modifier_groups.restaurant_id no cambia', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.modifier_options set group_id = v_lg where group_id = v_g;
    insert into _r (test, ok, detail) values ('S04c modifier_options.group_id no cambia', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values ('S04c modifier_options.group_id no cambia', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.product_modifier_groups set group_id = v_g where group_id = v_lg;
    insert into _r (test, ok, detail) values ('S04d product_modifier_groups.group_id no cambia', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values ('S04d product_modifier_groups.group_id no cambia', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.product_modifier_groups set product_id = (select v from _ctx where k = 'foreign_product') where group_id = v_lg;
    insert into _r (test, ok, detail) values ('S04e product_modifier_groups.product_id no cambia', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values ('S04e product_modifier_groups.product_id no cambia', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.modifier_groups set legacy_option_id = null where id = v_lg;
    insert into _r (test, ok, detail) values ('S04f legacy_option_id no cambia', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values ('S04f legacy_option_id no cambia', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  if v_fo is null then
    insert into _r (test, ok, detail) values
      ('S04g legacy_option_id de otro restaurante se rechaza', true, 'sin product_options ajenos: no aplica');
  else
    begin
      insert into public.modifier_groups (restaurant_id, name, legacy_option_id) values (v_r, 'QA M01-T03 robo', v_fo);
      insert into _r (test, ok, detail) values ('S04g legacy_option_id de otro restaurante se rechaza', false, 'insertó');
    exception when others then
      insert into _r (test, ok, detail) values
        ('S04g legacy_option_id de otro restaurante se rechaza', sqlstate = '23503', sqlstate || ' ' || sqlerrm);
    end;
  end if;
exception when others then
  insert into _r (test, ok, detail) values ('S04 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- S05 · "Sin usar" = grupo sin vínculos
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'S05 el grupo sin vínculos aparece en "Sin usar" y el vinculado no',
       (select v from _ctx where k = 'free_group') = any (array_agg(g.id))
       and not ((select id from public.modifier_groups where legacy_option_id = (select v from _ctx where k = 'option2'))
                = any (array_agg(g.id))),
       count(*) || ' grupos sin usar en monky-qa'
from public.modifier_groups g
where g.restaurant_id = (select v from _ctx where k = 'restaurant')
  and not exists (select 1 from public.product_modifier_groups b where b.group_id = g.id);

-- Conteos de control (como postgres).
insert into _n values
  ('foreign_groups',  (select count(*) from public.modifier_groups where restaurant_id <> (select v from _ctx where k = 'restaurant'))),
  ('foreign_options', (select count(*) from public.modifier_options o join public.modifier_groups g on g.id = o.group_id
                       where g.restaurant_id <> (select v from _ctx where k = 'restaurant'))),
  ('foreign_links',   (select count(*) from public.product_modifier_groups b join public.modifier_groups g on g.id = b.group_id
                       where g.restaurant_id <> (select v from _ctx where k = 'restaurant'))),
  ('qa_groups',  (select count(*) from public.modifier_groups where restaurant_id = (select v from _ctx where k = 'restaurant'))),
  ('qa_options', (select count(*) from public.modifier_options o join public.modifier_groups g on g.id = o.group_id
                  where g.restaurant_id = (select v from _ctx where k = 'restaurant'))),
  ('qa_links',   (select count(*) from public.product_modifier_groups b join public.modifier_groups g on g.id = b.group_id
                  where g.restaurant_id = (select v from _ctx where k = 'restaurant')));

-- ---------------------------------------------------------------------------
-- S06 / S07 · OWNER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_g uuid;
  v_a bigint; v_b bigint; v_c bigint;
begin
  select count(*) into v_a from public.modifier_groups where restaurant_id <> v_r;
  select count(*) into v_b from public.modifier_options o
    where not exists (select 1 from public.modifier_groups g where g.id = o.group_id and g.restaurant_id = v_r);
  select count(*) into v_c from public.product_modifier_groups b
    where not exists (select 1 from public.modifier_groups g where g.id = b.group_id and g.restaurant_id = v_r);
  insert into _r (test, ok, detail) values
    ('S06a OWNER ve 0 grupos, opciones y vínculos de otros restaurantes', v_a = 0 and v_b = 0 and v_c = 0,
     format('visibles %s/%s grupos, %s/%s opciones, %s/%s vínculos ajenos',
            v_a, (select n from _n where k = 'foreign_groups'), v_b, (select n from _n where k = 'foreign_options'),
            v_c, (select n from _n where k = 'foreign_links')));

  insert into public.modifier_groups (restaurant_id, name, internal_label, min_select, max_select, allow_repeat)
  values (v_r, 'Elige hasta 3 toppings', 'Toppings helado', 0, 3, true) returning id into v_g;
  insert into public.modifier_options (group_id, name, price, position) values (v_g, 'Chispas', 0.30, 1);
  insert into public.product_modifier_groups (product_id, group_id, position)
  values ((select v from _ctx where k = 'product'), v_g, 2);
  update public.modifier_groups set name = 'Elige hasta 3' where id = v_g;
  insert into _r (test, ok, detail) values ('S07a OWNER crea grupo, opción y vínculo, y edita', true, '');

  begin
    insert into public.product_modifier_groups (product_id, group_id)
    values ((select v from _ctx where k = 'foreign_product'), v_g);
    insert into _r (test, ok, detail) values ('S07b OWNER no vincula su grupo a un producto ajeno', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('S07b OWNER no vincula su grupo a un producto ajeno', sqlstate in ('23503', '42501'), sqlstate || ' ' || sqlerrm);
  end;
exception when others then
  insert into _r (test, ok, detail) values ('S07 OWNER bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

update _n set n = (select count(*) from public.modifier_groups where restaurant_id = (select v from _ctx where k = 'restaurant'))
where k = 'qa_groups';
update _n set n = (select count(*) from public.modifier_options o join public.modifier_groups g on g.id = o.group_id
                   where g.restaurant_id = (select v from _ctx where k = 'restaurant'))
where k = 'qa_options';
update _n set n = (select count(*) from public.product_modifier_groups b join public.modifier_groups g on g.id = b.group_id
                   where g.restaurant_id = (select v from _ctx where k = 'restaurant'))
where k = 'qa_links';

-- ---------------------------------------------------------------------------
-- S06 / S07 · WAITER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_g uuid := (select v from _ctx where k = 'free_group');
  v_n bigint; v_a bigint; v_b bigint; v_c bigint;
begin
  select count(*) into v_a from public.modifier_groups where restaurant_id <> v_r;
  select count(*) into v_b from public.modifier_options o
    where not exists (select 1 from public.modifier_groups g where g.id = o.group_id and g.restaurant_id = v_r);
  select count(*) into v_c from public.product_modifier_groups b
    where not exists (select 1 from public.modifier_groups g where g.id = b.group_id and g.restaurant_id = v_r);
  insert into _r (test, ok, detail) values
    ('S06b WAITER ve 0 grupos, opciones y vínculos de otros restaurantes', v_a = 0 and v_b = 0 and v_c = 0,
     format('visibles %s grupos, %s opciones, %s vínculos ajenos', v_a, v_b, v_c));

  select count(*) into v_n from public.modifier_groups where restaurant_id = v_r;
  select count(*) into v_a from public.modifier_options o join public.modifier_groups g on g.id = o.group_id where g.restaurant_id = v_r;
  insert into _r (test, ok, detail) values
    ('S07c WAITER lee los grupos y opciones de su restaurante',
     v_n = (select n from _n where k = 'qa_groups') and v_a = (select n from _n where k = 'qa_options') and v_n > 0,
     format('%s grupos, %s opciones', v_n, v_a));

  begin
    insert into public.modifier_groups (restaurant_id, name) values (v_r, 'QA M01-T03 waiter');
    insert into _r (test, ok, detail) values ('S07d WAITER no inserta en modifier_groups', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('S07d WAITER no inserta en modifier_groups', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.modifier_options (group_id, name) values (v_g, 'QA waiter');
    insert into _r (test, ok, detail) values ('S07e WAITER no inserta en modifier_options', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('S07e WAITER no inserta en modifier_options', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.product_modifier_groups (product_id, group_id) values ((select v from _ctx where k = 'product'), v_g);
    insert into _r (test, ok, detail) values ('S07f WAITER no inserta en product_modifier_groups', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('S07f WAITER no inserta en product_modifier_groups', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  update public.modifier_groups set name = 'hackeado' where restaurant_id = v_r;
  get diagnostics v_a = row_count;
  update public.modifier_options set price = 99 where group_id in (select id from public.modifier_groups where restaurant_id = v_r);
  get diagnostics v_b = row_count;
  update public.product_modifier_groups set position = 99 where group_id in (select id from public.modifier_groups where restaurant_id = v_r);
  get diagnostics v_c = row_count;
  insert into _r (test, ok, detail) values
    ('S07g WAITER no actualiza grupos, opciones ni vínculos', v_a = 0 and v_b = 0 and v_c = 0,
     format('%s/%s/%s filas', v_a, v_b, v_c));

  delete from public.product_modifier_groups where group_id in (select id from public.modifier_groups where restaurant_id = v_r);
  get diagnostics v_c = row_count;
  delete from public.modifier_options where group_id in (select id from public.modifier_groups where restaurant_id = v_r);
  get diagnostics v_b = row_count;
  delete from public.modifier_groups where restaurant_id = v_r;
  get diagnostics v_a = row_count;
  insert into _r (test, ok, detail) values
    ('S07h WAITER no borra grupos, opciones ni vínculos', v_a = 0 and v_b = 0 and v_c = 0,
     format('%s/%s/%s filas', v_a, v_b, v_c));
exception when others then
  insert into _r (test, ok, detail) values ('S07 WAITER bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S07i lo de monky-qa sigue intacto tras los intentos del WAITER',
       (select count(*) from public.modifier_groups where restaurant_id = (select v from _ctx where k = 'restaurant')) = (select n from _n where k = 'qa_groups')
       and (select count(*) from public.modifier_options o join public.modifier_groups g on g.id = o.group_id
            where g.restaurant_id = (select v from _ctx where k = 'restaurant')) = (select n from _n where k = 'qa_options')
       and (select count(*) from public.product_modifier_groups b join public.modifier_groups g on g.id = b.group_id
            where g.restaurant_id = (select v from _ctx where k = 'restaurant')) = (select n from _n where k = 'qa_links')
       and not exists (select 1 from public.modifier_groups where name = 'hackeado')
       and not exists (select 1 from public.modifier_options where price = 99),
       format('%s grupos, %s opciones, %s vínculos', (select n from _n where k = 'qa_groups'),
              (select n from _n where k = 'qa_options'), (select n from _n where k = 'qa_links'));

-- ---------------------------------------------------------------------------
-- S07 · anon no lee
-- ---------------------------------------------------------------------------
select set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  v_t text;
begin
  foreach v_t in array array['modifier_groups', 'modifier_options', 'product_modifier_groups'] loop
    begin
      execute format('select 1 from public.%I limit 1', v_t);
      insert into _r (test, ok, detail) values ('S07j anon no lee ' || v_t, false, 'leyó');
    exception when others then
      insert into _r (test, ok, detail) values ('S07j anon no lee ' || v_t, sqlstate = '42501', sqlstate || ' ' || sqlerrm);
    end;
  end loop;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S08 · pedido de staff con opciones: cobra igual que antes
-- (las RPC de pedido no leen personalizaciones: unit_price = products.price)
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_order uuid;
  v_total numeric;
  v_unit  numeric;
  v_opts  bigint;
begin
  v_order := public.create_staff_order(
    (select v from _ctx where k = 'table'),
    jsonb_build_array(jsonb_build_object(
      'product_id', (select v from _ctx where k = 'product'),
      'quantity', 2,
      'notes', 'QA M01-T03',
      'options', jsonb_build_array(jsonb_build_object(
        'group_id', (select id from public.modifier_groups where legacy_option_id = (select v from _ctx where k = 'option2')),
        'option', 'Queso')))),
    'QA M01-T03 pedido de prueba',
    gen_random_uuid());
  insert into _ctx values ('order', v_order);
exception when others then
  insert into _r (test, ok, detail) values ('S08 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S08 pedido de staff con opciones cobra 2 × 2.50 = 5.00 (igual que antes)',
       o.total = 5.00 and o.subtotal = 5.00 and oi.unit_price = 2.50 and oi.subtotal = 5.00
       and not exists (select 1 from public.order_item_options x where x.order_item_id = oi.id),
       format('total %s, unit %s', o.total, oi.unit_price)
from public.orders o
join public.order_items oi on oi.order_id = o.id
where o.id = (select v from _ctx where k = 'order');

insert into _r (test, ok, detail)
select 'S08 se creó el pedido de prueba', exists (select 1 from public.orders where id = (select v from _ctx where k = 'order')), '';

-- ---------------------------------------------------------------------------
-- S09 · borrar un producto como OWNER (flujo de deleteProduct en
-- src/lib/actions/menu.ts). El borrado en cascada llega a product_options y
-- product_option_values y dispara la sincronía, sobre la que authenticated no
-- tiene EXECUTE. Producto propio (product_del), sin pedidos, para no depender
-- de la FK de order_items que crea S08.
-- ---------------------------------------------------------------------------
set local role service_role;

do $$
declare
  v_p uuid;
  v_o uuid;
  v_v uuid;
begin
  insert into public.products (restaurant_id, name, price)
  values ((select v from _ctx where k = 'restaurant'), 'QA M01-T03 producto a borrar', 1.75) returning id into v_p;
  insert into public.product_options (product_id, name, type, required, position)
  values (v_p, 'Elige tu bebida', 'single', true, 1) returning id into v_o;
  insert into public.product_option_values (product_option_id, name, price_modifier, position)
  values (v_o, 'Limonada', 0.40, 1) returning id into v_v;
  insert into _ctx values ('product_del', v_p), ('option_del', v_o), ('value_del', v_v),
    ('group_del', (select id from public.modifier_groups where legacy_option_id = v_o));
exception when others then
  insert into _r (test, ok, detail) values ('S09 preparación', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S09a product_del tiene su grupo espejo, su opción y su vínculo antes de borrarlo',
       (select v from _ctx where k = 'group_del') is not null
       and exists (select 1 from public.modifier_options where legacy_value_id = (select v from _ctx where k = 'value_del'))
       and exists (select 1 from public.product_modifier_groups
                   where product_id = (select v from _ctx where k = 'product_del')
                     and group_id = (select v from _ctx where k = 'group_del')),
       format('grupo %s', (select v from _ctx where k = 'group_del'));

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_p uuid := (select v from _ctx where k = 'product_del');
  v_g uuid := (select v from _ctx where k = 'free_group');
  v_n bigint;
begin
  -- Un grupo libre del OWNER también vinculado a product_del: debe sobrevivir.
  insert into public.product_modifier_groups (product_id, group_id, position) values (v_p, v_g, 2);

  begin
    delete from public.products where id = v_p;
    get diagnostics v_n = row_count;
    insert into _r (test, ok, detail) values
      ('S09b OWNER borra product_del sin error y borra 1 fila', v_n = 1, v_n || ' filas');
  exception when others then
    insert into _r (test, ok, detail) values
      ('S09b OWNER borra product_del sin error y borra 1 fila', false, sqlstate || ' ' || sqlerrm);
  end;
exception when others then
  insert into _r (test, ok, detail) values ('S09 OWNER bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'S09c desaparecen el producto, su product_options, su valor, su grupo espejo, sus opciones y sus vínculos',
       not exists (select 1 from public.products where id = (select v from _ctx where k = 'product_del'))
       and not exists (select 1 from public.product_options where id = (select v from _ctx where k = 'option_del'))
       and not exists (select 1 from public.product_option_values where id = (select v from _ctx where k = 'value_del'))
       and not exists (select 1 from public.modifier_groups
                       where legacy_option_id = (select v from _ctx where k = 'option_del')
                          or id = (select v from _ctx where k = 'group_del'))
       and not exists (select 1 from public.modifier_options
                       where legacy_value_id = (select v from _ctx where k = 'value_del')
                          or group_id = (select v from _ctx where k = 'group_del'))
       and not exists (select 1 from public.product_modifier_groups
                       where product_id = (select v from _ctx where k = 'product_del')
                          or group_id = (select v from _ctx where k = 'group_del')),
       '';

insert into _r (test, ok, detail)
select 'S09d el grupo libre vinculado a product_del sobrevive, sin vínculos ("Sin usar")',
       exists (select 1 from public.modifier_groups where id = (select v from _ctx where k = 'free_group'))
       and not exists (select 1 from public.product_modifier_groups where group_id = (select v from _ctx where k = 'free_group')),
       '';

select n, test, ok, detail from _r order by n;

rollback;
