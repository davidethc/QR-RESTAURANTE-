-- ---------------------------------------------------------------------------
-- Pruebas · M00-T04 RPC get_staff_pin_status (migración *_m00_get_staff_pin_status.sql).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO sobre el restaurante monky-qa
-- (más un restaurante temporal creado aquí mismo para el caso "otro
-- restaurante"; desaparece con el ROLLBACK). Se corre como postgres (MCP
-- execute_sql o psql) DESPUÉS de aplicar la migración. El último SELECT lista
-- cada prueba con ok = true/false.
--
-- Qué demuestra:
--   S01 OWNER ve has_pin true para quien tiene PIN y false para quien no
--   S02 ADMIN ve lo mismo
--   S03 solo salen miembros de ese restaurante (todos ellos, ninguno ajeno)
--   S04 KITCHEN, WAITER, ADMIN inactivo y sin sesión: rechazados
--   S05 OWNER/ADMIN de monky-qa pidiendo otro restaurante: rechazados
--   S06 el resultado no expone el hash (solo member_id y has_pin)
--   S07 firma: STABLE, SECURITY DEFINER, search_path vacío, EXECUTE solo
--       para authenticated (ni anon, ni PUBLIC, ni service_role)
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
  values ('QA M00 PIN status otro', 'qa-m00-pinst-' || gen_random_uuid())
  returning id into v_other;

  insert into _ctx values
    ('restaurant', v_r),
    ('other', v_other),
    ('owner', v_owner),
    ('u_admin', gen_random_uuid()),
    ('u_admin_off', gen_random_uuid()),
    ('u_kitchen', gen_random_uuid()),
    ('u_waiter', gen_random_uuid()),
    ('u_foreign', gen_random_uuid());

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos de monky-qa: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'qa-m00-pinst-' || v || '@example.invalid', now(), now()
  from _ctx where k like 'u\_%';

  insert into public.profiles (id, full_name)
  select v, 'QA M00 PIN status ' || k from _ctx where k like 'u\_%'
  on conflict (id) do nothing;

  with x(k, role, status, rk) as (
    values ('u_admin', 'ADMIN', 'ACTIVE', 'restaurant'),
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

  -- Mesero con PIN, cocina sin PIN; el ajeno con PIN (no debe salir).
  -- Escritura directa como postgres: la prueba no depende de generate_member_pin.
  update public.restaurant_members
     set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf', 4))
   where id in ((select v from _ctx where k = 'm_waiter'), (select v from _ctx where k = 'm_foreign'));
  update public.restaurant_members
     set pin_hash = null
   where id = (select v from _ctx where k = 'm_kitchen');
end $$;

-- Llama a get_staff_pin_status como p_actor (NULL = sin sesión) para el
-- restaurante p_rest. Devuelve 'OK' o 'SQLSTATE: mensaje' y guarda las filas
-- en _out. Deja el rol como estaba.
create temp table _out (member_id uuid, has_pin boolean) on commit drop;
grant select, insert, delete on _out to public;

create function pg_temp.try_status(p_actor uuid, p_rest text)
returns text
language plpgsql
as $$
declare
  v_out text := 'OK';
begin
  delete from _out;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     case when p_actor is null then ''
                          else json_build_object('sub', p_actor, 'role', 'authenticated')::text end,
                     true);
  begin
    insert into _out
    select s.member_id, s.has_pin
      from public.get_staff_pin_status((select v from _ctx where k = p_rest)) s;
  exception when others then
    v_out := sqlstate || ': ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end;
$$;

create function pg_temp.pin_of(p_member text)
returns boolean
language sql
as $$
  select has_pin from _out where member_id = (select v from _ctx where k = p_member);
$$;

-- ---------------------------------------------------------------------------
-- S01 · OWNER
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text := pg_temp.try_status((select v from _ctx where k = 'owner'), 'restaurant');
begin
  insert into _r (test, ok, detail) values
    ('S01a OWNER puede consultar', v_res = 'OK', v_res),
    ('S01b mesero con PIN -> true', pg_temp.pin_of('m_waiter') is true, coalesce(pg_temp.pin_of('m_waiter')::text, 'null')),
    ('S01c cocina sin PIN -> false', pg_temp.pin_of('m_kitchen') is false, coalesce(pg_temp.pin_of('m_kitchen')::text, 'null')),
    ('S01d has_pin coincide con pin_hash para todo monky-qa',
     not exists (select 1 from _out o join public.restaurant_members rm on rm.id = o.member_id
                  where o.has_pin is distinct from (rm.pin_hash is not null)), '');
end $$;

