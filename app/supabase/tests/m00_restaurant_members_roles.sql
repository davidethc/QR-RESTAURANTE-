-- ---------------------------------------------------------------------------
-- Pruebas · M00-T01 restaurant_members: roles[], pin_hash, cash_register_ids,
-- email_login_enabled (migración *_restaurant_members_roles_pin.sql).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO sobre el restaurante monky-qa.
-- Se corre como postgres (MCP execute_sql o psql) DESPUÉS de aplicar la
-- migración. El último SELECT lista cada prueba con ok = true/false.
--
-- Qué demuestra:
--   T01 backfill: cada role existente quedó con su roles derivado
--       (OWNER/ADMIN -> {ADMIN}, WAITER -> {WAITER}, KITCHEN -> {KITCHEN}),
--       email_login_enabled = true y cash_register_ids vacío
--   T02 el CHECK rechaza un rol fuera del catálogo, 'SUPER_ADMIN' y NULL
--       dentro del arreglo
--   T03 insertar un miembro solo con role deriva roles; si trae roles se respeta;
--       defaults de las columnas nuevas
--   T04 cambiar role re-deriva roles; repetir el mismo role (como hace
--       update_staff_member al cambiar solo el estado) no toca roles; cambiar
--       role y roles a la vez respeta roles
--   T05 pin_hash no es legible por authenticated ni anon; el resto sí;
--       authenticated sigue sin INSERT/UPDATE directo (no puede darse roles)
--   T06 role sigue funcionando: get_my_restaurant devuelve el role,
--       add_staff_member / update_staff_member dejan roles sincronizado
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
    ('owner',  (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'OWNER'  and status = 'ACTIVE' limit 1)),
    ('waiter', (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1)),
    ('waiter_member', (select id from public.restaurant_members where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1)),
    ('u_a', gen_random_uuid()),
    ('u_b', gen_random_uuid()),
    ('u_c', gen_random_uuid()),
    ('u_rpc', gen_random_uuid());

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos de monky-qa: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;

  -- Cuentas de auth solo dentro de esta transacción (handle_new_user crea el
  -- perfil; el insert de profiles cubre el caso de que no exista el trigger).
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'qa-m00-roles-' || v || '@example.invalid', now(), now()
  from _ctx where k in ('u_a', 'u_b', 'u_c', 'u_rpc');

  insert into public.profiles (id, full_name)
  select v, 'QA M00 ' || k from _ctx where k in ('u_a', 'u_b', 'u_c', 'u_rpc')
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- T01 · backfill de las filas existentes de monky-qa
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'T01 backfill ' || x.role || ' -> ' || x.expected::text,
       count(m.id) filter (where m.roles is distinct from x.expected) = 0,
       count(m.id) || ' filas, ' || count(m.id) filter (where m.roles is distinct from x.expected) || ' distintas'
from (values ('OWNER'::public.member_role,   array['ADMIN']::text[]),
             ('ADMIN'::public.member_role,   array['ADMIN']::text[]),
             ('WAITER'::public.member_role,  array['WAITER']::text[]),
             ('KITCHEN'::public.member_role, array['KITCHEN']::text[])) as x(role, expected)
left join public.restaurant_members m
  on m.restaurant_id = (select v from _ctx where k = 'restaurant') and m.role = x.role
group by x.role, x.expected
order by x.role;

insert into _r (test, ok, detail)
select 'T01e existentes: email_login_enabled = true, cash_register_ids vacío, pin_hash null',
       count(*) > 0 and bool_and(email_login_enabled and cash_register_ids = '{}' and pin_hash is null),
       count(*) || ' filas'
from public.restaurant_members
where restaurant_id = (select v from _ctx where k = 'restaurant');

