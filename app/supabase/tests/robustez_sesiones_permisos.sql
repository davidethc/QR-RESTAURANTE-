-- ---------------------------------------------------------------------------
-- Pruebas · robustez de sesiones, permisos y pedidos (migraciones
-- 20260928150000 .. 20260928151900).
--
-- SIEMPRE dentro de BEGIN ... ROLLBACK y SOLO sobre el restaurante monky-qa.
-- Se corre como postgres (MCP execute_sql o psql) DESPUÉS de aplicar las
-- migraciones. El último SELECT lista cada prueba con ok = true/false.
--
-- Qué demuestra:
--   T01 sesión con consumo sin cobrar y > 4 h inactiva NO vence al escanear:
--       el escaneo da P0001 "cuenta pendiente", sin token y sin sesión nueva
--   T01c con < 4 h de inactividad el escaneo reutiliza la sesión (misma mesa)
--   T02 sesión vacía y > 4 h inactiva SÍ vence al escanear
--   T03 el barrido de pg_cron vence solo sesiones vacías
--   T04 la mesa con consumo sin cobrar se ve OCUPADA
--   T05 el mesero (find_or_create) reutiliza la sesión con consumo sin cobrar
--   T06 idempotencia create_staff_order (misma clave -> mismo pedido)
--   T07 idempotencia create_customer_order (misma clave -> mismo pedido)
--   T08 la misma clave desde otra sesión se rechaza
--   T09 límites: cantidad 0 / 100 / no numérica, 51 líneas, notas > 200
--   T10 "Cuentas abiertas" (list_open_bills) muestra la sesión sin cuenta
--   T11 get_dashboard_summary: revenue_today null para WAITER, número para OWNER
--   T12 session_token no es legible por authenticated; id sí
--   T13 anon no puede escribir tablas; authenticated no escribe orders pero sí categories
--   T14 set_bill_split rechaza al WAITER
--   T15 cash_sessions invisible para WAITER
--   T16 add_staff_member rechaza cuentas viejas y acepta recién creadas
--   T17 una sesión con cuenta VOID y pedidos sigue con consumo sin cobrar
--       (no vence y sale en "Cuentas abiertas" sin cuenta viva)
--   T18 void_bill rechaza al WAITER antes del candado
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
    ('t1', (select id from public.tables where restaurant_id = v_r and kind = 'TABLE' and number = 1)),
    ('t2', (select id from public.tables where restaurant_id = v_r and kind = 'TABLE' and number = 2)),
    ('t3', (select id from public.tables where restaurant_id = v_r and kind = 'TABLE' and number = 3)),
    ('owner',  (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'OWNER'  and status = 'ACTIVE' limit 1)),
    ('waiter', (select user_id from public.restaurant_members where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1)),
    ('product', (select id from public.products where restaurant_id = v_r and active and available order by id limit 1)),
    ('k_staff', gen_random_uuid()),
    ('k_customer', gen_random_uuid());

  if exists (select 1 from _ctx where v is null) then
    raise exception 'Faltan datos de monky-qa: %', (select string_agg(k, ',') from _ctx where v is null);
  end if;

  if not (select billing_enabled from public.restaurants where id = v_r) then
    raise exception 'monky-qa debe tener billing_enabled = true para estas pruebas';
  end if;

  -- Punto de partida limpio (solo dentro de esta transacción).
  update public.table_sessions
  set status = 'CLOSED', closed_at = now()
  where table_id in (select v from _ctx where k in ('t1','t2','t3'))
    and status = 'ACTIVE';
end $$;

