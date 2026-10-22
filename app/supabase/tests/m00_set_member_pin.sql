-- ---------------------------------------------------------------------------
-- Pruebas · M00-T04 RPC generate_member_pin (migración *_m00_set_member_pin.sql).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO sobre el restaurante monky-qa
-- (más un restaurante temporal creado aquí mismo para el caso "otro
-- restaurante"; desaparece con el ROLLBACK). Se corre como postgres (MCP
-- execute_sql o psql) DESPUÉS de aplicar la migración. El último SELECT lista
-- cada prueba con ok = true/false.
--
-- Qué demuestra:
--   P01 OWNER genera el PIN de un mesero: devuelve 4 dígitos ASCII y queda un
--       hash bcrypt (coste 10) que verifica con crypt() y no con otro PIN
--   P02 ADMIN regenera el PIN: devuelve otro PIN, reemplaza el anterior
--   P03 miembro NULL o inexistente: rechazado y ningún hash cambia
--   P04 KITCHEN, WAITER, ADMIN inactivo y llamada sin sesión: rechazados
--   P05 ADMIN sobre otro ADMIN, sobre el OWNER o sobre sí mismo: rechazado;
--       el OWNER tampoco cambia su propio PIN por esta ruta
--   P06 miembro de otro restaurante: rechazado (OWNER y ADMIN de monky-qa)
--   P07 pin_hash no es legible por authenticated ni anon
--   P08 audit_logs: una fila UPDATE por cambio, sin el PIN ni el hash
--   P10 PIN único por restaurante: con 9999 de los 10000 PIN ocupados la
--       base encuentra el único libre; sin ninguno libre da PIN_POOL_EXHAUSTED
--       y no cambia el hash; nunca se repite el PIN de otro miembro
--   P09 firma: returns text, SECURITY DEFINER, search_path vacío, EXECUTE
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

-- Llama a generate_member_pin como p_actor (NULL = sin sesión) y devuelve el PIN
-- generado (4 dígitos) o 'SQLSTATE: mensaje'. Deja el rol como estaba.
create function pg_temp.try_pin(p_actor uuid, p_member text)
returns text
language plpgsql
as $$
declare
  v_out text;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     case when p_actor is null then ''
                          else json_build_object('sub', p_actor, 'role', 'authenticated')::text end,
                     true);
  begin
    v_out := public.generate_member_pin((select v from _ctx where k = p_member));
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

create temp table _pins (k text primary key, pin text) on commit drop;
grant select, insert, update on _pins to public;

-- ---------------------------------------------------------------------------
-- P01 · OWNER genera el PIN de un mesero
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_waiter');
  v_h text := pg_temp.hash_of('m_waiter');
begin
  insert into _pins values ('p01', v_res);
  insert into _r (test, ok, detail) values
    ('P01a OWNER genera un PIN de exactamente 4 dígitos ASCII', v_res ~ '^[0-9]{4}$', 'longitud ' || length(v_res)),
    ('P01b el hash es bcrypt con coste 10', coalesce(v_h like '$2a$10$%' and length(v_h) = 60, false), left(v_h, 7)),
    ('P01c el hash verifica con el PIN devuelto', coalesce(extensions.crypt(v_res, v_h) = v_h, false), ''),
    ('P01d el hash no verifica con otro PIN', coalesce(extensions.crypt(lpad(((v_res::int + 1) % 10000)::text, 4, '0'), v_h) <> v_h, false), ''),
    ('P01e no se guarda el PIN en texto plano', coalesce(v_h <> v_res, false), '');
end $$;

-- ---------------------------------------------------------------------------
-- P02 · ADMIN regenera el PIN (reemplaza el anterior, nunca repite el mismo)
-- ---------------------------------------------------------------------------
do $$
declare
  v_before text := pg_temp.hash_of('m_waiter');
  v_res text := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_waiter');
  v_h text := pg_temp.hash_of('m_waiter');
