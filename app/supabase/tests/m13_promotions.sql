-- M13 · Promociones. Ejecutar como postgres DESPUÉS de 20261024100000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m13 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m13 to public;
grant usage on sequence _m13_n_seq to public;

do $$
declare
  v_r      uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_other  uuid;
  v_tz     text;
  v_owner  uuid;
  v_waiter uuid;
  v_prod   public.products%rowtype;
  v_price  numeric(10,2);
  v_items  jsonb;
  v_promo  jsonb;
  v_promo2 jsonb;
  v_res    jsonb;
  v_bill   jsonb;
  v_built  jsonb;
  v_disc   numeric(10,2);
  v_ts     timestamptz;
  v_hint   text;
  v_all    jsonb := '[0,1,2,3,4,5,6]'::jsonb;
  v_item   public.order_items%rowtype;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select timezone into v_tz from public.restaurants where id = v_r;
  select id into v_other from public.restaurants where id <> v_r limit 1;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select user_id into v_waiter from public.restaurant_members
    where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE'
      and not (roles && array['ADMIN', 'MENU_MANAGER']::text[]) limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1
    and not exists (select 1 from public.availability a join public.product_variants v on v.id = a.item_id
                    where a.item_type = 'variant' and v.product_id = p.id and a.available = false)
    order by p.id limit 1;
  if v_owner is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;
  select price into v_price from public.product_variants where product_id = v_prod.id;
  update public.restaurants set billing_enabled = true where id = v_r;
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 2));

  -- ---- Cálculo puro (M13 §5 / §11) ----
  insert into _m13 (test, ok) values
    ('§11: 2 × $2.50 con 10% + 2x1 = $2.25 (descuento 2.75)',
      public.promo_line_discount(2.50, 2,
        '[{"type":"discount","value_type":"percent","value":10},{"type":"buy_x_get_y","receive_qty":2,"buy_qty":1}]') = 2.75),
    ('10% sobre 3 × 2.50 = 0.75', public.promo_line_discount(2.50, 3, '[{"type":"discount","value_type":"percent","value":10}]') = 0.75),
    ('monto fijo nunca supera el precio', public.promo_line_discount(2.50, 1, '[{"type":"discount","value_type":"fixed","value":5}]') = 2.50),
    ('2x1 con 3 unidades regala 1', public.promo_line_discount(2.50, 3, '[{"type":"buy_x_get_y","receive_qty":2,"buy_qty":1}]') = 2.50),
    ('3x2 con 6 unidades regala 2', public.promo_line_discount(1.00, 6, '[{"type":"buy_x_get_y","receive_qty":3,"buy_qty":2}]') = 2.00),
    ('2x1 con 1 unidad no regala nada', public.promo_line_discount(2.50, 1, '[{"type":"buy_x_get_y","receive_qty":2,"buy_qty":1}]') = 0),
    ('sin promos = 0', public.promo_line_discount(2.50, 2, null) = 0);

  -- ---- Vigencia en hora local (fin inclusivo, cruce de medianoche y de mes) ----
  v_ts := ('2026-10-31 23:50'::timestamp) at time zone v_tz;
  insert into _m13 (test, ok) values
    ('fin inclusivo: 23:50 local del último día sigue vigente',
      public.promotion_runs_on(null, '2026-10-01', '2026-10-31', public.restaurant_local_date(v_r, v_ts))),
    ('00:10 local del día siguiente (cambio de mes) ya no aplica',
      not public.promotion_runs_on(null, '2026-10-01', '2026-10-31', public.restaurant_local_date(v_r, v_ts + interval '20 minutes'))),
    ('la fecha local cambia a medianoche local, no UTC',
      public.restaurant_local_date(v_r, v_ts + interval '20 minutes') = '2026-11-01'),
    ('días de la semana: sábado 2026-10-31 = 6', public.promotion_runs_on(array[6], null, null, '2026-10-31')
      and not public.promotion_runs_on(array[5], null, null, '2026-10-31'));

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- ---- Validaciones de save_promotion ----
  begin
    perform public.save_promotion(v_r, jsonb_build_object('name', '2x1', 'type', 'buy_x_get_y',
      'receive_qty', 2, 'buy_qty', 1, 'applies_to', 'products', 'target_ids', jsonb_build_array(v_prod.id),
      'starts_on', current_date, 'ends_on', current_date + 3));
    insert into _m13 (test, ok) values ('2x1 por fechas se rechaza', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m13 (test, ok) values ('2x1 por fechas se rechaza', v_hint in ('field=weekdays', 'field=activation'));
  end;
  begin
    perform public.save_promotion(v_r, jsonb_build_object('name', 'X', 'type', 'discount', 'value_type', 'percent',
      'value', 10, 'applies_to', 'products', 'target_ids', jsonb_build_array(v_prod.id),
      'weekdays', v_all, 'starts_on', current_date, 'ends_on', current_date));
    insert into _m13 (test, ok) values ('dos formas de activación se rechazan', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m13 (test, ok) values ('dos formas de activación se rechazan', v_hint = 'field=activation');
  end;
  begin
    perform public.save_promotion(v_r, jsonb_build_object('name', 'X', 'type', 'discount', 'value_type', 'percent',
      'value', 10, 'applies_to', 'products', 'target_ids', jsonb_build_array(v_prod.id),
      'starts_on', current_date - 10, 'ends_on', current_date - 5));
    insert into _m13 (test, ok) values ('fecha de fin pasada se rechaza', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m13 (test, ok) values ('fecha de fin pasada se rechaza', v_hint = 'field=ends_on');
  end;
  begin
    perform public.save_promotion(v_r, jsonb_build_object('name', 'X', 'type', 'discount', 'value_type', 'percent',
      'value', 120, 'applies_to', 'products', 'target_ids', jsonb_build_array(v_prod.id), 'weekdays', v_all));
    insert into _m13 (test, ok) values ('porcentaje > 100 se rechaza', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m13 (test, ok) values ('porcentaje > 100 se rechaza', v_hint = 'field=value');
  end;
  if v_other is not null then
    begin
      perform public.save_promotion(v_r, jsonb_build_object('name', 'X', 'type', 'discount', 'value_type', 'percent',
        'value', 10, 'applies_to', 'products', 'weekdays', v_all,
        'target_ids', (select jsonb_agg(id) from (select id from public.products where restaurant_id = v_other limit 1) x)));
      insert into _m13 (test, ok) values ('producto de otro restaurante se rechaza', false);
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      insert into _m13 (test, ok) values ('producto de otro restaurante se rechaza', v_hint = 'field=target_ids');
    end;
  end if;

  -- ---- Precio en pedidos: 10% + 2x1 todos los días, solo en el producto ----
  v_promo := public.save_promotion(v_r, jsonb_build_object('name', 'Descuento especial', 'type', 'discount',
    'value_type', 'percent', 'value', 10, 'applies_to', 'products',
    'target_ids', jsonb_build_array(v_prod.id), 'weekdays', v_all,
    'service_options', '{"pos":{"tables":true,"dine_in_no_table":true,"takeaway":true,"delivery":true},"digital_menu":{"tables":true,"pickup":true,"delivery":true}}'::jsonb));
  v_promo2 := public.save_promotion(v_r, jsonb_build_object('name', 'Promo 2x1', 'type', 'buy_x_get_y',
    'receive_qty', 2, 'buy_qty', 1, 'applies_to', 'categories',
    'target_ids', jsonb_build_array(v_prod.category_id), 'weekdays', v_all,
    'service_options', '{"pos":{"takeaway":false}}'::jsonb));
  v_disc := round(v_price * 0.10, 2) * 2 + (v_price - round(v_price * 0.10, 2));

  insert into _m13 (test, ok) values
    ('service_options parcial se completa con true y respeta el false',
      (v_promo2 #>> '{service_options,pos,takeaway}') = 'false'
      and (v_promo2 #>> '{service_options,digital_menu,pickup}') = 'true'),
    ('get_active_promotions lista las dos con etiqueta',
      (select count(*) from jsonb_array_elements(public.get_active_promotions(v_r)) p
        where p ->> 'id' in (v_promo ->> 'id', v_promo2 ->> 'id')) = 2
      and exists (select 1 from jsonb_array_elements(public.get_active_promotions(v_r)) p where p ->> 'label' = '2x1')),
    ('canal pos.takeaway excluye la 2x1',
      not exists (select 1 from jsonb_array_elements(public.get_active_promotions(v_r, 'pos.takeaway')) p
        where p ->> 'id' = v_promo2 ->> 'id'));

  -- Comer aquí: aplican las dos.
  v_res := public.create_counter_order('dine_in_no_table', v_items, gen_random_uuid(), v_r);
  perform set_config('role', 'postgres', true);
  select * into v_item from public.order_items where order_id = (v_res ->> 'order_id')::uuid;
  insert into _m13 (test, ok) values
    ('pedido: total neto = 2 × precio − (10% + 2x1)', (v_res ->> 'total')::numeric = v_price * 2 - v_disc),
    ('línea: unit_price de lista, promo_discount y snapshot de 2 reglas',
      v_item.unit_price = v_price and v_item.promo_discount = v_disc
      and v_item.subtotal = v_price * 2 - v_disc and jsonb_array_length(v_item.promotions) = 2),
    ('cuenta: subtotal ya neto', (select subtotal from public.bills where id = (v_res ->> 'bill_id')::uuid) = v_price * 2 - v_disc);
  v_bill := public.bill_json((v_res ->> 'bill_id')::uuid);
  insert into _m13 (test, ok) values
    ('bill_json: promo_discount_total y list_subtotal por línea',
      (v_bill ->> 'promo_discount_total')::numeric = v_disc
      and (v_bill #>> '{orders,0,items,0,list_subtotal}')::numeric = v_price * 2
      and (v_bill #>> '{orders,0,items,0,promo_discount}')::numeric = v_disc);
  perform set_config('role', 'authenticated', true);

  -- Editar solo la nota no cambia el precio (descuento recalculado del snapshot).
  v_built := public.edit_order_item(v_item.id, null, 'sin hielo');
  perform set_config('role', 'postgres', true);
  insert into _m13 (test, ok) values
    ('edit_order_item conserva el descuento', (v_built ->> 'subtotal')::numeric = v_price * 2 - v_disc
      and (select promo_discount from public.order_items where id = v_item.id) = v_disc);
  perform set_config('role', 'authenticated', true);

  -- Para llevar: la 2x1 está apagada en pos.takeaway; solo el 10%.
  v_res := public.create_counter_order('takeaway', v_items, gen_random_uuid(), v_r);
  perform set_config('role', 'postgres', true);
  insert into _m13 (test, ok) values
    ('canal respetado: takeaway solo con 10%', (v_res ->> 'total')::numeric = v_price * 2 - round(v_price * 0.10, 2) * 2);

  -- Compatibilidad: la firma de 2 argumentos no aplica promociones.
  v_built := public.build_order_lines(v_r, v_items);
  insert into _m13 (test, ok) values
    ('build_order_lines de 2 argumentos = precio de lista', (v_built ->> 'subtotal')::numeric = v_price * 2
      and (v_built #>> '{lines,0,promo_discount}')::numeric = 0);
  perform set_config('role', 'authenticated', true);

  -- Borrar deja de aplicar a líneas nuevas y no toca las existentes.
  perform public.delete_promotion((v_promo ->> 'id')::uuid);
  perform public.delete_promotion((v_promo2 ->> 'id')::uuid);
  v_res := public.create_counter_order('dine_in_no_table', v_items, gen_random_uuid(), v_r);
  perform set_config('role', 'postgres', true);
  insert into _m13 (test, ok) values
    ('tras borrar: precio de lista', (v_res ->> 'total')::numeric = v_price * 2),
    ('tras borrar: la línea anterior conserva su descuento',
      (select promo_discount from public.order_items where id = v_item.id) = v_disc);

  -- Permisos.
  if v_waiter is not null then
    perform set_config('role', 'authenticated', true),
            set_config('request.jwt.claims', json_build_object('sub', v_waiter, 'role', 'authenticated')::text, true);
    begin
      perform public.save_promotion(v_r, jsonb_build_object('name', 'X', 'type', 'discount', 'value_type', 'percent',
        'value', 10, 'applies_to', 'products', 'target_ids', jsonb_build_array(v_prod.id), 'weekdays', v_all));
      perform set_config('role', 'postgres', true);
      insert into _m13 (test, ok) values ('mesero no crea promociones', false);
    exception when insufficient_privilege then
      perform set_config('role', 'postgres', true);
      insert into _m13 (test, ok) values ('mesero no crea promociones', true);
    end;
  end if;

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin
    insert into public.promotions (restaurant_id, name, type, value_type, value, applies_to, target_ids, weekdays)
    values (v_r, 'directo', 'discount', 'percent', 10, 'products', array[v_prod.id], array[1]);
    perform set_config('role', 'postgres', true);
    insert into _m13 (test, ok) values ('sin INSERT directo en promotions', false);
  exception when insufficient_privilege then
    perform set_config('role', 'postgres', true);
    insert into _m13 (test, ok) values ('sin INSERT directo en promotions', true);
  end;

  perform set_config('role', 'anon', true),
          set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform public.save_promotion(v_r, '{}'::jsonb);
    insert into _m13 (test, ok) values ('anon no ejecuta save_promotion', false);
  exception when insufficient_privilege then
    insert into _m13 (test, ok) values ('anon no ejecuta save_promotion', true);
  end;
  begin
    perform public.build_order_lines(v_r, v_items, 'pos.tables');
    insert into _m13 (test, ok) values ('anon no ejecuta build_order_lines', false);
  exception when insufficient_privilege then
    insert into _m13 (test, ok) values ('anon no ejecuta build_order_lines', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m13 where not ok) then
    raise exception 'M13 falló: %', (select string_agg(test, '; ') from _m13 where not ok);
  end if;
end $$;

select n, test, ok from _m13 order by n;
rollback;