-- ---------------------------------------------------------------------------
-- T02 · CHECK del catálogo
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad text[];
begin
  foreach v_bad slice 1 in array array[
    array['ADMIN', 'DUENO'],
    array['SUPER_ADMIN', 'SUPER_ADMIN'],
    array['WAITER', null]
  ] loop
    begin
      update public.restaurant_members
         set roles = case when v_bad[1] = v_bad[2] then array[v_bad[1]] else v_bad end
       where id = (select v from _ctx where k = 'waiter_member');
      insert into _r (test, ok, detail) values
        ('T02 CHECK rechaza ' || array_to_string(v_bad, ',', 'NULL'), false, 'lo guardó');
    exception when check_violation then
      insert into _r (test, ok, detail) values
        ('T02 CHECK rechaza ' || array_to_string(v_bad, ',', 'NULL'), true, sqlerrm);
    end;
  end loop;

  begin
    update public.restaurant_members
       set roles = array['ADMIN','MEMBERS_ADMIN','BRANCH_MANAGER','MENU_MANAGER','CASHIER','WAITER','KITCHEN']
     where id = (select v from _ctx where k = 'waiter_member');
    insert into _r (test, ok, detail) values ('T02d CHECK acepta el catálogo completo', true, '');
  exception when others then
    insert into _r (test, ok, detail) values ('T02d CHECK acepta el catálogo completo', false, sqlstate || ' ' || sqlerrm);
  end;

  update public.restaurant_members set roles = '{}'
   where id = (select v from _ctx where k = 'waiter_member');
  insert into _r (test, ok, detail) values
    ('T02e un update explícito puede dejar cero roles',
     (select roles from public.restaurant_members where id = (select v from _ctx where k = 'waiter_member')) = '{}', '');
end $$;

-- ---------------------------------------------------------------------------
-- T03 · insert solo con role (lo que hacen hoy add_staff_member y la semilla)
-- ---------------------------------------------------------------------------
do $$
declare
  v_m public.restaurant_members%rowtype;
begin
  insert into public.restaurant_members (restaurant_id, user_id, role)
  values ((select v from _ctx where k = 'restaurant'), (select v from _ctx where k = 'u_a'), 'KITCHEN')
  returning * into v_m;
  insert into _ctx values ('m_a', v_m.id);
  insert into _r (test, ok, detail) values
    ('T03a insert con role KITCHEN deriva roles {KITCHEN}', v_m.roles = array['KITCHEN'], v_m.roles::text),
    ('T03b defaults: email_login_enabled true, cash_register_ids {}, pin_hash null',
     v_m.email_login_enabled and v_m.cash_register_ids = '{}' and v_m.pin_hash is null,
     v_m.email_login_enabled || ' ' || v_m.cash_register_ids::text);

  insert into public.restaurant_members (restaurant_id, user_id, role)
  values ((select v from _ctx where k = 'restaurant'), (select v from _ctx where k = 'u_b'), 'ADMIN')
  returning * into v_m;
  insert into _r (test, ok, detail) values
    ('T03c insert con role ADMIN deriva roles {ADMIN}', v_m.roles = array['ADMIN'], v_m.roles::text);

  insert into public.restaurant_members (restaurant_id, user_id, role, roles)
  values ((select v from _ctx where k = 'restaurant'), (select v from _ctx where k = 'u_c'), 'WAITER', array['CASHIER'])
  returning * into v_m;
  insert into _ctx values ('m_c', v_m.id);
  insert into _r (test, ok, detail) values
    ('T03d insert con roles explícito lo respeta', v_m.roles = array['CASHIER'], v_m.roles::text);
