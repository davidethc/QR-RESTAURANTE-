-- ---------------------------------------------------------------------------
-- Pruebas · vista public.security_events (M00-T02, migración
-- 20261020140000_m00_security_events_view).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO sobre el restaurante monky-qa.
-- Se corre como postgres (MCP execute_sql o psql) DESPUÉS de aplicar la
-- migración. El último SELECT lista cada prueba con ok = true/false.
--
-- Datos: crea dentro de la transacción un usuario KITCHEN de monky-qa, un
-- restaurante ajeno con su OWNER, y filas de audit_logs de prueba (marcadas
-- con metadata.qa_m00t02). Todo se deshace con el ROLLBACK final.
--
-- Qué demuestra:
--   S01 el OWNER de monky-qa ve los eventos sensibles de su restaurante,
--       cada uno con su event_type
--   S02 CASH_MOVEMENT OUT -> cash_withdrawal; IN -> cash_deposit (no se filtra)
--   S03 corte con diferencia -> cash_cut_difference y expone cash_difference;
--       corte cuadrado -> cash_cut
--   S04 cancel_order (UPDATE + metadata.action = CANCEL_ORDER) -> order_cancelled
--   S05 acciones no sensibles (ACCEPT_ORDER, RECORD_PAYMENT, UPDATE genérico)
--       no aparecen
--   S06 el OWNER de monky-qa no ve eventos de otro restaurante
--   S07 el OWNER del otro restaurante no ve eventos de monky-qa
--   S08 un WAITER de monky-qa no ve nada
--   S09 un KITCHEN de monky-qa no ve nada
--   S10 anon no puede leer la vista
--   S11 authenticated no puede INSERT / UPDATE / DELETE en la vista
--   S12 la vista es security_invoker y sin privilegios de escritura
--   S13 un ADMIN ACTIVE de monky-qa ve los eventos de monky-qa
--   S14 un OWNER y un ADMIN INACTIVE de monky-qa ven 0 filas
--   S15 un usuario OWNER del restaurante ajeno y WAITER de monky-qa, y otro
--       OWNER ajeno y KITCHEN de monky-qa, ven solo eventos del ajeno
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _r (n int generated always as identity, test text, ok boolean, detail text) on commit drop;
create temp table _ctx (k text primary key, v uuid) on commit drop;
grant select, insert on _r to public;
grant select, insert on _ctx to public;

-- ---------------------------------------------------------------------------
-- Contexto (monky-qa) y datos de prueba
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid;
  v_other uuid;
  v_kitchen uuid := gen_random_uuid();
  v_other_owner uuid := gen_random_uuid();
