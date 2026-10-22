-- M03-T01 · Ejecutar como postgres DESPUÉS de la migración, solo en local/QA.
-- Todo dato de negocio se crea/edita exclusivamente dentro de monky-qa y se
-- revierte. No necesita miembros preexistentes ni credenciales reales.
-- Para probar el backfill original (antes/después de aplicar la migración),
-- el harness debe además guardar los qr_token antes de ejecutar el DDL.
-- Aquí se verifica el resultado y se repite el backfill con una alta legacy.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m03_results (test text primary key, ok boolean not null) on commit drop;
create temp table _m03_ctx (k text primary key, v uuid not null) on commit drop;
grant select, insert on _m03_results to authenticated, anon;
grant select on _m03_ctx to authenticated, anon;

create function pg_temp.m03_assert(p_test text, p_ok boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_ok is distinct from true then
    raise exception 'M03 falló: %', p_test;
  end if;
  insert into pg_temp._m03_results values (p_test, true);
end;
$$;

grant execute on function pg_temp.m03_assert(text, boolean) to authenticated, anon;

do $$
declare
  v_restaurant uuid;
begin
  select id into v_restaurant from public.restaurants where slug = 'monky-qa';
  if v_restaurant is null then
    raise exception 'Se requiere monky-qa; nunca ejecutar contra otro restaurante';
  end if;
  insert into _m03_ctx values
    ('restaurant', v_restaurant), ('owner', gen_random_uuid()),
    ('admin', gen_random_uuid()), ('waiter', gen_random_uuid()),
    ('kitchen', gen_random_uuid()), ('inactive', gen_random_uuid()),
    ('outsider', gen_random_uuid()), ('zone', gen_random_uuid()),
    ('legacy_table', gen_random_uuid());

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'qa-m03-' || v || '@example.invalid', now(), now()
  from _m03_ctx where k in ('owner', 'admin', 'waiter', 'kitchen', 'inactive', 'outsider');
  insert into public.profiles (id, full_name)
  select v, 'QA M03 ' || k from _m03_ctx
  where k in ('owner', 'admin', 'waiter', 'kitchen', 'inactive', 'outsider')
  on conflict (id) do nothing;
  insert into public.restaurant_members (restaurant_id, user_id, role, status)
  select v_restaurant, v,
         (case k when 'inactive' then 'OWNER' else upper(k) end)::public.member_role,
         (case k when 'inactive' then 'INACTIVE' else 'ACTIVE' end)::public.member_status
  from _m03_ctx where k in ('owner', 'admin', 'waiter', 'kitchen', 'inactive');
end;
$$;

-- Resultado del backfill inicial. Requiere mesas legacy sembradas antes del DDL.
select pg_temp.m03_assert('backfill inicial: mesas QA tienen zona del mismo restaurante',
  count(*) > 0 and bool_and(t.zone_id is not null and z.id is not null))
from public.tables t left join public.zones z on z.id = t.zone_id and z.restaurant_id = t.restaurant_id
where t.restaurant_id = (select v from _m03_ctx where k = 'restaurant');

create temp table _m03_tokens on commit drop as
select id, qr_token from public.tables
where restaurant_id = (select v from _m03_ctx where k = 'restaurant');

insert into public.zones (id, restaurant_id, name)
select (select v from _m03_ctx where k = 'zone'), v, 'QA M03 ' || v
from _m03_ctx where k = 'restaurant';

select pg_temp.m03_assert('defaults zona 7x5 y orden 0', grid_cols = 7 and grid_rows = 5 and sort_order = 0)
from public.zones where id = (select v from _m03_ctx where k = 'zone');

-- Alta con las columnas de la app anterior: sigue funcionando sin zona/plano.
insert into public.tables (id, restaurant_id, number, name)
select (select v from _m03_ctx where k = 'legacy_table'), v,
       (select coalesce(max(number), 0) + 1 from public.tables where restaurant_id = c.v),
       'QA M03 legacy'
from _m03_ctx c where k = 'restaurant';

insert into _m03_tokens select id, qr_token from public.tables
where id = (select v from _m03_ctx where k = 'legacy_table');

select pg_temp.m03_assert('alta legacy: square 1x1 y zona/posición nullable',
  shape = 'square' and width_cells = 1 and height_cells = 1
  and zone_id is null and col is null and row is null)
from public.tables where id = (select v from _m03_ctx where k = 'legacy_table');

do $$
declare
  v_pass integer;
  v_changed integer;
begin
  for v_pass in 1..2 loop
    insert into public.zones (restaurant_id, name)
    select distinct t.restaurant_id, 'Salón' from public.tables t
    where t.zone_id is null and t.restaurant_id = (select v from _m03_ctx where k = 'restaurant')
    on conflict (restaurant_id, name) do nothing;

    update public.tables t set zone_id = z.id from public.zones z
    where z.restaurant_id = t.restaurant_id and z.name = 'Salón' and t.zone_id is null
      and t.restaurant_id = (select v from _m03_ctx where k = 'restaurant');
    get diagnostics v_changed = row_count;
    perform pg_temp.m03_assert('backfill pasada ' || v_pass,
      v_changed = case v_pass when 1 then 1 else 0 end);
  end loop;
  perform pg_temp.m03_assert('backfill no duplica Salón',
    (select count(*) = 1 from public.zones where name = 'Salón'
      and restaurant_id = (select v from _m03_ctx where k = 'restaurant')));
end;
$$;

update public.tables set zone_id = (select v from _m03_ctx where k = 'zone'),
  col = 0, row = 0, shape = 'round', width_cells = 2, height_cells = 2
where id = (select v from _m03_ctx where k = 'legacy_table');

-- Rangos mínimos, par nullable, catálogo, FK y unicidad; cada fallo revierte
-- solo su subtransacción. La suite falla si el error no es el esperado.
do $$
declare
  v_case record;
  v_sqlstate text;
begin
  for v_case in select * from (values
    ('col negativa', 'tables', 'col = -1', '23514'),
    ('fila negativa', 'tables', 'row = -1', '23514'),
    ('posición incompleta', 'tables', 'col = null', '23514'),
    ('posición sin zona', 'tables', 'zone_id = null', '23514'),
    ('ancho cero', 'tables', 'width_cells = 0', '23514'),
    ('alto negativo', 'tables', 'height_cells = -1', '23514'),
    ('ancho null', 'tables', 'width_cells = null', '23502'),
    ('alto null', 'tables', 'height_cells = null', '23502'),
    ('forma inválida', 'tables', 'shape = ''triangle''', '23514'),
    ('forma null', 'tables', 'shape = null', '23502'),
    ('zona inexistente', 'tables', 'zone_id = gen_random_uuid()', '23503'),
    ('cuadrícula sin columnas', 'zones', 'grid_cols = 0', '23514'),
    ('cuadrícula sin filas', 'zones', 'grid_rows = 0', '23514'),
    ('cuadrícula null', 'zones', 'grid_cols = null', '23502'),
    ('orden negativo', 'zones', 'sort_order = -1', '23514'),
    ('nombre vacío', 'zones', 'name = ''''', '23514'),
    ('nombre espacios', 'zones', 'name = ''   ''', '23514'),
    ('nombre duplicado', 'zones', 'name = ''Salón''', '23505')
  ) as cases(label, relation, assignment, expected) loop
    v_sqlstate := null;
    begin
      execute format('update public.%I set %s where id = $1', v_case.relation, v_case.assignment)
      using (select v from _m03_ctx where k = case v_case.relation when 'tables' then 'legacy_table' else 'zone' end);
    exception when others then
      v_sqlstate := sqlstate;
    end;
    perform pg_temp.m03_assert('constraint: ' || v_case.label, v_sqlstate = v_case.expected);
  end loop;
end;
$$;

select pg_temp.m03_assert('FK compuesta aísla zona/restaurante y usa RESTRICT',
  exists (select 1 from pg_constraint where conrelid = 'public.tables'::regclass
    and conname = 'tables_zone_restaurant_fkey'
    and pg_get_constraintdef(oid) = 'FOREIGN KEY (zone_id, restaurant_id) REFERENCES zones(id, restaurant_id) ON DELETE RESTRICT'));

insert into public.table_sessions (restaurant_id, table_id)
select (select v from _m03_ctx where k = 'restaurant'), v from _m03_ctx where k = 'legacy_table';

do $$
begin
  begin
    delete from public.zones where id = (select v from _m03_ctx where k = 'zone');
    raise exception 'Se pudo borrar zona con mesa/sesión activa';
  exception when foreign_key_violation then
    perform pg_temp.m03_assert('zona con mesa/sesión activa no se borra', true);
  end;
end;
$$;

-- Ejercicio real de RLS, no solo lectura de pg_policies. Mismo restaurante QA;
-- outsider no tiene membresía en él. Ninguna prueba necesita tocar omm-siri.
do $$
declare
  v_role text;
  v_uid uuid;
  v_visible boolean;
  v_write boolean;
  v_count integer;
  v_error text;
  v_zone uuid;
begin
  foreach v_role in array array['owner','admin','waiter','kitchen','inactive','outsider'] loop
    select v into v_uid from _m03_ctx where k = v_role;
    v_visible := v_role in ('owner','admin','waiter','kitchen');
    v_write := v_role in ('owner','admin');
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    select count(*) into v_count from public.zones where id = (select v from _m03_ctx where k = 'zone');
    perform pg_temp.m03_assert(v_role || ' SELECT zona', (v_count = 1) = v_visible);
    select count(*) into v_count from public.tables where id = (select v from _m03_ctx where k = 'legacy_table');
    perform pg_temp.m03_assert(v_role || ' SELECT mesa', (v_count = 1) = v_visible);

    update public.zones set sort_order = sort_order + 1 where id = (select v from _m03_ctx where k = 'zone');
    get diagnostics v_count = row_count;
    perform pg_temp.m03_assert(v_role || ' UPDATE zona', (v_count = 1) = v_write);
    update public.tables set shape = 'square' where id = (select v from _m03_ctx where k = 'legacy_table');
    get diagnostics v_count = row_count;
    perform pg_temp.m03_assert(v_role || ' UPDATE mesa', (v_count = 1) = v_write);

    v_error := null;
    begin
      insert into public.tables (restaurant_id, number, name)
      select v,
        (select coalesce(max(number), 0) + 1 from public.tables where restaurant_id = c.v),
        'QA M03 permiso ' || v_role
      from _m03_ctx c where k = 'restaurant';
    exception when insufficient_privilege then
      v_error := sqlstate;
    end;
    perform pg_temp.m03_assert(v_role || ' INSERT mesa', (v_error is null) = v_write);

    v_error := null;
    begin
      insert into public.zones (restaurant_id, name)
      select v, 'QA M03 permiso ' || v_role from _m03_ctx where k = 'restaurant'
      returning id into v_zone;
    exception when insufficient_privilege then
      v_error := sqlstate;
    end;
    perform pg_temp.m03_assert(v_role || ' INSERT zona', (v_error is null) = v_write);
    if v_write then
      delete from public.zones where id = v_zone;
    else
      delete from public.zones where id = (select v from _m03_ctx where k = 'zone');
    end if;
    get diagnostics v_count = row_count;
    perform pg_temp.m03_assert(v_role || ' DELETE zona', (v_count = 1) = v_write);
    perform set_config('role', 'none', true);
  end loop;
end;
$$;

-- WITH CHECK no permite mover una zona a un restaurante sin membresía,
-- incluso cuando el usuario tiene permiso de edición sobre la fila original.
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from _m03_ctx where k = 'owner'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    update public.zones set restaurant_id = gen_random_uuid()
    where id = (select v from _m03_ctx where k = 'zone');
    raise exception 'UPDATE pudo reasignar restaurante';
  exception when insufficient_privilege then
    perform pg_temp.m03_assert('WITH CHECK impide cambiar tenant', true);
  end;
end;
$$;
reset role;

select pg_temp.m03_assert('authenticated no tiene TRUNCATE zones',
  not has_table_privilege('authenticated', 'public.zones', 'TRUNCATE'));
select pg_temp.m03_assert('anon sin privilegios zones/tables',
  not has_table_privilege('anon', 'public.zones', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('anon', 'public.tables', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'));

set local role anon;
do $$
declare
  v_table text;
  v_operation text;
begin
  foreach v_table in array array['zones', 'tables'] loop
    foreach v_operation in array array['select', 'insert', 'update', 'delete'] loop
      begin
        case v_operation
          when 'select' then execute format('select id from public.%I limit 1', v_table);
          when 'insert' then execute format('insert into public.%I default values', v_table);
          when 'update' then execute format('update public.%I set name = name where false', v_table);
          when 'delete' then execute format('delete from public.%I where false', v_table);
        end case;
        raise exception 'anon pudo ejecutar % sobre %', v_operation, v_table;
      exception when insufficient_privilege then
        perform pg_temp.m03_assert('anon sin ' || v_operation || ' ' || v_table, true);
      end;
    end loop;
  end loop;
end;
$$;
reset role;

select pg_temp.m03_assert('qr_token intacto tras backfill y cambios de plano',
  not exists (select 1 from _m03_tokens before left join public.tables after using (id)
    where before.qr_token is distinct from after.qr_token));

select test, ok from _m03_results order by test;
rollback;