-- ---------------------------------------------------------------------------
-- S02 · ADMIN
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text := pg_temp.try_status((select v from _ctx where k = 'u_admin'), 'restaurant');
begin
  insert into _r (test, ok, detail) values
    ('S02a ADMIN puede consultar', v_res = 'OK', v_res),
    ('S02b ADMIN ve mesero con PIN -> true', pg_temp.pin_of('m_waiter') is true, ''),
    ('S02c ADMIN ve cocina sin PIN -> false', pg_temp.pin_of('m_kitchen') is false, '');
end $$;

-- ---------------------------------------------------------------------------
-- S03 · alcance: todos los miembros de monky-qa y ninguno ajeno
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'S03a devuelve exactamente los miembros de monky-qa',
       (select array_agg(member_id order by member_id) from _out)
         = (select array_agg(id order by id) from public.restaurant_members
             where restaurant_id = (select v from _ctx where k = 'restaurant')),
       (select count(*) from _out) || ' filas';

insert into _r (test, ok, detail) values
  ('S03b el miembro de otro restaurante no aparece',
   not exists (select 1 from _out where member_id = (select v from _ctx where k = 'm_foreign')), '');

-- ---------------------------------------------------------------------------
-- S04 · roles sin permiso y sin sesión
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text;
begin
  v_res := pg_temp.try_status((select v from _ctx where k = 'u_kitchen'), 'restaurant');
  insert into _r (test, ok, detail) values ('S04a KITCHEN rechazado', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_status((select v from _ctx where k = 'u_waiter'), 'restaurant');
  insert into _r (test, ok, detail) values ('S04b WAITER rechazado', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_status((select v from _ctx where k = 'u_admin_off'), 'restaurant');
  insert into _r (test, ok, detail) values ('S04c ADMIN inactivo rechazado', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_status(null, 'restaurant');
  insert into _r (test, ok, detail) values ('S04d sin sesión rechazado', v_res like 'P0001:%', v_res);
end $$;

-- ---------------------------------------------------------------------------
-- S05 · otro restaurante
-- ---------------------------------------------------------------------------
do $$
declare
  v_res text;
begin
  v_res := pg_temp.try_status((select v from _ctx where k = 'owner'), 'other');
  insert into _r (test, ok, detail) values
    ('S05a OWNER de monky-qa no consulta otro restaurante', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_status((select v from _ctx where k = 'u_admin'), 'other');
  insert into _r (test, ok, detail) values
    ('S05b ADMIN de monky-qa no consulta otro restaurante', v_res like 'P0001:%', v_res);

  v_res := pg_temp.try_status((select v from _ctx where k = 'owner'), 'no_existe');
  insert into _r (test, ok, detail) values
    ('S05c restaurante NULL rechazado', v_res like 'P0001:%', v_res);
end $$;

-- ---------------------------------------------------------------------------
-- S06 · no expone el hash
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'S06a la función devuelve solo (member_id uuid, has_pin boolean)',
       p.proallargtypes = array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype]::oid[]
       and p.proargmodes = array['i', 't', 't']::"char"[]
       and p.proargnames = array['p_restaurant_id', 'member_id', 'has_pin'],
       coalesce(p.proargnames::text, 'null')
from pg_proc p
where p.oid = 'public.get_staff_pin_status(uuid)'::regprocedure;

do $$
declare
  v_res text := pg_temp.try_status((select v from _ctx where k = 'owner'), 'restaurant');
  v_txt text;
begin
  select string_agg(o::text, ' ') into v_txt from _out o;
  insert into _r (test, ok, detail) values
    ('S06b ninguna fila devuelta contiene un hash bcrypt',
     v_res = 'OK' and coalesce(v_txt, '') not like '%$2a$%', v_res);
end $$;

-- ---------------------------------------------------------------------------
-- S07 · firma y permisos
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'S07a STABLE, SECURITY DEFINER, search_path vacío',
       p.provolatile = 's' and p.prosecdef and p.proconfig @> array['search_path=""'],
       p.provolatile::text || ' ' || p.prosecdef || ' ' || coalesce(p.proconfig::text, 'null')
from pg_proc p
where p.oid = 'public.get_staff_pin_status(uuid)'::regprocedure;

insert into _r (test, ok, detail) values
  ('S07b authenticated puede ejecutar',
   has_function_privilege('authenticated', 'public.get_staff_pin_status(uuid)', 'EXECUTE'), ''),
  ('S07c anon no puede ejecutar',
   not has_function_privilege('anon', 'public.get_staff_pin_status(uuid)', 'EXECUTE'), ''),
  ('S07d service_role no puede ejecutar',
   not has_function_privilege('service_role', 'public.get_staff_pin_status(uuid)', 'EXECUTE'), ''),
  ('S07e PUBLIC sin EXECUTE',
   not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = 'public.get_staff_pin_status(uuid)'::regprocedure
                 and a.grantee = 0 and a.privilege_type = 'EXECUTE'), '');

select n, test, ok, detail from _r order by n;

rollback;