-- S1: mesa 1, pedido ENTREGADO sin cobrar, 5 h sin actividad.
-- S2: mesa 2, vacía, 5 h sin actividad.
-- S3: mesa 3, vacía, 5 h sin actividad (para el barrido).
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p public.products%rowtype;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_o uuid;
begin
  select * into v_p from public.products where id = (select v from _ctx where k = 'product');

  insert into public.table_sessions (restaurant_id, table_id, started_at, last_activity_at)
  values (v_r, (select v from _ctx where k = 't1'), now() - interval '6 hours', now() - interval '5 hours')
  returning id into v_s1;

  insert into public.orders (restaurant_id, table_id, table_session_id, status, subtotal, total,
                             accepted_at, delivered_at, created_at, updated_at)
  values (v_r, (select v from _ctx where k = 't1'), v_s1, 'DELIVERED', v_p.price, v_p.price,
          now() - interval '6 hours', now() - interval '5 hours', now() - interval '6 hours', now() - interval '5 hours')
  returning id into v_o;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, subtotal)
  values (v_o, v_p.id, v_p.name, 1, v_p.price, v_p.price);

  insert into public.table_sessions (restaurant_id, table_id, started_at, last_activity_at)
  values (v_r, (select v from _ctx where k = 't2'), now() - interval '6 hours', now() - interval '5 hours')
  returning id into v_s2;

  insert into public.table_sessions (restaurant_id, table_id, started_at, last_activity_at)
  values (v_r, (select v from _ctx where k = 't3'), now() - interval '6 hours', now() - interval '5 hours')
  returning id into v_s3;

  insert into _ctx values ('s1', v_s1), ('s2', v_s2), ('s3', v_s3),
    ('s1_token', (select session_token from public.table_sessions where id = v_s1)),
    ('s2_token', (select session_token from public.table_sessions where id = v_s2)),
    ('t1_qr', (select qr_token from public.tables where id = (select v from _ctx where k = 't1'))),
    ('t2_qr', (select qr_token from public.tables where id = (select v from _ctx where k = 't2')));
end $$;

-- ---------------------------------------------------------------------------
-- T01 / T02 · escaneo como cliente (anon)
-- ---------------------------------------------------------------------------
select set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  v_token uuid;
begin
  begin
    select session_token into v_token from public.resolve_table_qr((select v from _ctx where k = 't1_qr'));
    insert into _r (test, ok, detail) values
      ('T01 consumo sin cobrar > 4 h: escanear da error, sin token', false,
       'devolvió token ' || coalesce(v_token::text, 'null'));
  exception when others then
    insert into _r (test, ok, detail) values
      ('T01 consumo sin cobrar > 4 h: escanear da error, sin token',
       sqlstate = 'P0001' and sqlerrm = 'Esta mesa tiene una cuenta pendiente. Pide ayuda al personal.',
       sqlstate || ' ' || sqlerrm);
  end;

  select session_token into v_token from public.resolve_table_qr((select v from _ctx where k = 't2_qr'));
  insert into _r (test, ok, detail) values
    ('T02 sesión vacía vence al escanear (token nuevo)', v_token is distinct from (select v from _ctx where k = 's2_token'),
     'token devuelto distinto al de S2');
end $$;

reset role;

insert into _r (test, ok, detail)
select 'T01b S1 sigue ACTIVE y no se abrió otra sesión en la mesa 1',
       count(*) = 1 and bool_and(id = (select v from _ctx where k = 's1')),
       'sesiones ACTIVE en mesa 1: ' || count(*)
from public.table_sessions
where table_id = (select v from _ctx where k = 't1') and status = 'ACTIVE';

-- T01c · con actividad reciente (< 4 h) el escaneo reutiliza la sesión.
update public.table_sessions set last_activity_at = now() - interval '1 hour'
where id = (select v from _ctx where k = 's1');

select set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  v_token uuid;
begin
  select session_token into v_token from public.resolve_table_qr((select v from _ctx where k = 't1_qr'));
  insert into _r (test, ok, detail) values
    ('T01c consumo sin cobrar < 4 h: el escaneo reutiliza S1', v_token = (select v from _ctx where k = 's1_token'),
     'token devuelto = token de S1');
end $$;

reset role;

insert into _r (test, ok, detail)
select 'T02b S2 quedó EXPIRED', status = 'EXPIRED', status::text
from public.table_sessions where id = (select v from _ctx where k = 's2');

