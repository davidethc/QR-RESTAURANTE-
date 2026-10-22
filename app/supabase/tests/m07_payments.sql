-- M07 · Cobro. Ejecutar como postgres DESPUÉS de 20261022120000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m07 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m07 to public;
grant usage on sequence _m07_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_prod public.products%rowtype; v_price numeric; v_reg uuid; v_cs uuid;
  v_items jsonb; v_o jsonb; v_bill uuid; v_total numeric; v_res jsonb; v_res2 jsonb; v_key uuid := gen_random_uuid();
  v_pay uuid; v_sale jsonb; v_o2 jsonb;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1 order by p.id limit 1;
  if v_owner is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;
  select price into v_price from public.product_variants where product_id = v_prod.id;
  update public.restaurants set billing_enabled = true where id = v_r;

  -- Una sola caja abierta, propia de la prueba.
  update public.cash_sessions set status = 'CLOSED', closed_at = now() where restaurant_id = v_r and status = 'OPEN';
  insert into public.cash_registers (restaurant_id, name) values (v_r, 'Caja prueba M07') returning id into v_reg;
  insert into public.cash_sessions (restaurant_id, register_id, opened_by, opening_float)
    values (v_r, v_reg, v_owner, 0) returning id into v_cs;

  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 4));
  v_total := v_price * 4;

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_o := public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r, 'Cliente M07');
  v_bill := (v_o ->> 'bill_id')::uuid;

  -- Efectivo con cambio: record_payment (flujo actual) conserva su contrato.
  v_res := public.record_payment(v_bill, 'CASH', 1, gen_random_uuid(), 0, 5);
  perform set_config('role', 'postgres', true);
  insert into _m07 (test, ok) values
    ('record_payment efectivo: cambio = recibido - cobrado', (v_res ->> 'change_amount')::numeric = 4),
    ('record_payment numera el pago #1', (v_res ->> 'payment_number') = '1'),
    ('el pago guarda caja y recibido', (select cash_register_id = v_reg and tendered_amount = 5 and change_amount = 4
        from public.payments where id = (v_res ->> 'payment_id')::uuid));
  perform set_config('role', 'authenticated', true);
  begin
    perform public.record_payment(v_bill, 'CASH', 1, gen_random_uuid(), 0, 0.5);
    insert into _m07 (test, ok) values ('efectivo insuficiente se rechaza (cambio nunca negativo)', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m07 (test, ok) values ('efectivo insuficiente se rechaza (cambio nunca negativo)', sqlerrm like '%no alcanza%');
    perform set_config('role', 'authenticated', true);
  end;

  -- Varios métodos: tarjeta + transferencia + efectivo cubren el resto.
  v_res := public.record_payments(v_bill, v_total - 1, jsonb_build_array(
      jsonb_build_object('method', 'CARD', 'received', 1.5, 'card_type', 'VISA'),
      jsonb_build_object('method', 'TRANSFER', 'received', 1, 'reference', 'T-1'),
      jsonb_build_object('method', 'CASH', 'received', v_total + 20)), v_key);
  perform set_config('role', 'postgres', true);
  insert into _m07 (test, ok) values
    ('varios métodos: 3 pagos numerados 2..4', (select array_agg(number order by number) = array[1,2,3,4]
        from public.payments where bill_id = v_bill)),
    ('varios métodos: efectivo aplica solo el resto y da cambio',
       (select amount = v_total - 1 - 1.5 - 1 and change_amount = (v_total + 20) - amount
        from public.payments where bill_id = v_bill and method = 'CASH' and number = 4)),
    ('varios métodos: la cuenta queda pagada y cerrada', (v_res -> 'bill' ->> 'balance')::numeric = 0),
    ('varios métodos: la suma de pagos = total',
       (select sum(amount) = v_total from public.payments where bill_id = v_bill and status = 'COMPLETED'));
  perform set_config('role', 'authenticated', true);
  v_res2 := public.record_payments(v_bill, v_total - 1, jsonb_build_array(
      jsonb_build_object('method', 'CARD', 'received', 1.5),
      jsonb_build_object('method', 'TRANSFER', 'received', 1),
      jsonb_build_object('method', 'CASH', 'received', v_total + 20)), v_key);
  perform set_config('role', 'postgres', true);
  insert into _m07 (test, ok) values
    ('varios métodos idempotente (sin pagos nuevos)', (v_res2 ->> 'replayed') = 'true'
       and (select count(*) = 4 from public.payments where bill_id = v_bill));
  perform set_config('role', 'authenticated', true);

  -- Faltante y cuenta ya pagada.
  v_o2 := public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r);
  begin
    perform public.record_payments((v_o2 ->> 'bill_id')::uuid, v_total, jsonb_build_array(
      jsonb_build_object('method', 'CARD', 'received', 3),
      jsonb_build_object('method', 'CASH', 'received', 1)), gen_random_uuid());
    insert into _m07 (test, ok) values ('varios métodos: suma insuficiente se rechaza', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m07 (test, ok) values ('varios métodos: suma insuficiente se rechaza', sqlerrm like 'Faltan%');
    perform set_config('role', 'authenticated', true);
  end;
  perform set_config('role', 'postgres', true);
  insert into _m07 (test, ok) values ('rechazo no deja pagos a medias',
    not exists (select 1 from public.payments where bill_id = (v_o2 ->> 'bill_id')::uuid));
  perform set_config('role', 'authenticated', true);
  begin
    perform public.record_payments((v_o2 ->> 'bill_id')::uuid, v_total, jsonb_build_array(
      jsonb_build_object('method', 'CARD', 'received', v_total),
      jsonb_build_object('method', 'CARD', 'received', 1)), gen_random_uuid());
    insert into _m07 (test, ok) values ('método repetido se rechaza', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m07 (test, ok) values ('método repetido se rechaza', sqlerrm like '%una sola vez%');
    perform set_config('role', 'authenticated', true);
  end;

  -- Reembolso con método distinto deja evento.
  select id into v_pay from public.payments where bill_id = v_bill and method = 'CARD';
  perform public.void_payment_with_refund(v_pay, 'devolución en efectivo', 'CASH');
  perform set_config('role', 'postgres', true);
  insert into _m07 (test, ok) values
    ('anular con otro método registra evento', exists (
        select 1 from public.audit_logs where entity_id = v_pay and action = 'VOID_PAYMENT'
          and (metadata ->> 'refund_method_changed')::boolean and metadata ->> 'original_method' = 'CARD')),
    ('el pago queda anulado', (select status = 'VOIDED' from public.payments where id = v_pay));
  perform set_config('role', 'authenticated', true);

  -- Cuenta anulada / pedido cancelado no se cobra.
  perform public.cancel_counter_sale((v_o2 ->> 'bill_id')::uuid, 'prueba cancelada');
  begin
    perform public.record_payment((v_o2 ->> 'bill_id')::uuid, 'CARD', 1, gen_random_uuid());
    insert into _m07 (test, ok) values ('cuenta anulada no se cobra', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m07 (test, ok) values ('cuenta anulada no se cobra', sqlerrm like '%anulada%');
    perform set_config('role', 'authenticated', true);
  end;
  begin
    perform public.record_payments((v_o2 ->> 'bill_id')::uuid, 1, jsonb_build_array(
      jsonb_build_object('method', 'CARD', 'received', 1)), gen_random_uuid());
    insert into _m07 (test, ok) values ('record_payments en cuenta anulada se rechaza', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m07 (test, ok) values ('record_payments en cuenta anulada se rechaza', sqlerrm like '%anulada%');
    perform set_config('role', 'authenticated', true);
  end;

  -- create_counter_sale y add_items_to_bill con variantes.
  v_sale := public.create_counter_sale(v_items, gen_random_uuid());
  perform set_config('role', 'postgres', true);
  insert into _m07 (test, ok) values
    ('create_counter_sale guarda variante', exists (
        select 1 from public.order_items where order_id = (v_sale ->> 'order_id')::uuid and variant_id is not null and unit_price = v_price)),
    ('create_counter_sale crea comanda #1', exists (select 1 from public.tickets where order_id = (v_sale ->> 'order_id')::uuid and number = 1)),
    ('create_counter_sale: total correcto', (v_sale -> 'bill' ->> 'total')::numeric = v_total);
  perform set_config('role', 'authenticated', true);
  v_res := public.add_items_to_bill((v_sale ->> 'bill_id')::uuid, jsonb_build_array(
      jsonb_build_object('product_id', v_prod.id, 'quantity', 1)), gen_random_uuid(), true);
  perform set_config('role', 'postgres', true);
  insert into _m07 (test, ok) values
    ('add_items_to_bill guarda variante', exists (
        select 1 from public.order_items where order_id = (v_res ->> 'added_order_id')::uuid and variant_id is not null)),
    ('add_items_to_bill suma a la cuenta', (v_res ->> 'total')::numeric = v_total + v_price);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.add_items_to_bill((v_sale ->> 'bill_id')::uuid, jsonb_build_array(
      jsonb_build_object('product_id', v_prod.id, 'quantity', 1, 'variant_id', gen_random_uuid())), gen_random_uuid());
    insert into _m07 (test, ok) values ('variante ajena se rechaza', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m07 (test, ok) values ('variante ajena se rechaza', sqlerrm like '%variante%');
    perform set_config('role', 'authenticated', true);
  end;

  -- Extraño y anon.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.record_payments((v_sale ->> 'bill_id')::uuid, 1, jsonb_build_array(
      jsonb_build_object('method', 'CARD', 'received', 1)), gen_random_uuid());
    insert into _m07 (test, ok) values ('un extraño no cobra', false);
  exception when others then
    perform set_config('role', 'postgres', true);
    insert into _m07 (test, ok) values ('un extraño no cobra', sqlerrm like '%No autorizado%');
    perform set_config('role', 'authenticated', true);
  end;
  perform set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.record_payments((v_sale ->> 'bill_id')::uuid, 1, '[]', gen_random_uuid());
    insert into _m07 (test, ok) values ('anon no ejecuta record_payments', false);
  exception when insufficient_privilege then
    insert into _m07 (test, ok) values ('anon no ejecuta record_payments', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m07 where not ok) then
    raise exception 'M07 falló: %', (select string_agg(test, '; ') from _m07 where not ok);
  end if;
end $$;

select n, test, ok from _m07 order by n;
rollback;
