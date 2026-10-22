-- M09 · Tiempo real y contadores. Ejecutar como postgres DESPUÉS de 20261023120000
-- (y de 20261023140000 para el contador de pedidos del QR, ver al final).
-- Solo monky-qa, todo en BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m09 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m09 to public;
grant usage on sequence _m09_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_prod public.products%rowtype; v_tbl public.tables%rowtype;
  v_items jsonb; v_c0 jsonb; v_c1 jsonb; v_ord uuid; v_tok uuid; v_tk public.tickets%rowtype;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1 order by p.id limit 1;
  select t.* into v_tbl from public.tables t where t.restaurant_id = v_r and t.kind = 'TABLE'
    and t.status <> 'INACTIVE' order by t.number limit 1;
  if v_owner is null or v_prod.id is null or v_tbl.id is null then raise exception 'Faltan datos de monky-qa'; end if;
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 1));

  -- publicación y replica identity
  insert into _m09 (test, ok) values
    ('tickets publicada en supabase_realtime', exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets')),
    ('availability publicada en supabase_realtime', exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'availability')),
    ('tickets con replica identity full', (select relreplident = 'f' from pg_class where oid = 'public.tickets'::regclass)),
    ('tickets.restaurant_id es NOT NULL', (select attnotnull from pg_attribute
        where attrelid = 'public.tickets'::regclass and attname = 'restaurant_id'));

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_c0 := public.get_staff_counters(v_r);

  -- pedido del mesero: una comanda por preparar y restaurant_id del ticket
  v_ord := public.create_staff_order(v_tbl.id, v_items, 'M09', gen_random_uuid());
  v_c1 := public.get_staff_counters(v_r);
  perform set_config('role', 'postgres', true);
  select * into v_tk from public.tickets where order_id = v_ord order by number limit 1;
  insert into _m09 (test, ok) values
    ('el ticket hereda restaurant_id del pedido', v_tk.restaurant_id = v_r),
    ('comandas por preparar sube 1', (v_c1 ->> 'tickets_to_prepare')::int = (v_c0 ->> 'tickets_to_prepare')::int + 1),
    ('mesas activas cuenta la mesa ocupada', (v_c1 ->> 'active_tables')::int >= 1),
    ('contadores traen server_time', v_c1 ? 'server_time');
  -- el llamador no puede imponer el restaurante del ticket
  begin
    insert into public.tickets (order_id, number, restaurant_id) values (v_ord, 99, gen_random_uuid());
    insert into _m09 (test, ok) values ('restaurant_id del ticket se fuerza desde el pedido',
      (select restaurant_id = v_r from public.tickets where order_id = v_ord and number = 99));
  exception when others then
    insert into _m09 (test, ok) values ('restaurant_id del ticket se fuerza desde el pedido: ' || sqlerrm, false);
  end;

  -- llamada al mesero y a la cuenta
  select session_token into v_tok from public.table_sessions where id = (select table_session_id from public.orders where id = v_ord);
  perform set_config('role', 'anon', true);
  perform public.create_waiter_call(v_tok, 'WAITER');
  perform set_config('role', 'authenticated', true);
  v_c1 := public.get_staff_counters(v_r);
  insert into _m09 (test, ok) values
    ('solicitando mesero sube', (v_c1 ->> 'waiter_requested')::int = (v_c0 ->> 'waiter_requested')::int + 1);

  perform set_config('role', 'anon', true);
  perform public.create_waiter_call(v_tok, 'BILL');
  perform set_config('role', 'authenticated', true);
  v_c1 := public.get_staff_counters(v_r);
  insert into _m09 (test, ok) values
    ('pedir la cuenta sube solicitando cuenta', (v_c1 ->> 'bill_requested')::int = (v_c0 ->> 'bill_requested')::int + 1),
    ('pedir la cuenta limpia solicitando mesero de esa mesa', (v_c1 ->> 'waiter_requested')::int = (v_c0 ->> 'waiter_requested')::int);

  -- sin sesión de miembro del restaurante
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.get_staff_counters(v_r);
    insert into _m09 (test, ok) values ('un ajeno no lee contadores', false);
  exception when others then
    insert into _m09 (test, ok) values ('un ajeno no lee contadores', sqlstate = '42501');
  end;
  perform set_config('role', 'anon', true);
  begin
    perform public.get_staff_counters(v_r);
    insert into _m09 (test, ok) values ('anon no ejecuta get_staff_counters', false);
  exception when insufficient_privilege then
    insert into _m09 (test, ok) values ('anon no ejecuta get_staff_counters', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m09 where ok is not true) then
    raise exception 'M09 falló: %', (select string_agg(test, '; ') from _m09 where ok is not true);
  end if;
end $$;

select n, test, ok from _m09 order by n;
rollback;