-- ---------------------------------------------------------------------------
-- T03 · barrido (lo que corre pg_cron): S3 vence, S1 no
-- ---------------------------------------------------------------------------
update public.table_sessions set last_activity_at = now() - interval '5 hours'
where id = (select v from _ctx where k = 's1');

do $$
declare
  v_n integer;
begin
  v_n := public.expire_idle_empty_table_sessions((select v from _ctx where k = 'restaurant'));
  insert into _r (test, ok, detail)
  select 'T03 barrido vence S3 vacía y no S1 con consumo',
         (select status from public.table_sessions where id = (select v from _ctx where k = 's3')) = 'EXPIRED'
         and (select status from public.table_sessions where id = (select v from _ctx where k = 's1')) = 'ACTIVE',
         'vencidas en el barrido: ' || v_n;
end $$;

-- ---------------------------------------------------------------------------
-- T04 · la mesa 1 se ve ocupada aunque S1 lleve 5 h sin actividad
-- ---------------------------------------------------------------------------
insert into _r (test, ok, detail)
select 'T04 mesa con consumo sin cobrar = OCCUPIED', s = 'OCCUPIED', s::text
from (select public.table_effective_status((select v from _ctx where k = 't1')) as s) x;

-- ---------------------------------------------------------------------------
-- T05 / T06 · mesero (OWNER aquí) toma pedido en la mesa 1 con clave
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_items jsonb := jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'product'), 'quantity', 1));
  v_a uuid; v_b uuid;
begin
  v_a := public.create_staff_order((select v from _ctx where k = 't1'), v_items, null, (select v from _ctx where k = 'k_staff'));
  v_b := public.create_staff_order((select v from _ctx where k = 't1'), v_items, null, (select v from _ctx where k = 'k_staff'));

  insert into _r (test, ok, detail) values
    ('T05 find_or_create reutiliza S1 (consumo sin cobrar)',
     (select table_session_id from public.orders where id = v_a) = (select v from _ctx where k = 's1'),
     'sesión del pedido = S1'),
    ('T06 create_staff_order idempotente', v_a = v_b, 'mismo id en el reintento');
end $$;

reset role;

insert into _r (test, ok, detail)
select 'T06b un solo pedido con la clave del mesero', count(*) = 1, count(*)::text
from public.orders where client_request_id = (select v from _ctx where k = 'k_staff');