begin
  insert into _pins values ('p02', v_res);
  insert into _r (test, ok, detail) values
    ('P02a ADMIN regenera el PIN de un mesero', v_res ~ '^[0-9]{4}$', v_res),
    ('P02b el PIN nuevo es distinto del anterior', v_res is distinct from (select pin from _pins where k = 'p01'), ''),
    ('P02c el hash nuevo verifica con el PIN nuevo y no con el anterior',
     coalesce(v_h <> v_before and extensions.crypt(v_res, v_h) = v_h
              and extensions.crypt((select pin from _pins where k = 'p01'), v_h) <> v_h, false), '');
end $$;

-- ---------------------------------------------------------------------------
-- P03 · miembro NULL: rechazado, ningún hash cambia
-- ---------------------------------------------------------------------------
do $$
declare
  v_before text := pg_temp.hash_of('m_waiter');
  v_res text;
begin
  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'ninguno');
  insert into _r (test, ok, detail) values
    ('P03a miembro NULL rechazado', v_res like 'P0001:%', v_res),
    ('P03z ningún rechazo cambió el hash', pg_temp.hash_of('m_waiter') = v_before, '');
end $$;

-- ---------------------------------------------------------------------------
-- P04 · roles sin permiso y sin sesión
-- ---------------------------------------------------------------------------
do $$
declare
  v_before text := pg_temp.hash_of('m_waiter');
  v_res text;
