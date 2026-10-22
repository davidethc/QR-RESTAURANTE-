-- M08 · Caja y cortes (CASHIER, corte a ciegas, numeración). Ejecutar como
-- postgres DESPUÉS de 20261023110000. Solo monky-qa, todo en BEGIN ... ROLLBACK.
-- Requiere en monky-qa: un OWNER activo y un miembro WAITER activo (se le
-- asigna CASHIER solo dentro de la transacción).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m08 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m08 to public;
grant usage on sequence _m08_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_cashier uuid; v_prod public.products%rowtype; v_price numeric;
  v_regA uuid; v_regB uuid; v_csA uuid; v_csB uuid; v_o jsonb; v_bill uuid;
  v_res jsonb; v_pay uuid; v_exp numeric; v_exp_card numeric; v_n0 int; v_m1 jsonb; v_m2 jsonb;
  v_s public.cash_sessions%rowtype; v_pre jsonb; v_items jsonb;
  v_msg text; v_hint text; v_cut_a int;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select user_id into v_cashier from public.restaurant_members
    where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1 order by p.id limit 1;
  if v_owner is null or v_cashier is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;
  select price into v_price from public.product_variants where product_id = v_prod.id;
  update public.restaurants set billing_enabled = true where id = v_r;
  update public.cash_sessions set status = 'CLOSED', closed_at = now() where restaurant_id = v_r and status = 'OPEN';

  insert into public.cash_registers (restaurant_id, name) values (v_r, 'Caja A M08') returning id into v_regA;
  insert into public.cash_registers (restaurant_id, name) values (v_r, 'Caja B M08') returning id into v_regB;
  -- El mesero pasa a CASHIER solo de la caja A (rollback al final).
  update public.restaurant_members set roles = array['CASHIER'], cash_register_ids = array[v_regA]
    where restaurant_id = v_r and user_id = v_cashier;

  v_n0 := coalesce((select max(cut_number) from public.cash_sessions where restaurant_id = v_r), 0);
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 2));

  -- helpers de rol: owner / cashier / postgres
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_cashier, 'role', 'authenticated')::text, true);

  -- ---- CASHIER abre solo SU caja
  v_res := public.open_cash_session(v_regA, 100);
  v_csA := (v_res ->> 'id')::uuid;
  insert into _m08 (test, ok) values ('CASHIER abre su caja', v_res ->> 'status' = 'OPEN');
  begin
    perform public.open_cash_session(v_regB, 0);
    insert into _m08 (test, ok) values ('CASHIER no abre una caja ajena', false);
  exception when others then
    insert into _m08 (test, ok) values ('CASHIER no abre una caja ajena', sqlerrm like '%No autorizado%');
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_csB := (public.open_cash_session(v_regB, 50) ->> 'id')::uuid;

  -- ---- cobro de mostrador por CASHIER
  v_o := public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r, 'Cliente M08');
  v_bill := (v_o ->> 'bill_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cashier, 'role', 'authenticated')::text, true);
  begin
    -- hay dos cajas abiertas y el CASHIER solo tiene la A: cobra en la A sin indicarla
    v_res := public.record_payment(v_bill, 'CASH', v_price, gen_random_uuid(), 0, v_price);
    v_pay := (v_res ->> 'payment_id')::uuid;
    insert into _m08 (test, ok) values ('CASHIER cobra y elige su única caja abierta', true);
  exception when others then
    insert into _m08 (test, ok) values ('CASHIER cobra y elige su única caja abierta: ' || sqlerrm, false);
  end;
  begin
    perform public.record_payment(v_bill, 'CASH', 1, gen_random_uuid(), 0, 1, null, null, null, v_csB);
    insert into _m08 (test, ok) values ('CASHIER no cobra en la caja de otro', false);
  exception when others then
    insert into _m08 (test, ok) values ('CASHIER no cobra en la caja de otro', sqlerrm like '%esta caja%');
  end;
  begin
    perform public.void_payment(v_pay, 'prueba M08');
    insert into _m08 (test, ok) values ('CASHIER no anula pagos', false);
  exception when others then
    insert into _m08 (test, ok) values ('CASHIER no anula pagos', true);
  end;
  begin
    perform public.apply_bill_discount(v_bill, 'FIXED', 1, 'prueba M08');
    insert into _m08 (test, ok) values ('CASHIER no aplica descuentos', false);
  exception when others then
    insert into _m08 (test, ok) values ('CASHIER no aplica descuentos', true);
  end;

  -- ---- movimientos: numeración, motivo, evento de retiro
  v_m1 := public.add_cash_movement(v_csA, 'IN', 'FLOAT_TOPUP', 10, null, gen_random_uuid());
  v_m2 := public.add_cash_movement(v_csA, 'OUT', 'WITHDRAWAL', 4, 'retiro parcial', gen_random_uuid());
  insert into _m08 (test, ok) values
    ('movimientos consecutivos', (v_m2 ->> 'number')::int = (v_m1 ->> 'number')::int + 1),
    ('CASHIER no puede ver movimientos de caja ajena',
      jsonb_array_length(public.list_cash_movements(v_r, v_regB)) = 0);
  begin
    perform public.add_cash_movement(v_csB, 'IN', 'FLOAT_TOPUP', 1, null, gen_random_uuid());
    insert into _m08 (test, ok) values ('CASHIER no mueve efectivo de otra caja', false);
  exception when others then
    insert into _m08 (test, ok) values ('CASHIER no mueve efectivo de otra caja', sqlerrm like '%No autorizado%');
  end;
  begin
    perform public.add_cash_movement(v_csA, 'OUT', 'OTHER', 1, 'x', gen_random_uuid());
    insert into _m08 (test, ok) values ('motivo OTHER exige descripción', false);
  exception when others then
    insert into _m08 (test, ok) values ('motivo OTHER exige descripción', sqlerrm like '%Describe el motivo%');
  end;
  -- retiro mayor al esperado: no hay oráculo para CASHIER (se acepta)
  v_m1 := public.add_cash_movement(v_csA, 'OUT', 'EXPENSE', 500, 'gasto', gen_random_uuid());
  perform public.add_cash_movement(v_csA, 'IN', 'FLOAT_TOPUP', 600, null, gen_random_uuid());
  insert into _m08 (test, ok) values ('CASHIER: el retiro no se valida contra lo esperado (sin oráculo)', v_m1 ->> 'id' is not null);

  -- ---- corte a ciegas
  v_res := public.get_cash_session_summary(v_csA);
  insert into _m08 (test, ok) values
    ('resumen abierto para CASHIER no trae esperado',
      not (v_res ? 'expected_cash') and not (v_res ? 'expected_total') and (v_res ->> 'can_see_expected')::boolean = false);

  perform set_config('role', 'postgres', true);
  -- pedido sin cobrar (mostrador, vivo con líneas)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_o := public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r, 'Sin cobrar M08');
  perform set_config('request.jwt.claims', json_build_object('sub', v_cashier, 'role', 'authenticated')::text, true);

  v_pre := public.get_cash_cut_precheck(v_csA);
  insert into _m08 (test, ok) values
    ('precheck lista pedidos sin cobrar', (v_pre ->> 'pending_count')::int >= 1 and jsonb_array_length(v_pre -> 'pending_folios') >= 1),
    ('precheck: sin cobros con tarjeta', not (v_pre ->> 'has_card_payments')::boolean);

  begin
    perform public.cash_cut(v_csA, jsonb_build_object('CASH', 1), 0, null, false);
    insert into _m08 (test, ok) values ('corte bloqueado por pedidos sin cobrar', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m08 (test, ok) values ('corte bloqueado por pedidos sin cobrar', v_hint = 'PENDING_ORDERS');
  end;
  begin
    perform public.cash_cut(v_csA, jsonb_build_object('CASH', 1), 5, null, true);
    insert into _m08 (test, ok) values ('fondo mayor al contado se rechaza', false);
  exception when others then
    insert into _m08 (test, ok) values ('fondo mayor al contado se rechaza', sqlerrm like '%fondo%');
  end;

  perform set_config('role', 'postgres', true);
  v_exp := (select expected from public.cash_session_expected(v_csA) where method = 'CASH');
  perform set_config('role', 'authenticated', true);

  v_res := public.cash_cut(v_csA, jsonb_build_object('CASH', v_exp - 2), 20, 'turno M08', true);
  perform set_config('role', 'postgres', true);
  select * into v_s from public.cash_sessions where id = v_csA;
  v_cut_a := v_s.cut_number;
  insert into _m08 (test, ok) values
    ('corte con omitir: cerrado y numerado', v_s.status = 'CLOSED' and v_s.cut_number = v_n0 + 1),
    ('resultado SHORT por faltante', v_s.result = 'SHORT'),
    ('fondo y retiro calculados', v_s.cash_float_left = 20 and v_s.cash_to_withdraw = v_exp - 2 - 20),
    ('omitidos registrados con folios', v_s.skipped_pending_orders and cardinality(v_s.skipped_order_folios) >= 1),
    ('diferencia por método guardada', (select difference from public.cash_session_counts where cash_session_id = v_csA and method = 'CASH') = -2),
    ('evento de corte con diferencia', exists (select 1 from public.audit_logs where entity_id = v_csA and action = 'CLOSE_CASH_SESSION'
        and (metadata ->> 'cash_difference')::numeric = -2)),
    ('evento de pendientes omitidos', exists (select 1 from public.audit_logs where entity_id = v_csA
        and metadata ->> 'action' = 'SKIP_PENDING_ORDERS')),
    ('CASHIER ve el resumen una vez guardado', (v_res ->> 'result') = 'SHORT' and (v_res ? 'expected_cash')),
    ('existe evento de retiro', exists (select 1 from public.security_events where false) or exists (
        select 1 from public.audit_logs where action = 'CASH_MOVEMENT' and entity_id = (v_m2 ->> 'id')::uuid and metadata ->> 'type' = 'OUT'));

  -- ---- envoltorio legacy en la caja B (owner): cierra sin bloquear y numera a continuación
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_exp := null;
  perform set_config('role', 'postgres', true);
  v_exp := (select expected from public.cash_session_expected(v_csB) where method = 'CASH');
  perform set_config('role', 'authenticated', true);
  v_res := public.close_cash_session(v_csB, jsonb_build_object('CASH', v_exp), 'legacy');
  insert into _m08 (test, ok) values
    ('close_cash_session (legacy) no bloquea y devuelve resumen', v_res ->> 'status' = 'CLOSED' and (v_res ->> 'result') = 'EXACT'),
    ('numeración continúa entre cajas', (v_res ->> 'cut_number')::int = v_cut_a + 1);

  -- ---- lecturas del CASHIER
  perform set_config('request.jwt.claims', json_build_object('sub', v_cashier, 'role', 'authenticated')::text, true);
  insert into _m08 (test, ok) values
    ('list_cash_cuts del CASHIER solo trae su caja',
      (select bool_and((e ->> 'register_id')::uuid = v_regA) from jsonb_array_elements(public.list_cash_cuts(v_r)) e)),
    ('último fondo de la caja A = 20',
      (select (e ->> 'cash_float_left')::numeric = 20 from jsonb_array_elements(public.get_last_cash_float(v_r)) e
        where (e ->> 'register_id')::uuid = v_regA)),
    ('último fondo no lista cajas ajenas',
      not exists (select 1 from jsonb_array_elements(public.get_last_cash_float(v_r)) e where (e ->> 'register_id')::uuid = v_regB));

  -- ---- anon sin acceso
  perform set_config('role', 'anon', true);
  begin
    perform public.cash_cut(v_csA, '{}'::jsonb);
    insert into _m08 (test, ok) values ('anon no ejecuta cash_cut', false);
  exception when insufficient_privilege then
    insert into _m08 (test, ok) values ('anon no ejecuta cash_cut', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m08 where ok is not true) then
    raise exception 'M08 falló: %', (select string_agg(test, '; ') from _m08 where ok is not true);
  end if;
end $$;

select n, test, ok from _m08 order by n;
rollback;
