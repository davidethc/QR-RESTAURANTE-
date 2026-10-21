-- ---------------------------------------------------------------------------
-- Pruebas · M01-T01 horarios (schedules / schedule_shifts), categories.schedule_ids
-- y products.service_options (migración 20261020130000).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO escribe sobre el restaurante
-- monky-qa. De otro restaurante solo se LEE el id de su "Menú general" (S03).
-- Se corre como postgres (MCP execute_sql o psql) DESPUÉS de aplicar la
-- migración. El último SELECT lista cada prueba con ok = true/false.
--
-- Qué demuestra:
--   S01 backfill: toda categoría de monky-qa tiene su "Menú general"
--   S02 una categoría nueva sin horarios recibe el "Menú general" de su restaurante
--   S02b si el restaurante no tiene "Menú general", el trigger lo crea
--   S03 se rechaza un schedule_id de otro restaurante (23503)
--   S03b se rechaza un schedule_id inexistente (23503)
--   S04 al borrar un horario se quita de categories
--   S05 un producto nuevo recibe el service_options por defecto
--   S05b service_options sin la clave digital_menu se rechaza (23514)
--   S06 weekday fuera de 0..6 se rechaza (23514); un turno que cruza la medianoche se acepta
--   S07 RLS: OWNER crea horarios; WAITER no escribe en schedules ni en schedule_shifts
--   S08 anon no lee schedules ni schedule_shifts
--   S09 un horario no cambia de restaurante ni un turno de horario (22023)
--   S10 como authenticated (usuarios reales de monky-qa):
--       a) OWNER no pone en una categoría un horario de otro restaurante (23503)
--       b) OWNER y WAITER ven 0 schedules / schedule_shifts de otros restaurantes
--       c) WAITER no hace UPDATE/DELETE en schedule_shifts ni DELETE en schedules
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
    ('general', (select id from public.schedules where restaurant_id = v_r and name = 'Menú general')),
    ('foreign_schedule', (select id from public.schedules where restaurant_id <> v_r order by created_at limit 1)),
    ('owner',  (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'OWNER'  and status = 'ACTIVE' limit 1)),
    ('waiter', (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1));

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- S01 · backfill
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'S01 toda categoría de monky-qa tiene su Menú general',
       count(*) = 0, count(*) || ' categorías sin Menú general'
from public.categories c
where c.restaurant_id = (select v from _ctx where k = 'restaurant')
  and not exists (
  select 1 from public.schedules s
  where s.restaurant_id = c.restaurant_id
    and s.name = 'Menú general'
    and s.id = any (c.schedule_ids)
);

-- ---------------------------------------------------------------------------
-- S02 / S02b · categoría nueva sin horarios
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_ids uuid[];
  v_new_general uuid;
begin
  insert into public.categories (restaurant_id, name) values (v_r, 'QA M01 sin horarios')
  returning schedule_ids into v_ids;
  insert into _r (test, ok, detail) values
    ('S02 categoría nueva sin horarios recibe el Menú general',
     v_ids = array[(select v from _ctx where k = 'general')], coalesce(v_ids::text, 'null'));

  -- Sin "Menú general": el trigger lo recrea. Se borra solo dentro de la transacción.
  delete from public.schedules where id = (select v from _ctx where k = 'general');
  insert into public.categories (restaurant_id, name) values (v_r, 'QA M01 recrea general')
  returning schedule_ids into v_ids;
  select id into v_new_general from public.schedules where restaurant_id = v_r and name = 'Menú general';
  insert into _r (test, ok, detail) values
    ('S02b sin Menú general, el trigger lo crea y lo asigna',
     v_new_general is not null and v_ids = array[v_new_general], coalesce(v_ids::text, 'null'));
  insert into _ctx values ('general2', v_new_general);
