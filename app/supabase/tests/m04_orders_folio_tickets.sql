-- M04-T01 · Ejecutar como postgres DESPUÉS de la migración 20261022010000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK. Falla (raise) en la
-- primera prueba incorrecta; si llega al final, el SELECT lista las pasadas.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m04 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m04 to public;
grant usage on sequence _m04_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_t uuid; v_prod public.products%rowtype;
  v_o1 uuid; v_o2 uuid; v_f1 int; v_f2 int; v_max int; v_items jsonb;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;

  -- Backfill: ningún pedido sin folio/código; sin duplicados; 1 ticket por pedido.
  insert into _m04 (test, ok) values
    ('backfill: folio y short_code no nulos',
      not exists (select 1 from public.orders where folio is null or short_code is null)),
    ('backfill: folio consecutivo 1..N por restaurante',
      not exists (select 1 from (select restaurant_id, count(*) c, max(folio) m, min(folio) mn, count(distinct folio) d
                  from public.orders group by 1) x where x.m <> x.c or x.mn <> 1 or x.d <> x.c)),
    ('backfill: todo pedido tiene comanda #1',
      not exists (select 1 from public.orders o where not exists
        (select 1 from public.tickets t where t.order_id = o.id and t.number = 1))),
    ('backfill: todo item tiene ticket de su pedido',
      not exists (select 1 from public.order_items i left join public.tickets t on t.id = i.ticket_id
        where t.id is null or t.order_id <> i.order_id)),
    ('backfill: COUNTER = dine_in_no_table',
      not exists (select 1 from public.orders o join public.tables t on t.id = o.table_id
        where (t.kind = 'COUNTER') <> (o.service_type = 'dine_in_no_table'))),
    ('backfill: short_code con formato',
      not exists (select 1 from public.orders where short_code !~ '^[A-Z0-9]{5}$'));

  -- Pedido nuevo vía create_staff_order como OWNER.
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select id into v_t from public.tables where restaurant_id = v_r and kind = 'TABLE' order by number limit 1;
  select * into v_prod from public.products where restaurant_id = v_r and active and available order by id limit 1;
  if v_owner is null or v_t is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;

  update public.table_sessions set status = 'CLOSED', closed_at = now()
    where table_id = v_t and status = 'ACTIVE';

  select coalesce(max(folio), 0) into v_max from public.orders where restaurant_id = v_r;

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims',
            json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 2));
  v_o1 := public.create_staff_order(v_t, v_items, null);
  v_o2 := public.create_staff_order(v_t, v_items, null);
  perform set_config('role', 'postgres', true);

  select folio into v_f1 from public.orders where id = v_o1;
  select folio into v_f2 from public.orders where id = v_o2;

  insert into _m04 (test, ok) values
    ('create_staff_order asigna folio siguiente', v_f1 = v_max + 1),
    ('segundo pedido: folio consecutivo', v_f2 = v_f1 + 1),
    ('short_code distinto y válido',
      (select count(distinct short_code) = 2 and bool_and(short_code ~ '^[A-Z0-9]{5}$')
         from public.orders where id in (v_o1, v_o2))),
    ('service_type = table en mesa normal',
      (select service_type from public.orders where id = v_o1) = 'table'),
    ('items nuevos sin ticket_id reciben comanda #1 del pedido',
      (select count(*) = 1 and bool_and(t.number = 1 and t.order_id = v_o1)
         from public.order_items i join public.tickets t on t.id = i.ticket_id where i.order_id = v_o1)
      and (select count(*) from public.tickets where order_id = v_o1) = 1),
    ('contador coincide con el máximo folio',
      (select last_folio from public.order_counters where restaurant_id = v_r) = v_f2),
    ('status_review por defecto = reviewed',
      (select status_review from public.orders where id = v_o1) = 'reviewed');

  -- Unicidad y RLS.
  begin
    update public.orders set folio = v_f1 where id = v_o2;
    insert into _m04 (test, ok) values ('folio duplicado rechazado', false);
  exception when unique_violation then
    insert into _m04 (test, ok) values ('folio duplicado rechazado', true);
  end;

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims',
            json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  insert into _m04 (test, ok) values
    ('staff lee tickets de su restaurante',
      (select count(*) from public.tickets where order_id = v_o1) = 1);
  begin
    insert into public.tickets (order_id, number) values (v_o1, 9);
    insert into _m04 (test, ok) values ('authenticated no escribe tickets', false);
  exception when insufficient_privilege then
    insert into _m04 (test, ok) values ('authenticated no escribe tickets', true);
  end;
  begin
    perform 1 from public.order_counters limit 1;
    insert into _m04 (test, ok) values ('authenticated no lee order_counters', false);
  exception when insufficient_privilege then
    insert into _m04 (test, ok) values ('authenticated no lee order_counters', true);
  end;
  perform set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform 1 from public.tickets limit 1;
    insert into _m04 (test, ok) values ('anon no lee tickets', false);
  exception when insufficient_privilege then
    insert into _m04 (test, ok) values ('anon no lee tickets', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m04 where not ok) then
    raise exception 'M04-T01 falló: %', (select string_agg(test, '; ') from _m04 where not ok);
  end if;
end $$;

select n, test, ok from _m04 order by n;
rollback;