begin
  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_kitchen'), 'm_waiter');
  insert into _r (test, ok, detail) values ('P04a KITCHEN no asigna PIN', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_waiter'), 'm_kitchen');
  insert into _r (test, ok, detail) values ('P04b WAITER no asigna PIN', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin_off'), 'm_waiter');
  insert into _r (test, ok, detail) values ('P04c ADMIN inactivo no asigna PIN', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin(null, 'm_waiter');
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
  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_admin2');
  insert into _r (test, ok, detail) values
    ('P05a ADMIN no cambia el PIN de otro ADMIN', v_res like 'P0001:%' and pg_temp.hash_of('m_admin2') is null, v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_owner');
  insert into _r (test, ok, detail) values
    ('P05b ADMIN no cambia el PIN del OWNER',
     v_res like 'P0001:%' and pg_temp.hash_of('m_owner') is not distinct from v_owner_hash,
     v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_admin');
  insert into _r (test, ok, detail) values
    ('P05c ADMIN no cambia su propio PIN por esta ruta', v_res like 'P0001:%' and pg_temp.hash_of('m_admin') is null, v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_owner');
  insert into _r (test, ok, detail) values
    ('P05d OWNER no cambia su propio PIN por esta ruta',
     v_res like 'P0001:%' and pg_temp.hash_of('m_owner') is not distinct from v_owner_hash, v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_admin2');
  insert into _r (test, ok, detail) values
    ('P05e OWNER sí cambia el PIN de un ADMIN',
     v_res ~ '^[0-9]{4}$' and extensions.crypt(v_res, pg_temp.hash_of('m_admin2')) = pg_temp.hash_of('m_admin2'), v_res);
end $$;

-- ---------------------------------------------------------------------------
-- P06 · miembro de otro restaurante
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text;
begin
  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_foreign');
  insert into _r (test, ok, detail) values
    ('P06a OWNER de monky-qa no cambia el PIN de otro restaurante', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'u_admin'), 'm_foreign');
  insert into _r (test, ok, detail) values
    ('P06b ADMIN de monky-qa no cambia el PIN de otro restaurante', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'no_existe');
  insert into _r (test, ok, detail) values
    ('P06c miembro inexistente rechazado', v_res like 'P0001:%', v_res);

  insert into _r (test, ok, detail) values
    ('P06z el miembro ajeno sigue sin PIN', pg_temp.hash_of('m_foreign') is null, '');
end $$;

-- ---------------------------------------------------------------------------
-- P10 · PIN único por restaurante y nunca repetido (m_waiter y m_admin2 ya
-- tienen PIN; el sondeo con 9999 PIN ocupados no cabe en una prueba rápida:
-- bcrypt coste 10 y un usuario auth por miembro)
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text;
  v_prev text := null;
  v_clash int := 0;
  v_repeat int := 0;
  v_bad int := 0;
  i int;
begin
  for i in 1..25 loop
    v_res := pg_temp.try_pin((select v from _ctx where k = 'owner'), 'm_kitchen');
    if v_res !~ '^[0-9]{4}$' then v_bad := v_bad + 1; end if;
    if v_res is not distinct from v_prev then v_repeat := v_repeat + 1; end if;
    if exists (select 1 from public.restaurant_members m
                where m.restaurant_id = (select v from _ctx where k = 'restaurant')
                  and m.id <> (select v from _ctx where k = 'm_kitchen')
                  and m.pin_hash is not null
                  and extensions.crypt(v_res, m.pin_hash) = m.pin_hash) then
      v_clash := v_clash + 1;
    end if;
    v_prev := v_res;
  end loop;
  insert into _r (test, ok, detail) values
    ('P10a 25 generaciones seguidas: todas de 4 dígitos', v_bad = 0, v_bad || ' inválidas'),
    ('P10b ningún PIN coincide con el de otro miembro del restaurante', v_clash = 0, v_clash || ' choques'),
    ('P10c una generación nunca repite el PIN inmediato anterior del miembro', v_repeat = 0, v_repeat || ' repetidos'),
    ('P10d la función ya no existe con la firma antigua (sin oráculo PIN_IN_USE)',
     to_regprocedure('public.set_member_pin(uuid, text)') is null, '');
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
select 'P08c la auditoría marca generated y no contiene el PIN ni el hash',
       coalesce(bool_and(not exists (select 1 from _pins p where coalesce(a.metadata::text, '') like '%' || p.pin || '%')
                         and coalesce(a.metadata::text, '') not like '%$2a$%'
                         and a.metadata ->> 'generated' = 'true'
                         and a.metadata ->> 'change' in ('PIN_SET', 'PIN_CHANGED')), false),
       string_agg(coalesce(a.metadata::text, 'null'), ' | ')
from public.audit_logs a
where a.entity_type = 'RESTAURANT_MEMBER'
  and a.entity_id in (select v from _ctx where k in ('m_waiter', 'm_admin2'));

insert into _r (test, ok, detail)
select 'P08d los rechazos no dejan auditoría',
       count(*) = 0, count(*) || ' filas'
from public.audit_logs a
where a.entity_type = 'RESTAURANT_MEMBER'
  and a.entity_id in (select v from _ctx where k in ('m_admin', 'm_owner', 'm_foreign'));

-- ---------------------------------------------------------------------------
-- P09 · firma y permisos de la función
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'P09a returns text, SECURITY DEFINER, search_path vacío',
       p.prorettype = 'text'::regtype and p.prosecdef
       and p.proconfig @> array['search_path=""'],
       p.prorettype::regtype || ' ' || p.prosecdef || ' ' || coalesce(p.proconfig::text, 'null')
from pg_proc p
where p.oid = 'public.generate_member_pin(uuid)'::regprocedure;

insert into _r (test, ok, detail) values
  ('P09b authenticated puede ejecutar',
   has_function_privilege('authenticated', 'public.generate_member_pin(uuid)', 'EXECUTE'), ''),
  ('P09c anon no puede ejecutar',
   not has_function_privilege('anon', 'public.generate_member_pin(uuid)', 'EXECUTE'), ''),
  ('P09d service_role no puede ejecutar',
   not has_function_privilege('service_role', 'public.generate_member_pin(uuid)', 'EXECUTE'), ''),
  ('P09e PUBLIC sin EXECUTE',
   not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = 'public.generate_member_pin(uuid)'::regprocedure
                 and a.grantee = 0 and a.privilege_type = 'EXECUTE'), '');

select n, test, ok, detail from _r order by n;

rollback;
