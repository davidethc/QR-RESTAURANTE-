-- M02-T01 · Ejecutar como postgres en local/monky-qa después de aplicar
-- 20261021150000_m02_availability.sql. Nunca apunta a omm-siri.
-- Crea roles y un tenant auxiliar solo para comprobar FKs cross-tenant;
-- ROLLBACK elimina todas las filas y el tenant auxiliar.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m02_results (test text primary key, ok boolean not null) on commit drop;
create temp table _m02_ctx (k text primary key, v uuid not null) on commit drop;
grant select, insert on _m02_results to authenticated, anon;
grant select on _m02_ctx to authenticated, anon;

create function pg_temp.m02_assert(p_test text, p_ok boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_ok is distinct from true then
    raise exception 'M02 falló: %', p_test;
  end if;
  insert into pg_temp._m02_results values (p_test, true);
end;
$$;
grant execute on function pg_temp.m02_assert(text, boolean) to authenticated, anon;

do $$
declare
  v_restaurant uuid;
  v_owner uuid;
begin
  select id into v_restaurant from public.restaurants where slug = 'monky-qa';
  if v_restaurant is null then
    raise exception 'Se requiere monky-qa; nunca ejecutar contra omm-siri';
  end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_restaurant and role = 'OWNER' and status = 'ACTIVE' limit 1;
  if v_owner is null then raise exception 'monky-qa debe tener OWNER activo'; end if;

  insert into _m02_ctx values
    ('restaurant', v_restaurant), ('owner', v_owner),
    ('admin', gen_random_uuid()), ('waiter', gen_random_uuid()),
    ('kitchen', gen_random_uuid()), ('cashier', gen_random_uuid()),
    ('inactive', gen_random_uuid()), ('outsider', gen_random_uuid()),
    ('cross_restaurant', gen_random_uuid()), ('false_product', gen_random_uuid()),
    ('cross_product', gen_random_uuid()), ('cross_group', gen_random_uuid()),
    ('owner_product', gen_random_uuid()), ('admin_product', gen_random_uuid()),
    ('waiter_product', gen_random_uuid()), ('kitchen_product', gen_random_uuid()),
    ('cashier_product', gen_random_uuid()), ('inactive_product', gen_random_uuid()),
    ('outsider_product', gen_random_uuid());

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'qa-m02-' || v || '@example.invalid', now(), now()
  from _m02_ctx where k in ('admin', 'waiter', 'kitchen', 'cashier', 'inactive', 'outsider');
  insert into public.profiles (id, full_name)
  select v, 'QA M02 ' || k from _m02_ctx
  where k in ('admin', 'waiter', 'kitchen', 'cashier', 'inactive', 'outsider')
  on conflict (id) do nothing;
  insert into public.restaurant_members (restaurant_id, user_id, role, status)
  select (select v from _m02_ctx where k = 'restaurant'), v,
         (case when k = 'inactive' then 'WAITER' else upper(k) end)::public.member_role,
         (case k when 'inactive' then 'INACTIVE' else 'ACTIVE' end)::public.member_status
  from _m02_ctx
  where k in ('admin', 'waiter', 'kitchen', 'inactive')
     or (k = 'cashier' and exists (
          select 1 from pg_enum e where e.enumtypid = 'public.member_role'::regtype
            and e.enumlabel = 'CASHIER'));

  -- A second synthetic tenant exists only inside this transaction so its item
  -- IDs can be tested against monky-qa. No existing restaurant is modified.
end;
$$;

select pg_temp.m02_assert('backfill: hay variantes del restaurante QA', count(*) > 0)
from public.availability a
where a.restaurant_id = (select v from _m02_ctx where k = 'restaurant')
  and a.item_type = 'variant';

select pg_temp.m02_assert('backfill cubre todas las variantes de QA',
  (select count(*) from public.availability a
   where a.restaurant_id = (select v from _m02_ctx where k = 'restaurant') and a.item_type = 'variant')
  =
  (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
   where p.restaurant_id = (select v from _m02_ctx where k = 'restaurant')));

select pg_temp.m02_assert('backfill cubre todas las opciones de QA',
  (select count(*) from public.availability a
   where a.restaurant_id = (select v from _m02_ctx where k = 'restaurant') and a.item_type = 'modifier_option')
  =
  (select count(*) from public.modifier_options o join public.modifier_groups g on g.id = o.group_id
   where g.restaurant_id = (select v from _m02_ctx where k = 'restaurant')));

select pg_temp.m02_assert('backfill hereda products.available=false',
  not exists (
    select 1 from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.availability a on a.item_type = 'variant' and a.item_id = v.id
      and a.restaurant_id = p.restaurant_id
    where p.restaurant_id = (select v from _m02_ctx where k = 'restaurant')
      and not p.available and a.available
  ));

select pg_temp.m02_assert('backfill hereda products.available=true',
  not exists (
    select 1 from public.product_variants v
    join public.products p on p.id = v.product_id
    join public.availability a on a.item_type = 'variant' and a.item_id = v.id
      and a.restaurant_id = p.restaurant_id
    where p.restaurant_id = (select v from _m02_ctx where k = 'restaurant')
      and p.available and not a.available
  ));

select pg_temp.m02_assert('modifier options existentes empiezan disponibles',
  not exists (select 1 from public.availability a
    where a.restaurant_id = (select v from _m02_ctx where k = 'restaurant')
      and a.item_type = 'modifier_option' and not a.available));

-- Las dos cláusulas INSERT del backfill se pueden repetir sin pisar un cambio
-- de disponibilidad hecho después de la migración.
update public.availability set available = not available
where (restaurant_id, item_type, item_id) = (
  select a.restaurant_id, a.item_type, a.item_id from public.availability a
  where a.restaurant_id = (select v from _m02_ctx where k = 'restaurant')
    and a.item_type = 'variant' limit 1
);
create temp table _m02_before_rerun on commit drop as
select restaurant_id, item_type, item_id, available from public.availability;

insert into public.availability (restaurant_id, item_type, item_id, product_id, available)
select p.restaurant_id, 'variant', v.id, p.id, p.available
from public.product_variants v join public.products p on p.id = v.product_id
on conflict (restaurant_id, item_type, item_id) do nothing;
insert into public.availability (restaurant_id, item_type, item_id, group_id, available)
select g.restaurant_id, 'modifier_option', o.id, g.id, true
from public.modifier_options o join public.modifier_groups g on g.id = o.group_id
on conflict (restaurant_id, item_type, item_id) do nothing;

select pg_temp.m02_assert('backfill repetido no altera estados existentes',
  not exists (
    (select * from _m02_before_rerun except select restaurant_id, item_type, item_id, available from public.availability)
    union all
    (select restaurant_id, item_type, item_id, available from public.availability except select * from _m02_before_rerun)
  ));

-- Las altas posteriores también reciben fila de availability.
insert into public.products (id, restaurant_id, name, price, available)
select (select v from _m02_ctx where k = 'false_product'),
       (select v from _m02_ctx where k = 'restaurant'), 'QA M02 no disponible', 1, false;

select pg_temp.m02_assert('nueva variante de producto legacy agotado hereda false',
  exists (select 1 from public.availability a
    join public.product_variants v on v.id = a.item_id
    where a.restaurant_id = (select v from _m02_ctx where k = 'restaurant')
      and a.item_type = 'variant' and v.product_id = (select v from _m02_ctx where k = 'false_product')
      and not a.available));

insert into public.restaurants (id, name, slug)
select v, 'M02 temporary test', 'm02-rollback-' || replace(v::text, '-', '')
from _m02_ctx where k = 'cross_restaurant';
insert into public.products (id, restaurant_id, name, price)
select (select v from _m02_ctx where k = 'cross_product'), v, 'M02 cross-tenant fixture', 1
from _m02_ctx where k = 'cross_restaurant';
insert into public.modifier_groups (id, restaurant_id, name)
select (select v from _m02_ctx where k = 'cross_group'), v, 'M02 cross-tenant fixture'
from _m02_ctx where k = 'cross_restaurant';
insert into public.modifier_options (group_id, name)
values ((select v from _m02_ctx where k = 'cross_group'), 'Opción cross-tenant');

-- Cada tipo debe rechazar un item real de otro tenant.
do $$
declare
  v_item uuid;
  v_type text;
  v_sqlstate text;
begin
  select id into v_item from public.product_variants
    where product_id = (select v from pg_temp._m02_ctx where k = 'cross_product') limit 1;
  v_type := 'variant';
  begin
    insert into public.availability (restaurant_id, item_type, item_id, product_id)
    values ((select v from pg_temp._m02_ctx where k = 'restaurant'), v_type, v_item,
            (select v from pg_temp._m02_ctx where k = 'cross_product'));
  exception when foreign_key_violation then v_sqlstate := sqlstate;
  end;
  perform pg_temp.m02_assert('rechaza variant de otro restaurante', v_sqlstate = '23503');

  select id into v_item from public.modifier_options
    where group_id = (select v from pg_temp._m02_ctx where k = 'cross_group') limit 1;
  v_sqlstate := null;
  begin
    insert into public.availability (restaurant_id, item_type, item_id, group_id)
    values ((select v from pg_temp._m02_ctx where k = 'restaurant'), 'modifier_option', v_item,
            (select v from pg_temp._m02_ctx where k = 'cross_group'));
  exception when foreign_key_violation then v_sqlstate := sqlstate;
  end;
  perform pg_temp.m02_assert('rechaza modifier_option de otro restaurante', v_sqlstate = '23503');
end;
$$;

-- Fixtures con ids propios para probar INSERT de cada rol sin que una
-- unicidad previa impida distinguir RLS de un duplicado.
insert into public.products (id, restaurant_id, name, price)
select c.v, (select v from _m02_ctx where k = 'restaurant'), 'QA M02 role ' || c.k, 1
from _m02_ctx c where c.k in ('owner_product','admin_product','waiter_product','kitchen_product','cashier_product','inactive_product','outsider_product');
delete from public.availability a
using public.product_variants v
where a.item_type = 'variant' and a.item_id = v.id
  and v.product_id in (select v from _m02_ctx where k in
    ('owner_product','admin_product','waiter_product','kitchen_product','cashier_product','inactive_product','outsider_product'));

-- RLS real: OWNER y ADMIN leen/escriben; WAITER activo solo lee;
-- miembro inactivo y usuario ajeno no ven filas. (La política SQL sigue el
-- contrato OWNER/ADMIN de M02-T01; el cambio operativo se resuelve en T03.)
do $$
declare
  v_role text;
  v_uid uuid;
  v_expected_read integer;
  v_expected_write boolean;
  v_seen integer;
  v_changed integer;
  v_error text;
  v_row uuid;
  v_roles text[];
begin
  -- Hoy member_role no incluye CASHIER: solo se prueba si el enum lo tiene.
  v_roles := array['owner', 'admin', 'waiter', 'kitchen', 'inactive', 'outsider'];
  if exists (select 1 from pg_enum e where e.enumtypid = 'public.member_role'::regtype
             and e.enumlabel = 'CASHIER') then
    v_roles := v_roles || 'cashier';
  end if;
  select item_id into v_row from public.availability
  where restaurant_id = (select v from pg_temp._m02_ctx where k = 'restaurant')
    and item_type = 'variant' order by item_id limit 1;

  foreach v_role in array v_roles loop
    select v into v_uid from pg_temp._m02_ctx where k = v_role;
    v_expected_read := case when v_role in ('owner','admin','waiter','kitchen','cashier') then 1 else 0 end;
    v_expected_write := v_role in ('owner','admin');
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    select count(*) into v_seen from public.availability
    where restaurant_id = (select v from pg_temp._m02_ctx where k = 'restaurant')
      and item_type = 'variant';
    perform pg_temp.m02_assert(v_role || ' SELECT solo rows activas',
      (v_seen > 0) = (v_expected_read = 1));

    update public.availability set available = available
    where restaurant_id = (select v from pg_temp._m02_ctx where k = 'restaurant')
      and item_type = 'variant' and item_id = v_row;
    get diagnostics v_changed = row_count;
    perform pg_temp.m02_assert(v_role || ' UPDATE per role', (v_changed = 1) = v_expected_write);

    v_error := null;
    v_changed := 0;
    begin
      insert into public.availability (restaurant_id, item_type, item_id, product_id)
      select p.restaurant_id, 'variant', v.id, p.id
      from public.product_variants v join public.products p on p.id = v.product_id
      where p.id = (select v from pg_temp._m02_ctx where k = v_role || '_product');
      get diagnostics v_changed = row_count;
    exception when insufficient_privilege then v_error := sqlstate;
    end;
    perform pg_temp.m02_assert(v_role || ' INSERT per role',
      (v_error is null and v_changed = 1) = v_expected_write);
    -- DELETE: quien escribe borra su fila recién insertada; el resto no puede
    -- borrar una fila existente (RLS la filtra o la política la niega: 0 filas).
    delete from public.availability
    where restaurant_id = (select v from pg_temp._m02_ctx where k = 'restaurant')
      and item_type = 'variant'
      and item_id = case when v_expected_write
        then (select id from public.product_variants
              where product_id = (select v from pg_temp._m02_ctx where k = v_role || '_product') limit 1)
        else v_row end;
    get diagnostics v_changed = row_count;
    perform pg_temp.m02_assert(v_role || ' DELETE per role', (v_changed = 1) = v_expected_write);
    perform set_config('role', 'none', true);
  end loop;
end;
$$;

select pg_temp.m02_assert('FK compuestas presentes para ambos tipos',
  (select count(*) = 4 from pg_constraint
   where conrelid = 'public.availability'::regclass and contype = 'f'
     and cardinality(conkey) = 2));
select pg_temp.m02_assert('índice de filtro por restaurante/disponibilidad',
  to_regclass('public.availability_restaurant_available_idx') is not null);
select pg_temp.m02_assert('anon no tiene permisos sobre availability',
  not has_table_privilege('anon', 'public.availability', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'));

set local role anon;
do $$
declare v_denied boolean := false;
begin
  begin
    perform 1 from public.availability limit 1;
  exception when insufficient_privilege then v_denied := true;
  end;
  perform pg_temp.m02_assert('anon no puede consultar availability', v_denied);
end;
$$;
reset role;

select test, ok from _m02_results order by test;
rollback;