begin
  select id into v_r from public.restaurants where slug = 'monky-qa';
  if v_r is null then
    raise exception 'No existe monky-qa: estas pruebas no corren sobre otro restaurante';
  end if;

  insert into _ctx values
    ('restaurant', v_r),
    ('owner',  (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'OWNER'  and status = 'ACTIVE' limit 1)),
    ('waiter', (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1));

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos de monky-qa: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;

  -- Usuario KITCHEN de monky-qa y OWNER de un restaurante ajeno (solo en esta transacción).
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_kitchen, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'qa-m00t02-kitchen-' || v_kitchen || '@example.invalid', now(), now()),
    (v_other_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'qa-m00t02-other-' || v_other_owner || '@example.invalid', now(), now());

  insert into public.profiles (id) values (v_kitchen), (v_other_owner) on conflict (id) do nothing;

  insert into public.restaurants (name, slug)
  values ('QA M00-T02 ajeno', 'qa-m00t02-' || replace(gen_random_uuid()::text, '-', ''))
  returning id into v_other;

  insert into public.restaurant_members (restaurant_id, user_id, role, status) values
    (v_r, v_kitchen, 'KITCHEN', 'ACTIVE'),
    (v_other, v_other_owner, 'OWNER', 'ACTIVE');

  insert into _ctx values ('kitchen', v_kitchen), ('other', v_other), ('other_owner', v_other_owner);

  -- Eventos de prueba en monky-qa: sensibles y no sensibles.
  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata) values
    (v_r, null, 'REJECT_ORDER',        'ORDER',         gen_random_uuid(), '{"qa_m00t02":"reject","reason":"QA"}'),
    (v_r, null, 'UPDATE',              'ORDER',         gen_random_uuid(), '{"qa_m00t02":"cancel","action":"CANCEL_ORDER","reason":"QA"}'),
    (v_r, null, 'VOID_BILL',           'BILL',          gen_random_uuid(), '{"qa_m00t02":"void_bill","total":12.5,"reason":"QA"}'),
    (v_r, null, 'VOID_PAYMENT',        'PAYMENT',       gen_random_uuid(), '{"qa_m00t02":"void_payment","amount":7.25,"reason":"QA"}'),
    (v_r, null, 'CASH_MOVEMENT',       'CASH_MOVEMENT', gen_random_uuid(), '{"qa_m00t02":"cash_out","type":"OUT","reason":"EXPENSE","amount":3}'),
    (v_r, null, 'CASH_MOVEMENT',       'CASH_MOVEMENT', gen_random_uuid(), '{"qa_m00t02":"cash_in","type":"IN","reason":"FLOAT_TOPUP","amount":5}'),
    (v_r, null, 'CLOSE_CASH_SESSION',  'CASH_SESSION',  gen_random_uuid(), '{"qa_m00t02":"cut_diff","expected_cash":100,"counted_cash":98.5,"cash_difference":-1.5}'),
    (v_r, null, 'CLOSE_CASH_SESSION',  'CASH_SESSION',  gen_random_uuid(), '{"qa_m00t02":"cut_ok","expected_cash":100,"counted_cash":100,"cash_difference":0}'),
    (v_r, null, 'APPLY_DISCOUNT',      'BILL',          gen_random_uuid(), '{"qa_m00t02":"discount","kind":"PERCENT","value":10,"amount":2}'),
    (v_r, null, 'REMOVE_DISCOUNT',     'BILL',          gen_random_uuid(), '{"qa_m00t02":"discount_removed","amount":2}'),
    (v_r, null, 'FORCE_CLOSE_SESSION', 'TABLE_SESSION', gen_random_uuid(), '{"qa_m00t02":"force_close","reason":"QA"}'),
    (v_r, null, 'ACCEPT_ORDER',        'ORDER',         gen_random_uuid(), '{"qa_m00t02":"accept"}'),
    (v_r, null, 'RECORD_PAYMENT',      'PAYMENT',       gen_random_uuid(), '{"qa_m00t02":"record_payment","amount":9}'),
    (v_r, null, 'UPDATE',              'ORDER',         gen_random_uuid(), '{"qa_m00t02":"generic_update"}');

  -- Evento sensible del restaurante ajeno.
  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata) values
    (v_other, null, 'VOID_BILL', 'BILL', gen_random_uuid(), '{"qa_m00t02":"other_void_bill","total":1}');
end $$;

-- Usuarios extra para S13-S15 (solo en esta transacción).
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_other uuid := (select v from _ctx where k = 'other');
  v_admin uuid := gen_random_uuid();
  v_owner_off uuid := gen_random_uuid();
  v_admin_off uuid := gen_random_uuid();
  v_mix_w uuid := gen_random_uuid();
  v_mix_k uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'qa-m00t02-' || u || '@example.invalid', now(), now()
  from unnest(array[v_admin, v_owner_off, v_admin_off, v_mix_w, v_mix_k]) as u;

  insert into public.profiles (id)
  select u from unnest(array[v_admin, v_owner_off, v_admin_off, v_mix_w, v_mix_k]) as u
  on conflict (id) do nothing;

  insert into public.restaurant_members (restaurant_id, user_id, role, status) values
    (v_r, v_admin, 'ADMIN', 'ACTIVE'),
    (v_r, v_owner_off, 'OWNER', 'INACTIVE'),
    (v_r, v_admin_off, 'ADMIN', 'INACTIVE'),
    (v_other, v_mix_w, 'OWNER', 'ACTIVE'),
    (v_r, v_mix_w, 'WAITER', 'ACTIVE'),
    (v_other, v_mix_k, 'OWNER', 'ACTIVE'),
    (v_r, v_mix_k, 'KITCHEN', 'ACTIVE');

  insert into _ctx values
    ('admin', v_admin), ('owner_off', v_owner_off), ('admin_off', v_admin_off),
    ('mix_waiter', v_mix_w), ('mix_kitchen', v_mix_k);
end $$;

-- ---------------------------------------------------------------------------
-- S01 .. S06 · OWNER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_got text;
  v_expected text := 'cancel=order_cancelled,cash_in=cash_deposit,cash_out=cash_withdrawal,'
                  || 'cut_diff=cash_cut_difference,cut_ok=cash_cut,discount=discount,'
                  || 'discount_removed=discount_removed,force_close=session_force_closed,'
                  || 'reject=order_cancelled,void_bill=bill_voided,void_payment=refund';
