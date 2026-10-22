-- M11 · Cliente por QR. Ejecutar como postgres DESPUÉS de 20261023140000.
-- Solo monky-qa, todo en BEGIN ... ROLLBACK. Requiere un OWNER y una mesa libre.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m11 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m11 to public;
grant usage on sequence _m11_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_prod public.products%rowtype; v_tbl public.tables%rowtype; v_items jsonb;
  v_open jsonb; v_open2 jsonb; v_tok uuid; v_ord uuid; v_ord2 uuid; v_key uuid := gen_random_uuid();
  v_o public.orders%rowtype; v_hint text; v_total numeric; v_acc jsonb; v_cs jsonb;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1 order by p.id limit 1;
  select t.* into v_tbl from public.tables t where t.restaurant_id = v_r and t.kind = 'TABLE'
    and t.status <> 'INACTIVE'
    and not exists (select 1 from public.table_sessions s where s.table_id = t.id and s.status = 'ACTIVE')
    order by t.number limit 1;
  if v_owner is null or v_prod.id is null or v_tbl.id is null then raise exception 'Faltan datos de monky-qa'; end if;
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 2));
  update public.restaurants set qr_orders_require_approval = true, qr_call_cooldown_seconds = 60 where id = v_r;

  perform set_config('role', 'anon', true);

  -- abrir mesa con nombre
  begin
    perform public.open_table_from_qr(v_tbl.qr_token, ' ');
    insert into _m11 (test, ok) values ('nombre vacío se rechaza', false);
  exception when others then
    insert into _m11 (test, ok) values ('nombre vacío se rechaza', sqlerrm like '%nombre%');
  end;
  perform set_config('role', 'postgres', true);
  insert into _m11 (test, ok) values ('un nombre inválido no abre sesión',
    not exists (select 1 from public.table_sessions where table_id = v_tbl.id and status = 'ACTIVE'));
  perform set_config('role', 'anon', true);

  v_open := public.open_table_from_qr(v_tbl.qr_token, '  Familia   Pérez ');
  v_tok := (v_open ->> 'session_token')::uuid;
  v_open2 := public.open_table_from_qr(v_tbl.qr_token, 'Otro nombre');
  insert into _m11 (test, ok) values
    ('abre mesa con nombre normalizado', v_open ->> 'customer_label' = 'Familia Pérez' and not (v_open ->> 'joined')::boolean),
    ('un segundo comensal se une a la misma sesión', v_open2 ->> 'session_token' = v_open ->> 'session_token'
        and (v_open2 ->> 'joined')::boolean and v_open2 ->> 'customer_label' = 'Familia Pérez');

  -- pedido con aprobación
  v_ord := public.create_customer_order(v_tok, v_items, 'sin sal', v_key);
  insert into _m11 (test, ok) values ('replay idempotente devuelve el mismo pedido',
    public.create_customer_order(v_tok, v_items, 'sin sal', v_key) = v_ord);
  perform set_config('role', 'postgres', true);
  select * into v_o from public.orders where id = v_ord;
  insert into _m11 (test, ok) values
    ('con aprobación: nace PENDING', v_o.status = 'PENDING'),
    ('origen digital_menu y sin revisar', v_o.source = 'digital_menu' and v_o.status_review = 'new'),
    ('PENDING no aparece en cocina', not exists (
        select 1 from public.tickets t join public.orders o on o.id = t.order_id
        where o.id = v_ord and o.status in ('ACCEPTED', 'PREPARING')));

  -- anon no aprueba; el dueño sí
  perform set_config('role', 'anon', true);
  begin
    perform public.approve_customer_order(v_ord);
    insert into _m11 (test, ok) values ('anon no aprueba pedidos', false);
  exception when insufficient_privilege then
    insert into _m11 (test, ok) values ('anon no aprueba pedidos', true);
  end;
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.approve_customer_order(v_ord);
  perform set_config('role', 'postgres', true);
  select * into v_o from public.orders where id = v_ord;
  insert into _m11 (test, ok) values ('aprobado: PREPARING y revisado', v_o.status = 'PREPARING' and v_o.status_review = 'reviewed'
      and v_o.accepted_by = v_owner);

  -- rechazo de un segundo pedido
  perform set_config('role', 'anon', true);
  v_ord2 := public.create_customer_order(v_tok, v_items, null, gen_random_uuid());
  perform set_config('role', 'authenticated', true);
  perform public.reject_customer_order(v_ord2, 'sin stock');
  perform set_config('role', 'postgres', true);
  insert into _m11 (test, ok) values ('rechazado: REJECTED y revisado', (select status = 'REJECTED' and status_review = 'reviewed'
      from public.orders where id = v_ord2));

  -- sin aprobación: directo a cocina, con evento automático
  update public.restaurants set qr_orders_require_approval = false where id = v_r;
  perform set_config('role', 'anon', true);
  v_ord2 := public.create_customer_order(v_tok, v_items, null, gen_random_uuid());
  perform set_config('role', 'postgres', true);
  select * into v_o from public.orders where id = v_ord2;
  insert into _m11 (test, ok) values
    ('sin aprobación: nace PREPARING y sigue sin revisar', v_o.status = 'PREPARING' and v_o.status_review = 'new' and v_o.accepted_by is null),
    ('sin aprobación: queda el evento automático', exists (select 1 from public.audit_logs
        where entity_id = v_ord2 and action = 'START_PREPARING' and metadata ->> 'auto' = 'true'));
  update public.restaurants set qr_orders_require_approval = true where id = v_r;

  -- llamar a mesero con cooldown
  perform set_config('role', 'anon', true);
  perform public.create_waiter_call(v_tok, 'WAITER');
  begin
    perform public.create_waiter_call(v_tok, 'WAITER');
    insert into _m11 (test, ok) values ('segunda llamada se bloquea', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m11 (test, ok) values ('segunda llamada se bloquea', sqlerrm like '%pendiente%' or v_hint = 'COOLDOWN');
  end;
  -- atendida la primera, el cooldown sigue vigente
  perform set_config('role', 'postgres', true);
  update public.waiter_calls set status = 'ATTENDED' where table_session_id = (select id from public.table_sessions where session_token = v_tok);
  perform set_config('role', 'anon', true);
  begin
    perform public.create_waiter_call(v_tok, 'WAITER');
    insert into _m11 (test, ok) values ('cooldown tras atender la llamada', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m11 (test, ok) values ('cooldown tras atender la llamada', v_hint = 'COOLDOWN');
  end;
  v_cs := public.get_customer_session(v_tok);
  insert into _m11 (test, ok) values ('get_customer_session informa segundos restantes', (v_cs ->> 'waiter_cooldown_left')::int > 0
      and (v_cs ->> 'can_order')::boolean);
  -- pasado el cooldown se puede
  perform set_config('role', 'postgres', true);
  update public.waiter_calls set created_at = now() - interval '2 minutes' where table_session_id = (select id from public.table_sessions where session_token = v_tok);
  perform set_config('role', 'anon', true);
  perform public.create_waiter_call(v_tok, 'WAITER');
  insert into _m11 (test, ok) values ('tras el cooldown se puede volver a llamar', true);

  -- pedir la cuenta: ya no se agregan productos
  perform public.create_waiter_call(v_tok, 'BILL');
  begin
    perform public.create_customer_order(v_tok, v_items, null, gen_random_uuid());
    insert into _m11 (test, ok) values ('tras pedir la cuenta no se agrega nada', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m11 (test, ok) values ('tras pedir la cuenta no se agrega nada', v_hint = 'BILL_REQUESTED');
  end;
  insert into _m11 (test, ok) values ('replay de un pedido anterior sigue devolviendo el original',
    public.create_customer_order(v_tok, v_items, 'sin sal', v_key) = v_ord);
  perform set_config('role', 'postgres', true);
  update public.waiter_calls set created_at = now() - interval '2 minutes' where table_session_id = (select id from public.table_sessions where session_token = v_tok);
  perform set_config('role', 'anon', true);
  begin
    perform public.create_waiter_call(v_tok, 'BILL');
    insert into _m11 (test, ok) values ('la cuenta no se pide dos veces', false);
  exception when others then
    insert into _m11 (test, ok) values ('la cuenta no se pide dos veces', true);
  end;

  -- Ver cuenta
  perform set_config('role', 'postgres', true);
  v_total := (select sum(total) from public.orders
    where table_session_id = (select id from public.table_sessions where session_token = v_tok)
      and status not in ('REJECTED', 'CANCELLED'));
  perform set_config('role', 'anon', true);
  v_acc := public.get_customer_account(v_tok);
  insert into _m11 (test, ok) values
    ('Ver cuenta: rondas con líneas', jsonb_array_length(v_acc -> 'rounds') = 2 and (v_acc -> 'rounds' -> 0 -> 'lines' -> 0 ->> 'quantity')::int = 2),
    ('Ver cuenta: total sin pedidos rechazados', (v_acc ->> 'total')::numeric = v_total and (v_acc ->> 'bill_requested')::boolean),
    ('Ver cuenta: no trae PII ni tokens', v_acc::text not like '%session_token%');
  begin
    perform public.get_customer_account(gen_random_uuid());
    insert into _m11 (test, ok) values ('token ajeno no ve cuenta', false);
  exception when others then
    insert into _m11 (test, ok) values ('token ajeno no ve cuenta', true);
  end;

  -- configuración solo OWNER/ADMIN
  begin
    perform public.set_qr_settings(v_r, false, 30);
    insert into _m11 (test, ok) values ('anon no cambia la configuración', false);
  exception when insufficient_privilege then
    insert into _m11 (test, ok) values ('anon no cambia la configuración', true);
  end;
  perform set_config('role', 'authenticated', true);
  insert into _m11 (test, ok) values ('OWNER cambia la configuración', (public.set_qr_settings(v_r, true, 30) ->> 'qr_call_cooldown_seconds')::int = 30);
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m11 where ok is not true) then
    raise exception 'M11 falló: %', (select string_agg(test, '; ') from _m11 where ok is not true);
  end if;
end $$;

select n, test, ok from _m11 order by n;
rollback;
