-- M12 · Menú digital de domicilio/recoger. Ejecutar como postgres DESPUÉS de
-- 20261024100000 (M13) y 20261024110000 (M12).
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m12 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m12 to public;
grant usage on sequence _m12_n_seq to public;

do $$
declare
  v_r      uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner  uuid;
  v_prod   public.products%rowtype;
  v_price  numeric(10,2);
  v_items  jsonb;
  v_res    jsonb;
  v_res2   jsonb;
  v_menu   jsonb;
  v_key    uuid := gen_random_uuid();
  v_hint   text;
  v_msg    text;
  v_token  uuid;
  v_order  public.orders%rowtype;
  v_addr   jsonb := '{"calle":"Av. Siempre Viva","numero":"742","colonia":"Centro"}';
  i        integer;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1
    and not exists (select 1 from public.availability a join public.product_variants v on v.id = a.item_id
                    where a.item_type = 'variant' and v.product_id = p.id and a.available = false)
    order by p.id limit 1;
  if v_owner is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;
  select price into v_price from public.product_variants where product_id = v_prod.id;

  -- Estado controlado: cobro activo, abierto 24 h (sin turnos), sin promos.
  update public.restaurants set billing_enabled = true where id = v_r;
  delete from public.schedule_shifts s using public.schedules sc
    where sc.id = s.schedule_id and sc.restaurant_id = v_r;
  delete from public.promotions where restaurant_id = v_r;
  update public.products set service_options = jsonb_set(service_options, '{digital_menu,pickup}', 'true')
    where id = v_prod.id;
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 2));

  -- ---- Personal: activación ----
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin
    perform public.set_digital_menu_whatsapp(v_r, '99 123', 'lt_50');
    insert into _m12 (test, ok) values ('WhatsApp sin código de país se rechaza', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('WhatsApp sin código de país se rechaza', v_hint = 'field=whatsapp_number');
  end;
  v_res := public.set_digital_menu_whatsapp(v_r, '+593 (99) 123-4567', '50_150');
  v_res := public.activate_digital_menu(v_r);
  insert into _m12 (test, ok) values
    ('WhatsApp normalizado a E.164', v_res ->> 'whatsapp_number' = '+593991234567'),
    ('activar deja el menú activo y aceptando pedidos',
      v_res ->> 'digital_menu_status' = 'active' and (v_res #>> '{state,accepting_orders}')::boolean),
    ('defaults §5: solo efectivo, 25–45 / 15 min, por cotizar',
      (v_res #>> '{payment_methods,delivery,cash}')::boolean and not (v_res #>> '{payment_methods,delivery,card}')::boolean
      and (v_res #>> '{delivery,delivery_time_min}')::int = 25 and (v_res #>> '{delivery,delivery_time_max}')::int = 45
      and (v_res #>> '{delivery,pickup_time}')::int = 15 and v_res #>> '{delivery,shipping_cost_type}' = 'quote');

  begin
    perform public.save_payment_method_settings(v_r, 'pickup', '{"transfer_enabled": true}');
    insert into _m12 (test, ok) values ('transferencia exige datos bancarios', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('transferencia exige datos bancarios', v_hint = 'field=bank_holder');
  end;
  begin
    perform public.save_payment_method_settings(v_r, 'pickup', '{"cash_enabled": false}');
    insert into _m12 (test, ok) values ('al menos un método activo', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('al menos un método activo', v_hint = 'field=cash_enabled');
  end;
  perform public.save_delivery_settings(v_r, '{"min_purchase_enabled": true, "min_purchase_amount": 99999}');

  -- ---- Público (anon) ----
  perform set_config('role', 'anon', true),
          set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  v_menu := public.get_digital_menu('monky-qa');
  insert into _m12 (test, ok) values
    ('get_digital_menu: aceptando pedidos y sin datos bancarios si no hay transferencia',
      (v_menu #>> '{state,accepting_orders}')::boolean and v_menu #> '{payment_methods,delivery,bank}' = 'null'::jsonb),
    ('get_digital_menu no expone la configuración interna de vencimiento',
      not (v_menu -> 'delivery' ? 'unconfirmed_ttl_minutes'));

  v_res := public.quote_online_order('monky-qa', 'delivery', v_items);
  insert into _m12 (test, ok) values
    ('quote: subtotal del servidor y envío por cotizar',
      (v_res ->> 'subtotal')::numeric = v_price * 2 and (v_res #>> '{shipping,pending}')::boolean),
    ('quote: compra mínima no alcanzada', not (v_res #>> '{min_purchase,reached}')::boolean);

  begin
    perform public.place_online_order('monky-qa', 'delivery', v_items, gen_random_uuid(),
      'Cliente Demo', '+593 99 000 0001', 'cash', v_addr);
    insert into _m12 (test, ok) values ('compra mínima bloquea el domicilio', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('compra mínima bloquea el domicilio', v_hint = 'field=min_purchase');
  end;
  begin
    perform public.place_online_order('monky-qa', 'pickup', v_items, gen_random_uuid(),
      'Cliente Demo', '+593 99 000 0001', null);
    insert into _m12 (test, ok) values ('sin método de pago se bloquea', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('sin método de pago se bloquea', v_hint = 'field=preferred_payment_method');
  end;
  begin
    perform public.place_online_order('monky-qa', 'pickup', v_items, gen_random_uuid(),
      'Cliente Demo', '+593 99 000 0001', 'card');
    insert into _m12 (test, ok) values ('método apagado (tarjeta) se rechaza', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('método apagado (tarjeta) se rechaza', v_hint = 'field=preferred_payment_method');
  end;
  begin
    perform public.place_online_order('monky-qa', 'pickup', v_items, gen_random_uuid(),
      null, '+593 99 000 0001', 'cash');
    insert into _m12 (test, ok) values ('nombre obligatorio', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('nombre obligatorio', v_hint = 'field=customer_name');
  end;

  -- Pedido válido para recoger, con "pagará con".
  v_res := public.place_online_order('monky-qa', 'pickup', v_items, v_key,
    'Cliente Demo', '+593 99 000 0001', 'cash', null, v_price * 2 + 5, 'sin cubiertos');
  v_res2 := public.place_online_order('monky-qa', 'pickup', v_items, v_key,
    'Cliente Demo', '+593 99 000 0001', 'cash', null, v_price * 2 + 5, 'sin cubiertos');
  v_token := (v_res ->> 'tracking_token')::uuid;
  insert into _m12 (test, ok) values
    ('pedido creado como Nuevo', v_res ->> 'step' = 'new' and not (v_res ->> 'replayed')::boolean
      and (v_res ->> 'total')::numeric = v_price * 2 and v_token is not null),
    ('idempotente por client_request_id', (v_res2 ->> 'replayed')::boolean and v_res2 ->> 'order_id' = v_res ->> 'order_id'),
    ('la respuesta pública no trae teléfono ni dirección',
      not (v_res ? 'customer_phone') and not (v_res ? 'delivery_address'));

  begin
    perform 1 from public.online_order_tokens;
    insert into _m12 (test, ok) values ('anon no lee online_order_tokens', false);
  exception when insufficient_privilege then
    insert into _m12 (test, ok) values ('anon no lee online_order_tokens', true);
  end;
  begin
    perform public.accept_online_order((v_res ->> 'order_id')::uuid);
    insert into _m12 (test, ok) values ('anon no acepta pedidos', false);
  exception when insufficient_privilege then
    insert into _m12 (test, ok) values ('anon no acepta pedidos', true);
  end;

  v_res2 := public.confirm_online_order(v_token);
  insert into _m12 (test, ok) values
    ('el cliente confirma dentro del sistema', v_res2 ->> 'step' = 'confirmed' and v_res2 ->> 'confirmed_at' is not null),
    ('get_online_order por token', public.get_online_order(v_token) ->> 'order_id' = v_res ->> 'order_id');

  perform set_config('role', 'postgres', true);
  select * into v_order from public.orders where id = (v_res ->> 'order_id')::uuid;
  insert into _m12 (test, ok) values
    ('orden: PENDING, web, pickup, sin revisar, vence en 30 min, sin cuenta',
      v_order.status = 'PENDING' and v_order.source = 'web' and v_order.service_type = 'pickup'
      and v_order.status_review = 'new' and v_order.pays_with_amount = v_price * 2 + 5
      and v_order.expires_at between now() + interval '29 minutes' and now() + interval '31 minutes'
      and not exists (select 1 from public.bills where table_session_id = v_order.table_session_id));

  -- ---- Personal: aceptar -> cocina + cuenta ----
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin
    perform public.accept_online_order(v_order.id, 2.00);
    insert into _m12 (test, ok) values ('envío solo en domicilio', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('envío solo en domicilio', v_hint = 'field=shipping_cost');
  end;
  v_res2 := public.accept_online_order(v_order.id);
  perform set_config('role', 'postgres', true);
  insert into _m12 (test, ok) values
    ('aceptar: PREPARING, revisado, cuenta abierta con el total',
      v_res2 ->> 'status' = 'PREPARING' and v_res2 ->> 'bill_id' is not null
      and (select status_review = 'reviewed' from public.orders where id = v_order.id)
      and (select total from public.bills where id = (v_res2 ->> 'bill_id')::uuid) = v_price * 2),
    ('seguimiento: en preparación', public.get_online_order(v_token) ->> 'step' = 'preparing');

  -- ---- Domicilio con envío ----
  perform set_config('role', 'authenticated', true);
  perform public.save_delivery_settings(v_r, '{"min_purchase_enabled": false}');
  perform set_config('role', 'anon', true),
          set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_res := public.place_online_order('monky-qa', 'delivery', v_items, gen_random_uuid(),
    'Cliente Demo', '+593 99 000 0002', 'cash', v_addr);
  insert into _m12 (test, ok) values ('domicilio: envío pendiente', (v_res ->> 'shipping_pending')::boolean);
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_res2 := public.accept_online_order((v_res ->> 'order_id')::uuid, 2.00);
  perform set_config('role', 'postgres', true);
  insert into _m12 (test, ok) values
    ('aceptar con envío suma al total', (v_res2 ->> 'total')::numeric = v_price * 2 + 2.00);

  -- ---- Vencimiento ----
  perform set_config('role', 'anon', true),
          set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_res := public.place_online_order('monky-qa', 'pickup', v_items, gen_random_uuid(),
    'Cliente Demo', '+593 99 000 0003', 'cash');
  perform set_config('role', 'postgres', true);
  -- now() es fijo en toda la transacción: el vencimiento se simula moviendo
  -- expires_at hacia atrás, no esperando.
  update public.orders set expires_at = now() - interval '1 minute' where id = (v_res ->> 'order_id')::uuid;
  insert into _m12 (test, ok) values
    ('vencido por hora ya se muestra como expired', public.online_order_json((v_res ->> 'order_id')::uuid) ->> 'step' = 'expired');
  -- Sentencia aparte: lo que escribe expire_online_orders no es visible para
  -- otras subconsultas de la MISMA sentencia (usan su snapshot inicial).
  i := public.expire_online_orders(v_r);
  insert into _m12 (test, ok) values
    ('expire_online_orders vence al menos uno', i >= 1),
    ('vencido: CANCELLED, expired_at, revisado, sesión cerrada',
      (select o.status = 'CANCELLED' and o.cancelled and o.expired_at is not null and o.status_review = 'reviewed'
         and ts.status = 'CLOSED'
       from public.orders o join public.table_sessions ts on ts.id = o.table_session_id
       where o.id = (v_res ->> 'order_id')::uuid));

  -- ---- Límite por teléfono: 3 sin confirmar en 15 min ----
  perform set_config('role', 'anon', true);
  for i in 1..3 loop
    perform public.place_online_order('monky-qa', 'pickup', v_items, gen_random_uuid(),
      'Cliente Demo', '+593 99 000 0009', 'cash');
  end loop;
  begin
    perform public.place_online_order('monky-qa', 'pickup', v_items, gen_random_uuid(),
      'Cliente Demo', '+593 99 000 0009', 'cash');
    insert into _m12 (test, ok) values ('4.º pedido sin confirmar del mismo teléfono se bloquea', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('4.º pedido sin confirmar del mismo teléfono se bloquea', v_hint = 'rate_limit=phone');
  end;

  -- ---- Producto oculto en el canal ----
  perform set_config('role', 'postgres', true);
  update public.products set service_options = jsonb_set(service_options, '{digital_menu,pickup}', 'false')
    where id = v_prod.id;
  perform set_config('role', 'anon', true);
  begin
    perform public.quote_online_order('monky-qa', 'pickup', v_items);
    insert into _m12 (test, ok) values ('producto apagado en el canal se rechaza', false);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into _m12 (test, ok) values ('producto apagado en el canal se rechaza', v_msg like '%tipo de pedido%');
  end;
  insert into _m12 (test, ok) values ('hidden_product_ids lo lista',
    public.get_digital_menu('monky-qa') #> '{hidden_product_ids,pickup}' @> to_jsonb(array[v_prod.id]));

  -- ---- Pausa "Hoy" ----
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_res := public.pause_digital_menu(v_r, 'today');
  perform set_config('role', 'anon', true),
          set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_menu := public.get_digital_menu('monky-qa');
  insert into _m12 (test, ok) values
    ('pausado hoy: no acepta pedidos y dice hasta cuándo',
      v_menu #>> '{state,reason}' = 'paused' and not (v_menu #>> '{state,accepting_orders}')::boolean
      and v_menu #>> '{state,paused_until}' is not null);
  begin
    perform public.place_online_order('monky-qa', 'delivery', v_items, gen_random_uuid(),
      'Cliente Demo', '+593 99 000 0004', 'cash', v_addr);
    insert into _m12 (test, ok) values ('pausado: no se puede pedir', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m12 (test, ok) values ('pausado: no se puede pedir', v_hint = 'state=paused');
  end;
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_res := public.resume_digital_menu(v_r);
  insert into _m12 (test, ok) values ('reactivar', v_res #>> '{state,status}' = 'active');

  -- ---- Fuera de horario ----
  perform set_config('role', 'postgres', true);
  insert into public.schedule_shifts (schedule_id, weekday, starts_at, ends_at)
  select sc.id, (extract(dow from (now() at time zone r.timezone))::int + 2) % 7, '10:00', '11:00'
  from public.schedules sc join public.restaurants r on r.id = sc.restaurant_id
  where sc.restaurant_id = v_r limit 1;
  if found then
    v_menu := public.get_digital_menu('monky-qa');
    insert into _m12 (test, ok) values ('fuera de horario: aviso con próxima apertura',
      v_menu #>> '{state,reason}' = 'closed' and v_menu #>> '{state,next_open_at}' is not null);
  end if;

  if exists (select 1 from _m12 where not ok) then
    raise exception 'M12 falló: %', (select string_agg(test, '; ') from _m12 where not ok);
  end if;
end $$;

select n, test, ok from _m12 order by n;
rollback;
