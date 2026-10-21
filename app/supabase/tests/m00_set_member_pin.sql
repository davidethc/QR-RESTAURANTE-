-- ---------------------------------------------------------------------------
-- Pruebas · M00-T04 RPC set_member_pin (migración *_m00_set_member_pin.sql).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO sobre el restaurante monky-qa
-- (más un restaurante temporal creado aquí mismo para el caso "otro
-- restaurante"; desaparece con el ROLLBACK). Se corre como postgres (MCP
-- execute_sql o psql) DESPUÉS de aplicar la migración. El último SELECT lista
-- cada prueba con ok = true/false.
--
-- Qué demuestra:
--   P01 OWNER asigna un PIN de 4 dígitos: queda un hash bcrypt (coste 10)
--       que verifica con crypt() y no con otro PIN
--   P02 ADMIN asigna un PIN de 6 dígitos a un mesero: reemplaza el anterior
--   P03 PIN corto, largo, no numérico, con espacios, salto de línea, dígitos
--       no ASCII, vacío o NULL: se rechaza y el hash no cambia
--   P04 KITCHEN, WAITER, ADMIN inactivo y llamada sin sesión: rechazados
--   P05 ADMIN sobre otro ADMIN, sobre el OWNER o sobre sí mismo: rechazado;
--       el OWNER tampoco cambia su propio PIN por esta ruta
--   P06 miembro de otro restaurante: rechazado (OWNER y ADMIN de monky-qa)
--   P07 pin_hash no es legible por authenticated ni anon
--   P08 audit_logs: una fila UPDATE por cambio, sin el PIN ni el hash
--   P09 firma: returns void, SECURITY DEFINER, search_path vacío, EXECUTE
--       solo para authenticated (ni anon, ni PUBLIC, ni service_role)
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
create temp table _ctx (k text primary key, v uuid) on commit drop;
grant select, insert on _r to public;
grant select, insert on _ctx to public;

-- ---------------------------------------------------------------------------
-- Contexto (monky-qa + restaurante temporal)
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid;
  v_other uuid;
  v_owner uuid;
begin
  select id into v_r from public.restaurants where slug = 'monky-qa';
  if v_r is null then
    raise exception 'No existe monky-qa: estas pruebas no corren sobre otro restaurante';
  end if;

  select user_id into v_owner
    from public.restaurant_members
   where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE'
   limit 1;

  insert into public.restaurants (name, slug)
  values ('QA M00 PIN otro', 'qa-m00-pin-' || gen_random_uuid())
  returning id into v_other;

  insert into _ctx values
    ('restaurant', v_r),
    ('other', v_other),
    ('owner', v_owner),
    ('m_owner', (select id from public.restaurant_members where restaurant_id = v_r and user_id = v_owner)),
    ('u_admin', gen_random_uuid()),
    ('u_admin2', gen_random_uuid()),
    ('u_admin_off', gen_random_uuid()),
    ('u_kitchen', gen_random_uuid()),
    ('u_waiter', gen_random_uuid()),
    ('u_foreign', gen_random_uuid());

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos de monky-qa: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'qa-m00-pin-' || v || '@example.invalid', now(), now()
  from _ctx where k like 'u\_%';

  insert into public.profiles (id, full_name)
  select v, 'QA M00 PIN ' || k from _ctx where k like 'u\_%'
  on conflict (id) do nothing;

  with x(k, role, status, rk) as (
    values ('u_admin', 'ADMIN', 'ACTIVE', 'restaurant'),
           ('u_admin2', 'ADMIN', 'ACTIVE', 'restaurant'),
           ('u_admin_off', 'ADMIN', 'INACTIVE', 'restaurant'),
           ('u_kitchen', 'KITCHEN', 'ACTIVE', 'restaurant'),
           ('u_waiter', 'WAITER', 'ACTIVE', 'restaurant'),
           ('u_foreign', 'WAITER', 'ACTIVE', 'other')
  ), ins as (
    insert into public.restaurant_members (restaurant_id, user_id, role, status)
    select (select v from _ctx where k = x.rk), (select v from _ctx where k = x.k),
           x.role::public.member_role, x.status::public.member_status
    from x
    returning id, user_id
  )
  insert into _ctx
  select 'm' || substr(c.k, 2), ins.id
  from ins join _ctx c on c.v = ins.user_id and c.k like 'u\_%';
end $$;

-- Llama a set_member_pin como p_actor (NULL = sin sesión) y devuelve 'OK' o
-- 'SQLSTATE: mensaje'. Deja el rol como estaba.
create function pg_temp.try_pin(p_actor uuid, p_member text, p_pin text)
returns text
language plpgsql
as $$
declare
  v_out text := 'OK';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     case when p_actor is null then ''
                          else json_build_object('sub', p_actor, 'role', 'authenticated')::text end,
                     true);
  begin
    perform public.set_member_pin((select v from _ctx where k = p_member), p_pin);
  exception when others then
    v_out := sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end;
$$;