-- ---------------------------------------------------------------------------
-- T07 / T08 / T09 · cliente (anon)
-- ---------------------------------------------------------------------------
select set_config('role', 'anon', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  v_prod  uuid := (select v from _ctx where k = 'product');
  v_items jsonb := jsonb_build_array(jsonb_build_object('product_id', (select v from _ctx where k = 'product'), 'quantity', 2, 'notes', 'sin hielo'));
  v_a uuid; v_b uuid;
  v_other_token uuid;
  v_many jsonb;
  v_case record;
begin
  v_a := public.create_customer_order((select v from _ctx where k = 's1_token'), v_items, 'para compartir', (select v from _ctx where k = 'k_customer'));
  v_b := public.create_customer_order((select v from _ctx where k = 's1_token'), v_items, 'para compartir', (select v from _ctx where k = 'k_customer'));
  insert into _r (test, ok, detail) values ('T07 create_customer_order idempotente', v_a = v_b, 'mismo id en el reintento');

  -- Compatibilidad: la app actual no manda la clave.
  v_b := public.create_customer_order((select v from _ctx where k = 's1_token'), v_items);
  insert into _r (test, ok, detail) values ('T07b sin p_client_request_id crea pedido nuevo', v_b is not null and v_b <> v_a, 'firma de 2 argumentos sigue funcionando');

  -- La nueva sesión de la mesa 2 (T02) intentando reusar la clave de S1.
  select session_token into v_other_token
  from public.resolve_table_qr((select v from _ctx where k = 't2_qr'));
  begin
    perform public.create_customer_order(v_other_token, v_items, null, (select v from _ctx where k = 'k_customer'));
    insert into _r (test, ok, detail) values ('T08 clave usada en otra sesión se rechaza', false, 'no dio error');
  exception when others then
    insert into _r (test, ok, detail) values ('T08 clave usada en otra sesión se rechaza', sqlstate = 'P0001', sqlstate || ' ' || sqlerrm);
  end;

  select jsonb_agg(jsonb_build_object('product_id', v_prod, 'quantity', 1)) into v_many
  from generate_series(1, 51);

  for v_case in
    select * from (values
      ('T09a cantidad 0',        jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 0)),   null::text, 'La cantidad debe estar entre 1 y 99'),
      ('T09b cantidad 100',      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 100)), null::text, 'La cantidad debe estar entre 1 y 99'),
      ('T09c cantidad 1.5',      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1.5)), null::text, 'Producto inválido en el pedido'),
      ('T09d 51 líneas',         v_many,                                                                       null::text, 'Demasiados productos en un solo pedido (máximo 50 líneas)'),
      ('T09e nota línea 201',    jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1, 'notes', repeat('x', 201))), null::text, 'La nota de un producto admite hasta 200 caracteres'),
      ('T09f nota general 201',  jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)),   repeat('x', 201),  'La nota del pedido admite hasta 200 caracteres'),
      ('T09g arreglo vacío',     '[]'::jsonb,                                                                  null::text, 'El pedido debe contener productos')
    ) as c(name, items, notes, expected)
  loop
    begin
      perform public.create_customer_order((select v from _ctx where k = 's1_token'), v_case.items, v_case.notes);
      insert into _r (test, ok, detail) values (v_case.name, false, 'no dio error');
    exception when others then
      insert into _r (test, ok, detail) values (v_case.name, sqlstate = 'P0001' and sqlerrm = v_case.expected, sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  begin
    perform public.create_customer_order((select v from _ctx where k = 's1_token'),
      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 99)));
    insert into _r (test, ok, detail) values ('T09h cantidad 99 se acepta', true, 'ok');
  exception when others then
    insert into _r (test, ok, detail) values ('T09h cantidad 99 se acepta', false, sqlstate || ' ' || sqlerrm);
  end;
end $$;

reset role;

insert into _r (test, ok, detail)
select 'T07c un solo pedido con la clave del cliente', count(*) = 1, count(*)::text
from public.orders where client_request_id = (select v from _ctx where k = 'k_customer');

-- ---------------------------------------------------------------------------
-- T10 / T11 / T12 / T13 · OWNER autenticado
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_bills jsonb;
  v_sum jsonb;
  v_id uuid;
begin
  v_bills := public.list_open_bills((select v from _ctx where k = 'restaurant'));
  insert into _r (test, ok, detail)
  select 'T10 Cuentas abiertas incluye S1 sin cuenta',
         exists (select 1 from jsonb_array_elements(v_bills) e
                 where e ->> 'table_session_id' = (select v from _ctx where k = 's1')::text
                   and (e ->> 'has_bill')::boolean = false
                   and (e ->> 'balance')::numeric > 0),
         'filas: ' || jsonb_array_length(v_bills);

  v_sum := public.get_dashboard_summary((select v from _ctx where k = 'restaurant'));
  insert into _r (test, ok, detail) values
    ('T11a OWNER ve revenue_today', jsonb_typeof(v_sum -> 'revenue_today') = 'number', v_sum ->> 'revenue_today');

  begin
    perform session_token from public.table_sessions limit 1;
    insert into _r (test, ok, detail) values ('T12a session_token no legible', false, 'se pudo leer');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('T12a session_token no legible', true, sqlerrm);
  end;

  select id into v_id from public.table_sessions where id = (select v from _ctx where k = 's1');
  insert into _r (test, ok, detail) values ('T12b id sí es legible', v_id is not null, coalesce(v_id::text, 'null'));

  begin
    insert into public.orders (restaurant_id, table_id, subtotal, total)
    values ((select v from _ctx where k = 'restaurant'), (select v from _ctx where k = 't1'), 1, 1);
    insert into _r (test, ok, detail) values ('T13a authenticated no inserta en orders', false, 'insertó');
  exception when insufficient_privilege then
    insert into _r (test, ok, detail) values ('T13a authenticated no inserta en orders', true, sqlerrm);
  end;

  -- Deja una cuenta abierta en S1 para T14.
  insert into _ctx values ('bill1', ((public.open_bill((select v from _ctx where k = 's1'))) ->> 'id')::uuid);
