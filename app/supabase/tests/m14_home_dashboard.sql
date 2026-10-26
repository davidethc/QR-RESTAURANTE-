-- M14 · Dashboard "Hoy". Ejecutar como postgres DESPUÉS de 20261025100000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m14 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m14 to public;
grant usage on sequence _m14_n_seq to public;

do $$
declare
  v_r      uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner  uuid;
  v_waiter uuid;
  v_to     date := current_date;
  v_from   date := current_date - 365;
  v_d      jsonb;
  v_one    jsonb;
  v_sum    numeric;
  v_n      int;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select user_id into v_waiter from public.restaurant_members
    where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE'
      and not (roles && array['ADMIN']::text[]) limit 1;

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_d := public.get_home_dashboard(v_r, v_from, v_to);

  insert into _m14 (test, ok) values ('ventas: total = punto de venta + menú digital',
    (v_d->'sales'->>'total')::numeric
      = (v_d->'sales'->>'pos')::numeric + (v_d->'sales'->>'digital')::numeric);

  insert into _m14 (test, ok) values ('pedidos: total = punto de venta + menú digital',
    (v_d->'orders'->>'total')::int
      = (v_d->'orders'->>'pos')::int + (v_d->'orders'->>'digital')::int);

  select coalesce(sum((s->>'total')::numeric), 0) into v_sum
  from jsonb_array_elements(v_d->'by_service') s;
  insert into _m14 (test, ok) values ('por opción de servicio cuadra con el total (±0.05 por redondeo)',
    abs(v_sum - (v_d->'sales'->>'total')::numeric) <= 0.05);

  insert into _m14 (test, ok) values ('ticket promedio = ventas ÷ pedidos',
    (v_d->'avg_ticket'->>'total')::numeric = case when (v_d->'orders'->>'total')::int > 0
      then round((v_d->'sales'->>'total')::numeric / (v_d->'orders'->>'total')::int, 2) else 0 end);

  insert into _m14 (test, ok) values ('rango de varios días trae los 7 días de la semana',
    jsonb_array_length(v_d->'by_weekday') = 7);

  insert into _m14 (test, ok) values ('menos vendidos y más vendidos traen máximo 5',
    jsonb_array_length(v_d->'top_products') <= 5 and jsonb_array_length(v_d->'bottom_products') <= 5);

  v_one := public.get_home_dashboard(v_r, v_to, v_to);
  insert into _m14 (test, ok) values ('un solo día trae un solo día de la semana',
    jsonb_array_length(v_one->'by_weekday') = 1 and (v_one->>'days')::int = 1);

  -- Un pedido cancelado sin cobro no suma: el total no puede superar lo cobrado.
  perform set_config('role', 'postgres', true);
  select count(*) into v_n
  from public.orders o
  join public.bills b on b.table_session_id = o.table_session_id
  where o.restaurant_id = v_r and (o.cancelled or o.status in ('REJECTED', 'CANCELLED'))
    and b.status in ('OPEN', 'VOID');
  select coalesce(sum(b.total), 0) into v_sum
  from public.bills b
  where b.restaurant_id = v_r and b.status in ('PAID', 'CLOSED')
    and coalesce(b.paid_at, b.closed_at) >= (v_from + time '00:00') at time zone 'UTC' - interval '2 days';
  insert into _m14 (test, ok) values ('las ventas nunca superan lo cobrado en cuentas pagadas',
    (v_d->'sales'->>'total')::numeric <= v_sum + 0.05);

  if v_waiter is not null then
    perform set_config('role', 'authenticated', true),
            set_config('request.jwt.claims', json_build_object('sub', v_waiter, 'role', 'authenticated')::text, true);
    begin
      perform public.get_home_dashboard(v_r, v_from, v_to);
      insert into _m14 (test, ok) values ('mesero no ve el panel de ventas', false);
    exception when insufficient_privilege then
      insert into _m14 (test, ok) values ('mesero no ve el panel de ventas', true);
    end;
    perform set_config('role', 'postgres', true);
  end if;

  perform set_config('role', 'anon', true);
  begin
    perform public.get_home_dashboard(v_r, v_from, v_to);
    insert into _m14 (test, ok) values ('anon no ejecuta get_home_dashboard', false);
  exception when insufficient_privilege then
    insert into _m14 (test, ok) values ('anon no ejecuta get_home_dashboard', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m14 where not ok) then
    raise exception 'M14 falló: %', (select string_agg(test, '; ') from _m14 where not ok);
  end if;
end $$;

select n, test, ok from _m14 order by n;
rollback;
