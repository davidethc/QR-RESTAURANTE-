-- ---------------------------------------------------------------------------
-- Pruebas · M00-T03 RPC check_member_pin (migración *_m00_check_member_pin.sql).
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO sobre monky-qa. Correr como
-- postgres DESPUÉS de aplicar las migraciones M00-T01, T04 y T03.
--   P01 PIN correcto: OK + member_id + roles
--   P02 PIN incorrecto y PIN sin dueño: INVALID idéntico (sin member_id)
--   P03 5 fallos -> LOCKED (el 5.º ya responde LOCKED, 5 min); con el PIN
--       correcto sigue LOCKED
--   P04 bloqueo vencido + PIN correcto: OK y contadores a 0
--   P05 llamador sin sesión rechazado; anon sin EXECUTE
--   P06 bloqueo progresivo: 5 min, 10 min y al 3.º queda duro (sin vencimiento,
--       el PIN correcto sigue LOCKED aunque pase el tiempo)
--   P07 audit_logs: cada LOCKED deja fila (LOCK_IMPOSED x3, LOCKED_ATTEMPT),
--       sin el PIN
--   P08 unlock_pin_login: un WAITER no puede; un ADMIN sí (el PIN correcto vuelve
--       a dar OK y queda fila UNLOCKED); sin sesión rechazado; anon sin EXECUTE
-- ---------------------------------------------------------------------------
begin;

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
grant select, insert on _r to public;

do $$
declare
  v_r uuid;
  v_owner uuid;
  v_u uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid();
begin
  select id into v_r from public.restaurants where slug = 'monky-qa';
  if v_r is null then raise exception 'No existe monky-qa'; end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'qa-m00-chk-' || v_u || '@example.invalid', now(), now());
  insert into public.profiles (id, full_name) values (v_u, 'QA M00 CHK') on conflict (id) do nothing;
  insert into public.restaurant_members (restaurant_id, user_id, role, status)
  values (v_r, v_u, 'WAITER', 'ACTIVE');

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'qa-m00-chk-' || v_a || '@example.invalid', now(), now());
  insert into public.profiles (id, full_name) values (v_a, 'QA M00 CHK ADMIN') on conflict (id) do nothing;
  insert into public.restaurant_members (restaurant_id, user_id, role, status)
  values (v_r, v_a, 'ADMIN', 'ACTIVE');

  -- Aislar: sin PIN previos ni intentos previos; solo este miembro tiene PIN 4821.
  update public.restaurant_members set pin_hash = null where restaurant_id = v_r;
  update public.restaurant_members
     set pin_hash = extensions.crypt('4821', extensions.gen_salt('bf', 10))
   where restaurant_id = v_r and user_id = v_u;
  delete from public.pin_login_attempts where restaurant_id = v_r;

  perform set_config('qa.r', v_r::text, true);
  perform set_config('qa.u', v_u::text, true);
  perform set_config('qa.a', v_a::text, true);
end $$;

create function pg_temp.chk(p_pin text, p_actor uuid default null)
returns text
language plpgsql
as $$
declare v_out text; v_row record;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    case when p_actor is null then '' else json_build_object('sub', p_actor, 'role', 'authenticated')::text end, true);
  begin
    select * into v_row from public.check_member_pin(current_setting('qa.r')::uuid, p_pin);
    v_out := v_row.status || '|' || coalesce(v_row.member_id::text, '-') || '|' || coalesce(v_row.roles::text, '-');
  exception when others then
    v_out := 'ERR ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end $$;

insert into _r(test, ok, detail)
select 'P01 acierto', t like 'OK|%|{WAITER}', t from (select pg_temp.chk('4821', current_setting('qa.u')::uuid) t) x;

insert into _r(test, ok, detail)
select 'P02 fallo = INVALID genérico', a = 'INVALID|-|-' and b = 'INVALID|-|-', a || ' / ' || b
from (select pg_temp.chk('0000', current_setting('qa.u')::uuid) a, pg_temp.chk('abc', current_setting('qa.u')::uuid) b) x;

-- Ya hay 2 fallos; 2 más siguen INVALID y el 5.º impone el bloqueo (LOCKED).
select pg_temp.chk('1111', current_setting('qa.u')::uuid);
select pg_temp.chk('2222', current_setting('qa.u')::uuid);