exception when others then
  insert into _r (test, ok, detail) values ('T10-T13 bloque OWNER', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail) values
  ('T13b authenticated conserva INSERT en categories', has_table_privilege('authenticated', 'public.categories', 'INSERT'), ''),
  ('T13c anon sin INSERT en orders',  not has_table_privilege('anon', 'public.orders', 'INSERT'), ''),
  ('T13d anon sin TRUNCATE en products', not has_table_privilege('anon', 'public.products', 'TRUNCATE'), ''),
  ('T13e authenticated sin TRUNCATE en products', not has_table_privilege('authenticated', 'public.products', 'TRUNCATE'), '');

-- ---------------------------------------------------------------------------
-- T11b / T14 / T15 · WAITER
-- ---------------------------------------------------------------------------
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
declare
  v_sum jsonb;
  v_n bigint;
begin
  v_sum := public.get_dashboard_summary((select v from _ctx where k = 'restaurant'));
  insert into _r (test, ok, detail) values
    ('T11b WAITER recibe revenue_today null (misma clave)',
     v_sum ? 'revenue_today' and jsonb_typeof(v_sum -> 'revenue_today') = 'null', coalesce(v_sum ->> 'revenue_today', 'null'));

  begin
    perform public.set_bill_split((select v from _ctx where k = 'bill1'), 'EQUAL', 2);
    insert into _r (test, ok, detail) values ('T14 set_bill_split rechaza WAITER', false, 'lo permitió');
  exception when others then
    insert into _r (test, ok, detail) values ('T14 set_bill_split rechaza WAITER', sqlerrm = 'No autorizado para cobrar', sqlstate || ' ' || sqlerrm);
  end;

  select count(*) into v_n from public.cash_sessions where restaurant_id = (select v from _ctx where k = 'restaurant');
  insert into _r (test, ok, detail) values ('T15 WAITER no ve cash_sessions', v_n = 0, 'filas visibles: ' || v_n);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- T17 / T18 · cuenta VOID no salda el consumo; void_bill rechaza al WAITER
-- ---------------------------------------------------------------------------
do $$
declare
  v_r uuid := (select v from _ctx where k = 'restaurant');
  v_p public.products%rowtype;
  v_s4 uuid; v_o uuid;
begin
  select * into v_p from public.products where id = (select v from _ctx where k = 'product');

  -- Mesa 3: S3 quedó EXPIRED en T03.
  insert into public.table_sessions (restaurant_id, table_id, started_at, last_activity_at)
  values (v_r, (select v from _ctx where k = 't3'), now() - interval '6 hours', now() - interval '5 hours')
  returning id into v_s4;

  insert into public.orders (restaurant_id, table_id, table_session_id, status, subtotal, total,
                             accepted_at, delivered_at, created_at, updated_at)
  values (v_r, (select v from _ctx where k = 't3'), v_s4, 'DELIVERED', v_p.price, v_p.price,
          now() - interval '6 hours', now() - interval '5 hours', now() - interval '6 hours', now() - interval '5 hours')
  returning id into v_o;

  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, subtotal)
  values (v_o, v_p.id, v_p.name, 1, v_p.price, v_p.price);

  insert into _ctx values ('s4', v_s4);
end $$;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_bill jsonb;
  v_bills jsonb;