create function pg_temp.hash_of(p_member text)
returns text
language sql
as $$
  select pin_hash from public.restaurant_members where id = (select v from _ctx where k = p_member);
$$;

-- ---------------------------------------------------------------------------
-- P01 · OWNER asigna PIN de 4 dígitos
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_waiter', '1234');
  v_h text := pg_temp.hash_of('m_waiter');
begin
  insert into _r (test, ok, detail) values
    ('P01a OWNER asigna PIN 1234 a un mesero', v_res = 'OK', v_res),
    ('P01b el hash es bcrypt con coste 10', coalesce(v_h like '$2a$10$%' and length(v_h) = 60, false), left(v_h, 7)),
    ('P01c el hash verifica con crypt(1234)', coalesce(extensions.crypt('1234', v_h) = v_h, false), ''),
    ('P01d el hash no verifica con otro PIN', coalesce(extensions.crypt('1235', v_h) <> v_h, false), ''),
    ('P01e no se guarda el PIN en texto plano', coalesce(v_h <> '1234', false), '');
end $$;

-- ---------------------------------------------------------------------------
-- P02 · ADMIN asigna PIN de 6 dígitos (reemplaza el anterior)
-- ---------------------------------------------------------------------------
do $$
declare
  v_before text := pg_temp.hash_of('m_waiter');
  v_res text := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_waiter', '098765');
  v_h text := pg_temp.hash_of('m_waiter');
begin
  insert into _r (test, ok, detail) values
    ('P02a ADMIN asigna PIN 098765 a un mesero', v_res = 'OK', v_res),
    ('P02b el hash nuevo verifica con 098765 y no con 1234',
     coalesce(v_h <> v_before and extensions.crypt('098765', v_h) = v_h
              and extensions.crypt('1234', v_h) <> v_h, false), '');
end $$;

-- ---------------------------------------------------------------------------
-- P03 · formato del PIN
-- ---------------------------------------------------------------------------
do $$
declare
  v_before text := pg_temp.hash_of('m_waiter');
  v_pin text;
  v_res text;
begin
  foreach v_pin in array array['123', '1234567', '12a4', 'abcd', '', ' 1234', '1234 ',
                               '12 34', E'1234\n', '-123', '1.234', '١٢٣٤', '１２３４'] loop
    v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_waiter', v_pin);
    insert into _r (test, ok, detail) values
      ('P03 rechaza PIN ' || quote_literal(v_pin), v_res like 'P0001:%', v_res);
  end loop;

  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_waiter', null);
  insert into _r (test, ok, detail) values ('P03 rechaza PIN NULL', v_res like 'P0001:%', v_res);

  insert into _r (test, ok, detail) values
    ('P03z ningún PIN inválido cambió el hash', pg_temp.hash_of('m_waiter') = v_before, '');
end $$;

-- ---------------------------------------------------------------------------
-- P04 · roles sin permiso y sin sesión
-- ---------------------------------------------------------------------------
do $$
declare
  v_before text := pg_temp.hash_of('m_waiter');
  v_res text;
