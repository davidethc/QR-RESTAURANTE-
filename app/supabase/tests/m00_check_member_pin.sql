-- ---------------------------------------------------------------------------
-- Pruebas · M00-T03 RPC check_member_pin (migración *_m00_check_member_pin.sql).
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO sobre monky-qa. Correr como
-- postgres DESPUÉS de aplicar las migraciones M00-T01, T04 y T03.
--   P01 PIN correcto: OK + member_id + roles
--   P02 PIN incorrecto y PIN sin dueño: INVALID idéntico (sin member_id)
--   P03 5 fallos -> LOCKED; con el PIN correcto sigue LOCKED
--   P04 bloqueo vencido + PIN correcto: OK y contador a 0
--   P05 llamador sin sesión rechazado; anon sin EXECUTE
-- ---------------------------------------------------------------------------
begin;

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
grant select, insert on _r to public;

do $$
declare
  v_r uuid;
  v_owner uuid;
  v_u uuid := gen_random_uuid();
begin
  select id into v_r from public.restaurants where slug = 'monky-qa';
  if v_r is null then raise exception 'No existe monky-qa'; end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'qa-m00-chk-' || v_u || '@example.invalid', now(), now());
  insert into public.profiles (id, full_name) values (v_u, 'QA M00 CHK') on conflict (id) do nothing;
  insert into public.restaurant_members (restaurant_id, user_id, role, status)
  values (v_r, v_u, 'WAITER', 'ACTIVE');

  -- Aislar: sin PIN previos ni intentos previos; solo este miembro tiene PIN 4821.
  update public.restaurant_members set pin_hash = null where restaurant_id = v_r;
  update public.restaurant_members
     set pin_hash = extensions.crypt('4821', extensions.gen_salt('bf', 10))
   where restaurant_id = v_r and user_id = v_u;
  delete from public.pin_login_attempts where restaurant_id = v_r;

  perform set_config('qa.r', v_r::text, true);
  perform set_config('qa.u', v_u::text, true);
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

-- Ya hay 2 fallos; 3 más -> bloqueo. El 5.º fallo todavía responde INVALID.
select pg_temp.chk('1111', current_setting('qa.u')::uuid);
select pg_temp.chk('2222', current_setting('qa.u')::uuid);
select pg_temp.chk('3333', current_setting('qa.u')::uuid);

insert into _r(test, ok, detail)
select 'P03 bloqueo tras 5 fallos', a = 'LOCKED|-|-' and b = 'LOCKED|-|-', a || ' / ' || b
from (select pg_temp.chk('4444', current_setting('qa.u')::uuid) a, pg_temp.chk('4821', current_setting('qa.u')::uuid) b) x;

update public.pin_login_attempts set locked_until = now() - interval '1 second'
 where restaurant_id = current_setting('qa.r')::uuid;

insert into _r(test, ok, detail)
select 'P04 desbloqueo y reinicio', t like 'OK|%' and (select failed_count from public.pin_login_attempts where restaurant_id = current_setting('qa.r')::uuid) = 0, t
from (select pg_temp.chk('4821', current_setting('qa.u')::uuid) t) x;

insert into _r(test, ok, detail)
select 'P05 sin sesión rechazado', pg_temp.chk('4821', null) like 'ERR%', pg_temp.chk('4821', null);

insert into _r(test, ok, detail)
select 'P05b anon sin EXECUTE',
       not has_function_privilege('anon', 'public.check_member_pin(uuid,text)', 'execute')
       and has_function_privilege('authenticated', 'public.check_member_pin(uuid,text)', 'execute'), '';

select n, test, ok, detail from _r order by n;

rollback;