begin
  select string_agg((metadata ->> 'qa_m00t02') || '=' || event_type, ',' order by metadata ->> 'qa_m00t02')
  into v_got
  from public.security_events
  where restaurant_id = (select v from _ctx where k = 'restaurant')
    and metadata ? 'qa_m00t02';

  insert into _r (test, ok, detail) values
    ('S01 OWNER ve los 11 eventos sensibles con su event_type', v_got = v_expected, coalesce(v_got, '(nada)'));

  insert into _r (test, ok, detail)
  select 'S02 retiro OUT -> cash_withdrawal con tipo y monto',
         count(*) = 1, count(*)::text
  from public.security_events
  where metadata ->> 'qa_m00t02' = 'cash_out'
    and event_type = 'cash_withdrawal' and cash_movement_type = 'OUT'
    and cash_movement_reason = 'EXPENSE' and amount = 3;

  insert into _r (test, ok, detail)
  select 'S03 corte con diferencia expone cash_difference = -1.5',
         count(*) = 1, count(*)::text
  from public.security_events
  where metadata ->> 'qa_m00t02' = 'cut_diff'
    and event_type = 'cash_cut_difference' and cash_difference = -1.5;

  insert into _r (test, ok, detail)
  select 'S04 cancel_order (UPDATE) aparece como order_cancelled sobre ORDER',
         count(*) = 1, count(*)::text
  from public.security_events
  where metadata ->> 'qa_m00t02' = 'cancel'
    and action = 'UPDATE' and entity_type = 'ORDER' and entity_id is not null;

  insert into _r (test, ok, detail)
  select 'S05 ACCEPT_ORDER / RECORD_PAYMENT / UPDATE genérico no aparecen',
         count(*) = 0, coalesce(string_agg(metadata ->> 'qa_m00t02', ','), '')
  from public.security_events
  where metadata ->> 'qa_m00t02' in ('accept', 'record_payment', 'generic_update');

  insert into _r (test, ok, detail)
  select 'S06 OWNER de monky-qa no ve eventos de otro restaurante',
         count(*) = 0, count(*)::text
  from public.security_events
  where restaurant_id <> (select v from _ctx where k = 'restaurant');
exception when others then
  insert into _r (test, ok, detail) values ('S01-S06 bloque OWNER', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S07 · OWNER del restaurante ajeno
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'other_owner'), 'role', 'authenticated')::text, true);

do $$
begin
  insert into _r (test, ok, detail)
  select 'S07 OWNER ajeno ve solo su evento, nada de monky-qa',
         count(*) filter (where restaurant_id = (select v from _ctx where k = 'restaurant')) = 0
           and count(*) filter (where metadata ->> 'qa_m00t02' = 'other_void_bill') = 1,
         count(*)::text
  from public.security_events;
exception when others then
  insert into _r (test, ok, detail) values ('S07 bloque OWNER ajeno', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S08 · WAITER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
begin
  insert into _r (test, ok, detail)
  select 'S08 WAITER no ve ningún evento', count(*) = 0, count(*)::text
  from public.security_events;
exception when others then
  insert into _r (test, ok, detail) values ('S08 bloque WAITER', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S09 · KITCHEN de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'kitchen'), 'role', 'authenticated')::text, true);

do $$
begin
  insert into _r (test, ok, detail)
  select 'S09 KITCHEN no ve ningún evento', count(*) = 0, count(*)::text
  from public.security_events;