begin
  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_kitchen'), 'm_waiter', '4321');
  insert into _r (test, ok, detail) values ('P04a KITCHEN no asigna PIN', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_waiter'), 'm_kitchen', '4321');
  insert into _r (test, ok, detail) values ('P04b WAITER no asigna PIN', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin_off'), 'm_waiter', '4321');
  insert into _r (test, ok, detail) values ('P04c ADMIN inactivo no asigna PIN', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin(null, 'm_waiter', '4321');
  insert into _r (test, ok, detail) values ('P04d sin sesión no asigna PIN', v_res like 'P0001:%', v_res);

  insert into _r (test, ok, detail) values
    ('P04z ningún rechazo cambió el hash', pg_temp.hash_of('m_waiter') = v_before, '');
end $$;

-- ---------------------------------------------------------------------------
-- P05 · escalada: ADMIN sobre ADMIN / OWNER / sí mismo
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text;
  v_owner_hash text := pg_temp.hash_of('m_owner');
begin
  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_admin2', '4321');
  insert into _r (test, ok, detail) values
    ('P05a ADMIN no cambia el PIN de otro ADMIN', v_res like 'P0001:%' and pg_temp.hash_of('m_admin2') is null, v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_owner', '4321');
  insert into _r (test, ok, detail) values
    ('P05b ADMIN no cambia el PIN del OWNER',
     v_res like 'P0001:%' and pg_temp.hash_of('m_owner') is not distinct from v_owner_hash,
     v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_admin', '4321');
  insert into _r (test, ok, detail) values
    ('P05c ADMIN no cambia su propio PIN por esta ruta', v_res like 'P0001:%' and pg_temp.hash_of('m_admin') is null, v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_owner', '4321');
  insert into _r (test, ok, detail) values
    ('P05d OWNER no cambia su propio PIN por esta ruta',
     v_res like 'P0001:%' and pg_temp.hash_of('m_owner') is not distinct from v_owner_hash, v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_admin2', '2468');
  insert into _r (test, ok, detail) values
    ('P05e OWNER sí cambia el PIN de un ADMIN',
     v_res = 'OK' and extensions.crypt('2468', pg_temp.hash_of('m_admin2')) = pg_temp.hash_of('m_admin2'), v_res);
end $$;

-- ---------------------------------------------------------------------------
-- P06 · miembro de otro restaurante
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text;
begin
  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_foreign', '4321');
  insert into _r (test, ok, detail) values
    ('P06a OWNER de monky-qa no cambia el PIN de otro restaurante', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_foreign', '4321');
  insert into _r (test, ok, detail) values
    ('P06b ADMIN de monky-qa no cambia el PIN de otro restaurante', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'no_existe', '4321');
  insert into _r (test, ok, detail) values
    ('P06c miembro inexistente rechazado', v_res like 'P0001:%', v_res);

  insert into _r (test, ok, detail) values
    ('P06z el miembro ajeno sigue sin PIN', pg_temp.hash_of('m_foreign') is null, '');
end $$;

-- ---------------------------------------------------------------------------
-- P07 · pin_hash no legible por la API
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform pin_hash from public.restaurant_members limit 1;
    insert into _r (test, ok, detail) values ('P07a authenticated (OWNER) no lee pin_hash', false, 'se pudo leer');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('P07a authenticated (OWNER) no lee pin_hash', true, sqlerrm);
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

insert into _r (test, ok, detail) values
  ('P07b anon sin SELECT de pin_hash', not has_column_privilege('anon', 'public.restaurant_members', 'pin_hash', 'SELECT'), ''),
  ('P07c authenticated sin SELECT de pin_hash', not has_column_privilege('authenticated', 'public.restaurant_members', 'pin_hash', 'SELECT'), ''),
  ('P07d authenticated sin UPDATE de pin_hash', not has_column_privilege('authenticated', 'public.restaurant_members', 'pin_hash', 'UPDATE'), '');

-- ---------------------------------------------------------------------------
-- P08 · auditoría
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'P08a una fila UPDATE RESTAURANT_MEMBER por cada PIN guardado al mesero',
       count(*) = 2
       and bool_and(a.action = 'UPDATE' and a.restaurant_id = (select v from _ctx where k = 'restaurant')),
       count(*) || ' filas'
from public.audit_logs a
where a.entity_type = 'RESTAURANT_MEMBER'
  and a.entity_id = (select v from _ctx where k = 'm_waiter');

insert into _r (test, ok, detail)
select 'P08b la auditoría registra quién lo hizo (OWNER y ADMIN)',
       array_agg(a.user_id order by a.user_id)
         = (select array_agg(v order by v) from _ctx where k in ('owner', 'u_admin')),
       array_agg(a.user_id)::text
from public.audit_logs a
where a.entity_type = 'RESTAURANT_MEMBER'
  and a.entity_id = (select v from _ctx where k = 'm_waiter');

insert into _r (test, ok, detail)
select 'P08c la auditoría no contiene el PIN ni el hash',
       coalesce(bool_and(coalesce(a.metadata::text, '') not like '%1234%'
                         and coalesce(a.metadata::text, '') not like '%098765%'
                         and coalesce(a.metadata::text, '') not like '%$2a$%'), false),
       string_agg(coalesce(a.metadata::text, 'null'), ' | ')
from public.audit_logs a
where a.entity_type = 'RESTAURANT_MEMBER'
  and a.entity_id in (select v from _ctx where k in ('m_waiter', 'm_admin2'));

insert into _r (test, ok, detail)
select 'P08d los rechazos no dejan auditoría',
       count(*) = 0, count(*) || ' filas'
from public.audit_logs a
where a.entity_type = 'RESTAURANT_MEMBER'
  and a.entity_id in (select v from _ctx where k in ('m_admin', 'm_owner', 'm_foreign', 'm_kitchen'));

-- ---------------------------------------------------------------------------
-- P09 · firma y permisos de la función
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'P09a returns void, SECURITY DEFINER, search_path vacío',
       p.prorettype = 'void'::regtype and p.prosecdef
       and p.proconfig @> array['search_path=""'],
       p.prorettype::regtype || ' ' || p.prosecdef || ' ' || coalesce(p.proconfig::text, 'null')
from pg_proc p
where p.oid = 'public.set_member_pin(uuid, text)'::regprocedure;

insert into _r (test, ok, detail) values
  ('P09b authenticated puede ejecutar',
   has_function_privilege('authenticated', 'public.set_member_pin(uuid, text)', 'EXECUTE'), ''),
  ('P09c anon no puede ejecutar',
   not has_function_privilege('anon', 'public.set_member_pin(uuid, text)', 'EXECUTE'), ''),
  ('P09d service_role no puede ejecutar',
   not has_function_privilege('service_role', 'public.set_member_pin(uuid, text)', 'EXECUTE'), ''),
  ('P09e PUBLIC sin EXECUTE',
   not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = 'public.set_member_pin(uuid, text)'::regprocedure
                 and a.grantee = 0 and a.privilege_type = 'EXECUTE'), '');

select n, test, ok, detail from _r order by n;

rollback;