begin
  v_bill := public.open_bill((select v from _ctx where k = 's4'));
  perform public.void_bill((v_bill ->> 'id')::uuid, 'prueba QA robustez');

  v_bills := public.list_open_bills((select v from _ctx where k = 'restaurant'));
  insert into _r (test, ok, detail)
  select 'T17b sesión con cuenta VOID sale en Cuentas abiertas sin cuenta viva',
         exists (select 1 from jsonb_array_elements(v_bills) e
                 where e ->> 'table_session_id' = (select v from _ctx where k = 's4')::text
                   and (e ->> 'has_bill')::boolean = false),
         'filas: ' || jsonb_array_length(v_bills);
exception when others then
  insert into _r (test, ok, detail) values ('T17 bloque OWNER (open_bill + void_bill)', false, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

insert into _r (test, ok, detail)
select 'T17a cuenta VOID + pedidos = consumo sin cobrar',
       public.table_session_has_unpaid_consumption((select v from _ctx where k = 's4')),
       (select string_agg(status::text, ',') from public.bills where table_session_id = (select v from _ctx where k = 's4'));

do $$
declare
  v_n integer;
begin
  v_n := public.expire_idle_empty_table_sessions((select v from _ctx where k = 'restaurant'));
  insert into _r (test, ok, detail)
  select 'T17c el barrido no vence la sesión con cuenta VOID',
         (select status from public.table_sessions where id = (select v from _ctx where k = 's4')) = 'ACTIVE',
         'vencidas en el barrido: ' || v_n;
end $$;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'waiter'), 'role', 'authenticated')::text, true);

do $$
begin
  perform public.void_bill((select v from _ctx where k = 'bill1'), 'intento del mesero');
  insert into _r (test, ok, detail) values ('T18 void_bill rechaza WAITER', false, 'lo permitió');
exception when others then
  insert into _r (test, ok, detail) values ('T18 void_bill rechaza WAITER',
    sqlerrm = 'Solo el dueño o un administrador anulan cuentas', sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- T16 · add_staff_member (cuentas de auth creadas solo dentro de la transacción)
-- ---------------------------------------------------------------------------
do $$
declare
  v_old uuid := gen_random_uuid();
  v_new uuid := gen_random_uuid();
begin
  begin
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values
      (v_old, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'qa-robustez-old-' || v_old || '@example.invalid', now() - interval '1 hour', now()),
      (v_new, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'qa-robustez-new-' || v_new || '@example.invalid', now(), now());
    insert into _ctx values ('u_old', v_old), ('u_new', v_new);
  exception when others then
    insert into _r (test, ok, detail) values ('T16 preparación auth.users', false, sqlstate || ' ' || sqlerrm);
  end;
end $$;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
                  json_build_object('sub', (select v from _ctx where k = 'owner'), 'role', 'authenticated')::text, true);

do $$
declare
  v_m uuid;
begin
  if not exists (select 1 from _ctx where k = 'u_old') then
    return;
  end if;

  begin
    perform public.add_staff_member((select v from _ctx where k = 'restaurant'), (select v from _ctx where k = 'u_old'), 'WAITER', 'Cuenta Vieja');
    insert into _r (test, ok, detail) values ('T16a rechaza cuenta de hace 1 h', false, 'la vinculó');
  exception when others then
    insert into _r (test, ok, detail) values ('T16a rechaza cuenta de hace 1 h', sqlstate = 'P0001', sqlerrm);
  end;

  begin
    v_m := public.add_staff_member((select v from _ctx where k = 'restaurant'), (select v from _ctx where k = 'u_new'), 'WAITER', 'Cuenta Nueva');
    insert into _r (test, ok, detail) values ('T16b acepta cuenta recién creada', v_m is not null, 'member ' || v_m);
  exception when others then
    insert into _r (test, ok, detail) values ('T16b acepta cuenta recién creada', false, sqlstate || ' ' || sqlerrm);
  end;
end $$;

reset role;

select n, test, ok, detail from _r order by n;

rollback;