insert into _r(test, ok, detail)
select 'P03a el 5.º fallo impone el bloqueo (LOCKED) de ~5 min',
       a = 'LOCKED|-|-'
       and (select hard_locked = false and lock_count = 1
                   and locked_until between now() + interval '4 minutes 50 seconds' and now() + interval '5 minutes 5 seconds'
              from public.pin_login_attempts where restaurant_id = current_setting('qa.r')::uuid),
       a
from (select pg_temp.chk('3333', current_setting('qa.u')::uuid) a) x;

insert into _r(test, ok, detail)
select 'P03b durante el bloqueo, también con el PIN correcto', a = 'LOCKED|-|-' and b = 'LOCKED|-|-', a || ' / ' || b
from (select pg_temp.chk('4444', current_setting('qa.u')::uuid) a, pg_temp.chk('4821', current_setting('qa.u')::uuid) b) x;

update public.pin_login_attempts set locked_until = now() - interval '1 second'
 where restaurant_id = current_setting('qa.r')::uuid;

insert into _r(test, ok, detail)
select 'P04 desbloqueo por vencimiento y reinicio', t like 'OK|%'
       and (select failed_count = 0 and lock_count = 0 and not hard_locked
              from public.pin_login_attempts where restaurant_id = current_setting('qa.r')::uuid), t
from (select pg_temp.chk('4821', current_setting('qa.u')::uuid) t) x;

insert into _r(test, ok, detail)
select 'P05 sin sesión rechazado', pg_temp.chk('4821', null) like 'ERR%', pg_temp.chk('4821', null);

insert into _r(test, ok, detail)
select 'P05b anon sin EXECUTE',
       not has_function_privilege('anon', 'public.check_member_pin(uuid,text)', 'execute')
       and has_function_privilege('authenticated', 'public.check_member_pin(uuid,text)', 'execute'), '';

-- ---------------------------------------------------------------------------
-- P06 · bloqueo progresivo
-- ---------------------------------------------------------------------------
create function pg_temp.fail5()
returns text
language plpgsql
as $$
declare v_out text; i int;
begin
  for i in 1..5 loop
    v_out := pg_temp.chk('0000', current_setting('qa.u')::uuid);
  end loop;
  return v_out;
end $$;

-- 1.er bloqueo (5 min)
insert into _r(test, ok, detail)
select 'P06a 1.er bloqueo: LOCKED, lock_count 1, ~5 min',
       t = 'LOCKED|-|-' and (select lock_count = 1 and not hard_locked
                   and locked_until between now() + interval '4 minutes 50 seconds' and now() + interval '5 minutes 5 seconds'
              from public.pin_login_attempts where restaurant_id = current_setting('qa.r')::uuid), t
from (select pg_temp.fail5() t) x;

update public.pin_login_attempts set locked_until = now() - interval '1 second'
 where restaurant_id = current_setting('qa.r')::uuid;

-- 2.º bloqueo seguido (10 min)
insert into _r(test, ok, detail)
select 'P06b 2.º bloqueo seguido: lock_count 2, ~10 min (el doble)',
       t = 'LOCKED|-|-' and (select lock_count = 2 and not hard_locked
                   and locked_until between now() + interval '9 minutes 50 seconds' and now() + interval '10 minutes 5 seconds'
              from public.pin_login_attempts where restaurant_id = current_setting('qa.r')::uuid), t
from (select pg_temp.fail5() t) x;

update public.pin_login_attempts set locked_until = now() - interval '1 second'
 where restaurant_id = current_setting('qa.r')::uuid;

-- 3.er bloqueo seguido: duro
insert into _r(test, ok, detail)
select 'P06c 3.er bloqueo seguido: duro (hard_locked, sin vencimiento)',
       t = 'LOCKED|-|-' and (select lock_count = 3 and hard_locked and locked_until is null
              from public.pin_login_attempts where restaurant_id = current_setting('qa.r')::uuid), t
from (select pg_temp.fail5() t) x;

insert into _r(test, ok, detail)
select 'P06d bloqueo duro: el PIN correcto sigue LOCKED',
       a = 'LOCKED|-|-' and b = 'LOCKED|-|-', a || ' / ' || b
from (select pg_temp.chk('0000', current_setting('qa.u')::uuid) a, pg_temp.chk('4821', current_setting('qa.u')::uuid) b) x;