exception when others then
  insert into _r (test, ok, detail) values ('T03 bloque insert', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- T04 · update de role
-- ---------------------------------------------------------------------------
do $$
declare
  v_roles text[];
begin
  update public.restaurant_members set role = 'WAITER'
   where id = (select v from _ctx where k = 'm_a')
  returning roles into v_roles;
  insert into _r (test, ok, detail) values
    ('T04a KITCHEN -> WAITER re-deriva roles {WAITER}', v_roles = array['WAITER'], v_roles::text);

  update public.restaurant_members set role = 'WAITER', status = 'INACTIVE'
   where id = (select v from _ctx where k = 'm_c')
  returning roles into v_roles;
  insert into _r (test, ok, detail) values
    ('T04b mismo role (solo cambia status) conserva roles', v_roles = array['CASHIER'], v_roles::text);

  update public.restaurant_members set role = 'KITCHEN', roles = array['KITCHEN', 'CASHIER']
   where id = (select v from _ctx where k = 'm_c')
  returning roles into v_roles;
  insert into _r (test, ok, detail) values
    ('T04c role y roles a la vez: gana roles', v_roles = array['KITCHEN', 'CASHIER'], v_roles::text);
exception when others then
  insert into _r (test, ok, detail) values ('T04 bloque update', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- T05 / T06a · como OWNER autenticado
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_n int;
  v_me jsonb;
  v_m uuid;
begin
  begin
    perform pin_hash from public.restaurant_members limit 1;
    insert into _r (test, ok, detail) values ('T05a pin_hash no legible por authenticated', false, 'se pudo leer');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('T05a pin_hash no legible por authenticated', true, sqlerrm);
  end;

  begin
    select count(*) into v_n
    from (select id, restaurant_id, user_id, role, status, roles, cash_register_ids,
                 email_login_enabled, created_at, updated_at
          from public.restaurant_members) s;
    insert into _r (test, ok, detail) values ('T05b las demás columnas siguen legibles (RLS)', v_n > 0, v_n || ' filas visibles');
  exception when others then
    insert into _r (test, ok, detail) values ('T05b las demás columnas siguen legibles (RLS)', false, sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.restaurant_members set roles = array['ADMIN']
     where user_id = (select v from _ctx where k = 'owner');
    insert into _r (test, ok, detail) values ('T05g authenticated no escribe roles directo (UPDATE)', false, 'actualizó');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('T05g authenticated no escribe roles directo (UPDATE)', true, sqlerrm);
  end;

  begin
    insert into public.restaurant_members (restaurant_id, user_id, role, roles)
    values ((select v from _ctx where k = 'restaurant'), (select v from _ctx where k = 'u_rpc'), 'WAITER', array['ADMIN']);
    insert into _r (test, ok, detail) values ('T05h authenticated no inserta miembros directo', false, 'insertó');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('T05h authenticated no inserta miembros directo', true, sqlerrm);
  end;

  v_me := public.get_my_restaurant();
  insert into _r (test, ok, detail) values
    ('T06a get_my_restaurant del OWNER sigue devolviendo role OWNER', v_me ->> 'role' = 'OWNER', v_me ->> 'role');

  v_m := public.add_staff_member((select v from _ctx where k = 'restaurant'), (select v from _ctx where k = 'u_rpc'), 'WAITER', 'QA M00 RPC');
  insert into _ctx values ('m_rpc', v_m);

  perform public.update_staff_member(v_m, 'KITCHEN', 'ACTIVE');
exception when others then
  insert into _r (test, ok, detail) values ('T05-T06 bloque OWNER', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail) values
  ('T05c anon sin SELECT de pin_hash', not has_column_privilege('anon', 'public.restaurant_members', 'pin_hash', 'SELECT'), ''),
  ('T05d authenticated sin SELECT de pin_hash', not has_column_privilege('authenticated', 'public.restaurant_members', 'pin_hash', 'SELECT'), ''),
  ('T05e anon sin SELECT de tabla', not has_table_privilege('anon', 'public.restaurant_members', 'SELECT'), ''),
  ('T05f authenticated conserva SELECT de roles', has_column_privilege('authenticated', 'public.restaurant_members', 'roles', 'SELECT'), ''),
  ('T05i authenticated sin INSERT ni UPDATE en restaurant_members',
   not has_table_privilege('authenticated', 'public.restaurant_members', 'INSERT')
   and not has_table_privilege('authenticated', 'public.restaurant_members', 'UPDATE')
   and not has_any_column_privilege('authenticated', 'public.restaurant_members', 'INSERT')
   and not has_any_column_privilege('authenticated', 'public.restaurant_members', 'UPDATE'), '');

insert into _r (test, ok, detail)
select 'T06b add_staff_member + update_staff_member(KITCHEN) deja roles {KITCHEN}',
       coalesce((select roles = array['KITCHEN'] and role = 'KITCHEN'
                 from public.restaurant_members where id = (select v from _ctx where k = 'm_rpc')), false),
       coalesce((select role || ' ' || roles::text from public.restaurant_members where id = (select v from _ctx where k = 'm_rpc')), 'sin fila');

-- ---------------------------------------------------------------------------
-- T06c · WAITER: get_my_restaurant y user_has_restaurant_role con role
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_me jsonb;
begin
  v_me := public.get_my_restaurant();
  insert into _r (test, ok, detail) values
    ('T06c get_my_restaurant del WAITER devuelve role WAITER', v_me ->> 'role' = 'WAITER', v_me ->> 'role'),
    ('T06d user_has_restaurant_role sigue leyendo role',
     public.user_has_restaurant_role((select v from _ctx where k = 'restaurant'), 'WAITER')
     and not public.user_has_restaurant_role((select v from _ctx where k = 'restaurant'), 'OWNER'), '');
exception when others then
  insert into _r (test, ok, detail) values ('T06c bloque WAITER', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

select n, test, ok, detail from _r order by n;

rollback;