exception when others then
  insert into _r (test, ok, detail) values ('S02 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- S03 / S03b · integridad de schedule_ids
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
begin
  begin
    insert into public.categories (restaurant_id, name, schedule_ids)
    values (v_r, 'QA M01 ajeno', array[(select v from _ctx where k = 'foreign_schedule')]);
    insert into _r (test, ok, detail) values ('S03 schedule_id de otro restaurante se rechaza', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('S03 schedule_id de otro restaurante se rechaza', sqlstate = '23503', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.categories set schedule_ids = schedule_ids || gen_random_uuid()
    where restaurant_id = v_r and name = 'QA M01 sin horarios';
    insert into _r (test, ok, detail) values ('S03b schedule_id inexistente se rechaza', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('S03b schedule_id inexistente se rechaza', sqlstate = '23503', sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- S04 · borrar un horario lo quita de categories
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_s uuid;
  v_c uuid;
  v_ids uuid[];
begin
  insert into public.schedules (restaurant_id, name) values (v_r, 'QA M01 Desayunos') returning id into v_s;
  insert into public.categories (restaurant_id, name, schedule_ids)
  values (v_r, 'QA M01 con desayunos', array[(select v from _ctx where k = 'general2'), v_s])
  returning id into v_c;

  delete from public.schedules where id = v_s;
  select schedule_ids into v_ids from public.categories where id = v_c;
  insert into _r (test, ok, detail) values
    ('S04 borrar un horario lo quita de categories',
     v_ids = array[(select v from _ctx where k = 'general2')], coalesce(v_ids::text, 'null'));
exception when others then
  insert into _r (test, ok, detail) values ('S04 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- S05 / S05b · service_options
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_so jsonb;
begin
  insert into public.products (restaurant_id, name, price) values (v_r, 'QA M01 producto', 1.00)
  returning service_options into v_so;
  insert into _r (test, ok, detail) values
    ('S05 producto nuevo recibe el service_options por defecto',
     v_so = '{"pos":{"tables":true,"dine_in_no_table":true,"takeaway":true,"delivery":true},"digital_menu":{"tables":true,"pickup":true,"delivery":true}}'::jsonb,
     coalesce(v_so::text, 'null'));

  begin
    insert into public.products (restaurant_id, name, price, service_options)
    values (v_r, 'QA M01 forma mala', 1.00, '{"pos":{}}'::jsonb);
    insert into _r (test, ok, detail) values ('S05b service_options sin digital_menu se rechaza', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('S05b service_options sin digital_menu se rechaza', sqlstate = '23514', sqlstate || ' ' || sqlerrm);
  end;
exception when others then
  insert into _r (test, ok, detail) values ('S05 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- S06 · turnos
-- ---------------------------------------------------------------------------
do $$
declare
  v_s uuid := (select v from _ctx where k = 'general2');
begin
  begin
    insert into public.schedule_shifts (schedule_id, weekday, starts_at, ends_at) values (v_s, 7, '08:00', '12:00');
    insert into _r (test, ok, detail) values ('S06 weekday 7 se rechaza', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('S06 weekday 7 se rechaza', sqlstate = '23514', sqlstate || ' ' || sqlerrm);
  end;

  begin
    insert into public.schedule_shifts (schedule_id, weekday, starts_at, ends_at) values (v_s, -1, '08:00', '12:00');
    insert into _r (test, ok, detail) values ('S06 weekday -1 se rechaza', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('S06 weekday -1 se rechaza', sqlstate = '23514', sqlstate || ' ' || sqlerrm);
  end;

  insert into public.schedule_shifts (schedule_id, weekday, starts_at, ends_at) values (v_s, 5, '20:00', '02:00');
  insert into _r (test, ok, detail) values ('S06 turno que cruza la medianoche se acepta', true, '');
exception when others then
  insert into _r (test, ok, detail) values ('S06 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- S07 · RLS: OWNER escribe, WAITER no
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_s uuid;
begin
  insert into public.schedules (restaurant_id, name) values ((select v from _ctx where k = 'restaurant'), 'QA M01 owner')
  returning id into v_s;
  insert into public.schedule_shifts (schedule_id, weekday, starts_at, ends_at) values (v_s, 1, '07:00', '11:00');
  insert into _r (test, ok, detail) values ('S07a OWNER crea horario y turno', true, '');
exception when others then
  insert into _r (test, ok, detail) values ('S07a OWNER crea horario y turno', false, sqlstate || ' ' || sqlerrm);
end $$;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_n int;
begin
  select count(*) into v_n from public.schedules where restaurant_id = (select v from _ctx where k = 'restaurant');
  insert into _r (test, ok, detail) values ('S07b WAITER lee los horarios de su restaurante', v_n > 0, v_n || ' filas');

  begin
    insert into public.schedules (restaurant_id, name) values ((select v from _ctx where k = 'restaurant'), 'QA M01 waiter');
    insert into _r (test, ok, detail) values ('S07c WAITER no inserta en schedules', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('S07c WAITER no inserta en schedules', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;

  update public.schedules set name = 'QA M01 hackeado' where restaurant_id = (select v from _ctx where k = 'restaurant');
  get diagnostics v_n = row_count;
  insert into _r (test, ok, detail) values ('S07d WAITER no actualiza schedules', v_n = 0, v_n || ' filas');

  begin
    insert into public.schedule_shifts (schedule_id, weekday, starts_at, ends_at)
    values ((select v from _ctx where k = 'general2'), 2, '07:00', '11:00');
    insert into _r (test, ok, detail) values ('S07e WAITER no inserta en schedule_shifts', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values ('S07e WAITER no inserta en schedule_shifts', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S08 · anon no lee
-- ---------------------------------------------------------------------------
select set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.schedules limit 1;
    insert into _r (test, ok, detail) values ('S08a anon no lee schedules', false, 'leyó');
  exception when others then
    insert into _r (test, ok, detail) values ('S08a anon no lee schedules', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform 1 from public.schedule_shifts limit 1;
    insert into _r (test, ok, detail) values ('S08b anon no lee schedule_shifts', false, 'leyó');
  exception when others then
    insert into _r (test, ok, detail) values ('S08b anon no lee schedule_shifts', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
  end;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- S09 · el padre de un horario o de un turno no cambia (como postgres: aplica a todos)
-- ---------------------------------------------------------------------------
do $$
declare
  v_s uuid := (select v from _ctx where k = 'general2');
begin
  begin
    update public.schedules set restaurant_id = gen_random_uuid() where id = v_s;
    insert into _r (test, ok, detail) values ('S09a schedules.restaurant_id no cambia', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values ('S09a schedules.restaurant_id no cambia', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.schedule_shifts set schedule_id = (select v from _ctx where k = 'foreign_schedule')
    where schedule_id = v_s;
    insert into _r (test, ok, detail) values ('S09b schedule_shifts.schedule_id no cambia', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values ('S09b schedule_shifts.schedule_id no cambia', sqlstate = '22023', sqlstate || ' ' || sqlerrm);
  end;

  update public.schedules set name = 'QA M01 renombrado' where id = v_s;
  insert into _r (test, ok, detail) values ('S09c renombrar un horario sigue permitido', true, '');
exception when others then
  insert into _r (test, ok, detail) values ('S09 bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

update public.schedules set name = 'Menú general' where id = (select v from _ctx where k = 'general2');

-- Datos para S10b/S10c, medidos como postgres (solo lectura fuera de monky-qa).
insert into _ctx values
  ('qa_shift', (select ss.id from public.schedule_shifts ss
                join public.schedules s on s.id = ss.schedule_id
                where s.restaurant_id = (select v from _ctx where k = 'restaurant') limit 1));

create temp table _n (k text primary key, n bigint) on commit drop;
grant select on _n to public;
insert into _n values
  ('foreign_schedules', (select count(*) from public.schedules where restaurant_id <> (select v from _ctx where k = 'restaurant'))),
  ('foreign_shifts', (select count(*) from public.schedule_shifts ss join public.schedules s on s.id = ss.schedule_id
                      where s.restaurant_id <> (select v from _ctx where k = 'restaurant'))),
  ('qa_shifts', (select count(*) from public.schedule_shifts ss join public.schedules s on s.id = ss.schedule_id
                 where s.restaurant_id = (select v from _ctx where k = 'restaurant'))),
  ('qa_schedules', (select count(*) from public.schedules where restaurant_id = (select v from _ctx where k = 'restaurant')));

-- ---------------------------------------------------------------------------
-- S10a / S10b · OWNER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_n bigint;
  v_m bigint;
begin
  begin
    insert into public.categories (restaurant_id, name, schedule_ids)
    values (v_r, 'QA M01 owner ajeno', array[(select v from _ctx where k = 'foreign_schedule')]);
    insert into _r (test, ok, detail) values ('S10a OWNER: INSERT con horario de otro restaurante se rechaza', false, 'insertó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('S10a OWNER: INSERT con horario de otro restaurante se rechaza', sqlstate = '23503', sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.categories set schedule_ids = schedule_ids || (select v from _ctx where k = 'foreign_schedule')
    where restaurant_id = v_r and name = 'QA M01 sin horarios';
    insert into _r (test, ok, detail) values ('S10a OWNER: UPDATE con horario de otro restaurante se rechaza', false, 'actualizó');
  exception when others then
    insert into _r (test, ok, detail) values
      ('S10a OWNER: UPDATE con horario de otro restaurante se rechaza', sqlstate = '23503', sqlstate || ' ' || sqlerrm);
  end;

  select count(*) into v_n from public.schedules where restaurant_id <> v_r;
  select count(*) into v_m from public.schedule_shifts ss
    where not exists (select 1 from public.schedules s where s.id = ss.schedule_id and s.restaurant_id = v_r);
  insert into _r (test, ok, detail) values
    ('S10b OWNER ve 0 schedules y 0 schedule_shifts de otros restaurantes',
     v_n = 0 and v_m = 0 and (select n from _n where k = 'foreign_schedules') > 0,
     format('visibles %s/%s horarios y %s/%s turnos ajenos', v_n, (select n from _n where k = 'foreign_schedules'),
            v_m, (select n from _n where k = 'foreign_shifts')));
end $$;

-- ---------------------------------------------------------------------------
-- S10b / S10c · WAITER de monky-qa
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_n bigint;
  v_m bigint;
begin
  select count(*) into v_n from public.schedules where restaurant_id <> v_r;
  select count(*) into v_m from public.schedule_shifts ss
    where not exists (select 1 from public.schedules s where s.id = ss.schedule_id and s.restaurant_id = v_r);
  insert into _r (test, ok, detail) values
    ('S10b WAITER ve 0 schedules y 0 schedule_shifts de otros restaurantes', v_n = 0 and v_m = 0,
     format('visibles %s horarios y %s turnos ajenos', v_n, v_m));

  update public.schedule_shifts set ends_at = '23:00' where id = (select v from _ctx where k = 'qa_shift');
  get diagnostics v_n = row_count;
  insert into _r (test, ok, detail) values ('S10c WAITER no actualiza schedule_shifts', v_n = 0, v_n || ' filas');

  delete from public.schedule_shifts where schedule_id in (select id from public.schedules where restaurant_id = v_r);
  get diagnostics v_n = row_count;
  insert into _r (test, ok, detail) values ('S10c WAITER no borra schedule_shifts', v_n = 0, v_n || ' filas');

  delete from public.schedules where restaurant_id = v_r;
  get diagnostics v_n = row_count;
  insert into _r (test, ok, detail) values ('S10c WAITER no borra schedules', v_n = 0, v_n || ' filas');
exception when others then
  insert into _r (test, ok, detail) values ('S10 WAITER bloque', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- Control como postgres: lo de monky-qa sigue intacto después de los intentos del WAITER.
insert into _r (test, ok, detail)
select 'S10c horarios y turnos de monky-qa siguen intactos',
       (select count(*) from public.schedules where restaurant_id = (select v from _ctx where k = 'restaurant')) = (select n from _n where k = 'qa_schedules')
       and (select count(*) from public.schedule_shifts ss join public.schedules s on s.id = ss.schedule_id
            where s.restaurant_id = (select v from _ctx where k = 'restaurant')) = (select n from _n where k = 'qa_shifts')
       and (select n from _n where k = 'qa_shifts') > 0
       and (select ends_at from public.schedule_shifts where id = (select v from _ctx where k = 'qa_shift')) <> '23:00',
       format('%s horarios, %s turnos', (select n from _n where k = 'qa_schedules'), (select n from _n where k = 'qa_shifts'));

select n, test, ok, detail from _r order by n;

rollback;