-- ---------------------------------------------------------------------------
-- P07 · auditoría de cada LOCKED
-- ---------------------------------------------------------------------------
insert into _r(test, ok, detail)
select 'P07a 3 bloqueos impuestos auditados (lock_count 1, 2, 3; el 3.º duro)',
       count(*) = 3
       and array_agg((a.metadata ->> 'lock_count')::int order by a.created_at, (a.metadata ->> 'lock_count')::int) = array[1, 2, 3]
       and bool_or((a.metadata ->> 'hard')::boolean) filter (where a.metadata ->> 'lock_count' = '3'),
       count(*) || ' filas'
from public.audit_logs a
where a.restaurant_id = current_setting('qa.r')::uuid and a.entity_type = 'PIN_LOGIN'
  and a.metadata ->> 'event' = 'LOCK_IMPOSED';

insert into _r(test, ok, detail)
select 'P07b cada intento durante un bloqueo deja LOCKED_ATTEMPT (>= 4: 2 en P03b, 2 en P06d)',
       count(*) >= 4, count(*) || ' filas'
from public.audit_logs a
where a.restaurant_id = current_setting('qa.r')::uuid and a.entity_type = 'PIN_LOGIN'
  and a.metadata ->> 'event' = 'LOCKED_ATTEMPT';

insert into _r(test, ok, detail)
select 'P07c la auditoría no contiene PIN ni hash y registra quién llamó',
       coalesce(bool_and(a.metadata::text !~ '(4821|1111|2222|3333|4444|0000|\$2a\$)' and a.user_id = current_setting('qa.u')::uuid), false),
       count(*) || ' filas'
from public.audit_logs a
where a.restaurant_id = current_setting('qa.r')::uuid and a.entity_type = 'PIN_LOGIN'
  and a.metadata ->> 'event' in ('LOCK_IMPOSED', 'LOCKED_ATTEMPT');

-- ---------------------------------------------------------------------------
-- P08 · unlock_pin_login
-- ---------------------------------------------------------------------------
create function pg_temp.unlock(p_actor uuid)
returns text
language plpgsql
as $$
declare v_out text := 'OK';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    case when p_actor is null then '' else json_build_object('sub', p_actor, 'role', 'authenticated')::text end, true);
  begin
    perform public.unlock_pin_login(current_setting('qa.r')::uuid);
  exception when others then
    v_out := 'ERR ' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end $$;

insert into _r(test, ok, detail)
select 'P08a un WAITER no desbloquea (42501) y el bloqueo sigue',
       t = 'ERR 42501' and (select hard_locked from public.pin_login_attempts where restaurant_id = current_setting('qa.r')::uuid), t
from (select pg_temp.unlock(current_setting('qa.u')::uuid) t) x;

insert into _r(test, ok, detail)
select 'P08b sin sesión rechazado', t like 'ERR%', t
from (select pg_temp.unlock(null) t) x;

insert into _r(test, ok, detail)
select 'P08c un ADMIN activo desbloquea: contadores a 0 y el PIN correcto da OK',
       t = 'OK'
       and (select failed_count = 0 and lock_count = 0 and not hard_locked and locked_until is null
              from public.pin_login_attempts where restaurant_id = current_setting('qa.r')::uuid)
       and pg_temp.chk('4821', current_setting('qa.u')::uuid) like 'OK|%', t
from (select pg_temp.unlock(current_setting('qa.a')::uuid) t) x;

insert into _r(test, ok, detail)
select 'P08d el desbloqueo queda auditado (UNLOCKED, was_hard, por el ADMIN)',
       count(*) = 1 and bool_and((a.metadata ->> 'was_hard')::boolean and a.user_id = current_setting('qa.a')::uuid),
       count(*) || ' filas'
from public.audit_logs a
where a.restaurant_id = current_setting('qa.r')::uuid and a.entity_type = 'PIN_LOGIN'
  and a.metadata ->> 'event' = 'UNLOCKED';

insert into _r(test, ok, detail) values
  ('P08e unlock_pin_login: anon y PUBLIC sin EXECUTE, authenticated sí',
   not has_function_privilege('anon', 'public.unlock_pin_login(uuid)', 'execute')
   and has_function_privilege('authenticated', 'public.unlock_pin_login(uuid)', 'execute')
   and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                    where p.oid = 'public.unlock_pin_login(uuid)'::regprocedure and x.grantee = 0), '');

select n, test, ok, detail from _r order by n;

rollback;