exception when others then
  insert into _r (test, ok, detail) values ('S09 bloque KITCHEN', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S10 · anon
-- ---------------------------------------------------------------------------
select set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  v_n bigint;
begin
  select count(*) into v_n from public.security_events;
  insert into _r (test, ok, detail) values ('S10 anon no lee security_events', false, 'leyó ' || v_n || ' filas');
exception when insufficient_privilege then
  insert into _r (test, ok, detail) values ('S10 anon no lee security_events', true, sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S11 · escritura como OWNER (el rol con más acceso de lectura)
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.security_events (restaurant_id, action, entity_type)
    values ((select v from _ctx where k = 'restaurant'), 'VOID_BILL', 'BILL');
    insert into _r (test, ok, detail) values ('S11a INSERT en la vista rechazado', false, 'insertó');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('S11a INSERT en la vista rechazado', true, sqlerrm);
  end;

  begin
    update public.security_events set entity_type = 'X'
    where restaurant_id = (select v from _ctx where k = 'restaurant');
    insert into _r (test, ok, detail) values ('S11b UPDATE en la vista rechazado', false, 'actualizó');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('S11b UPDATE en la vista rechazado', true, sqlerrm);
  end;

  begin
    delete from public.security_events
    where restaurant_id = (select v from _ctx where k = 'restaurant');
    insert into _r (test, ok, detail) values ('S11c DELETE en la vista rechazado', false, 'borró');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('S11c DELETE en la vista rechazado', true, sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S12 · definición y privilegios de la vista
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'S12a vista con security_invoker = true',
       coalesce('security_invoker=true' = any (c.reloptions), false),
       coalesce(array_to_string(c.reloptions, ','), '(sin opciones)')
from pg_class c
where c.oid = 'public.security_events'::regclass;

insert into _r (test, ok, detail) values
  ('S12b anon sin SELECT', not has_table_privilege('anon', 'public.security_events', 'SELECT'), ''),
  ('S12c authenticated con SELECT', has_table_privilege('authenticated', 'public.security_events', 'SELECT'), ''),
  ('S12d authenticated sin INSERT/UPDATE/DELETE/TRUNCATE',
   not has_table_privilege('authenticated', 'public.security_events', 'INSERT')
   and not has_table_privilege('authenticated', 'public.security_events', 'UPDATE')
   and not has_table_privilege('authenticated', 'public.security_events', 'DELETE')
   and not has_table_privilege('authenticated', 'public.security_events', 'TRUNCATE'), ''),
  ('S12e anon sin ningún privilegio de escritura',
   not has_table_privilege('anon', 'public.security_events', 'INSERT')
   and not has_table_privilege('anon', 'public.security_events', 'UPDATE')
   and not has_table_privilege('anon', 'public.security_events', 'DELETE'), '');

-- ---------------------------------------------------------------------------
-- S13 .. S15 · ADMIN activo, OWNER/ADMIN inactivos, roles mixtos entre restaurantes
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'admin'), 'role', 'authenticated')::text, true);

do $$
begin
  insert into _r (test, ok, detail)
  select 'S13 ADMIN ACTIVE ve los 11 eventos sensibles de monky-qa',
         count(*) filter (where metadata ? 'qa_m00t02' and restaurant_id = (select v from _ctx where k = 'restaurant')) = 11
           and count(*) filter (where restaurant_id <> (select v from _ctx where k = 'restaurant')) = 0,
         count(*)::text
  from public.security_events;
exception when others then
  insert into _r (test, ok, detail) values ('S13 bloque ADMIN', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner_off'), 'role', 'authenticated')::text, true);

do $$
begin
  insert into _r (test, ok, detail)
  select 'S14a OWNER INACTIVE ve 0 filas', count(*) = 0, count(*)::text
  from public.security_events;
exception when others then
  insert into _r (test, ok, detail) values ('S14a bloque OWNER INACTIVE', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'admin_off'), 'role', 'authenticated')::text, true);

do $$
begin
  insert into _r (test, ok, detail)
  select 'S14b ADMIN INACTIVE ve 0 filas', count(*) = 0, count(*)::text
  from public.security_events;
exception when others then
  insert into _r (test, ok, detail) values ('S14b bloque ADMIN INACTIVE', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'mix_waiter'), 'role', 'authenticated')::text, true);

do $$
begin
  insert into _r (test, ok, detail)
  select 'S15a OWNER ajeno + WAITER de monky-qa ve solo el ajeno',
         count(*) filter (where restaurant_id = (select v from _ctx where k = 'restaurant')) = 0
           and count(*) filter (where metadata ->> 'qa_m00t02' = 'other_void_bill') = 1,
         count(*)::text
  from public.security_events;
exception when others then
  insert into _r (test, ok, detail) values ('S15a bloque mixto WAITER', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'mix_kitchen'), 'role', 'authenticated')::text, true);

do $$
begin
  insert into _r (test, ok, detail)
  select 'S15b OWNER ajeno + KITCHEN de monky-qa ve solo el ajeno',
         count(*) filter (where restaurant_id = (select v from _ctx where k = 'restaurant')) = 0
           and count(*) filter (where metadata ->> 'qa_m00t02' = 'other_void_bill') = 1,
         count(*)::text
  from public.security_events;
exception when others then
  insert into _r (test, ok, detail) values ('S15b bloque mixto KITCHEN', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

select n, test, ok, detail from _r order by n;

rollback;
