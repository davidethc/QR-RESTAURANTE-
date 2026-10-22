-- M05 · KDS. Ejecutar como postgres DESPUÉS de 20261022100000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m05 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m05 to public;
grant usage on sequence _m05_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_t1 uuid; v_prod public.products%rowtype;
  v_items jsonb; v_res jsonb; v_o uuid; v_tk1 uuid; v_tk2 uuid; v_before int; v_g jsonb;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select id into v_t1 from public.tables where restaurant_id = v_r and kind = 'TABLE' and status <> 'INACTIVE' order by number limit 1;
  select p.* into v_prod from public.products p where p.restaurant_id = v_r and p.active and p.available
    and (select count(*) from public.product_variants v where v.product_id = p.id) = 1 order by p.id limit 1;
  if v_owner is null or v_t1 is null or v_prod.id is null then raise exception 'Faltan datos de monky-qa'; end if;

  update public.table_sessions set status = 'CLOSED', closed_at = now() where table_id = v_t1 and status = 'ACTIVE';
  update public.orders set status = 'DELIVERED' where table_id = v_t1 and status in ('PENDING','ACCEPTED','PREPARING','READY');
  v_items := jsonb_build_array(jsonb_build_object('product_id', v_prod.id, 'quantity', 1, 'notes', 'sin cebolla'));

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- Defaults de configuración.
  perform set_config('role', 'postgres', true);
  insert into _m05 (test, ok) values
    ('defaults de umbrales 10/20',
       (select kds_warn_minutes = 10 and kds_alert_minutes = 20 from public.restaurants where id = v_r));
  perform set_config('role', 'authenticated', true);

  v_g := public.get_kitchen_tickets(v_r);
  v_before := (v_g ->> 'pending_count')::int;

  -- Un pedido con DOS comandas cuenta 2.
  v_res := public.add_ticket(null, v_items, gen_random_uuid(), v_t1);
  v_o := (v_res ->> 'order_id')::uuid;
  perform public.add_ticket(v_o, v_items, gen_random_uuid(), null);
  v_g := public.get_kitchen_tickets(v_r);
  insert into _m05 (test, ok) values
    ('contador por comandas: pedido con 2 rondas suma 2', (v_g ->> 'pending_count')::int = v_before + 2),
    ('la tarjeta trae líneas, notas y autor', exists (
        select 1 from jsonb_array_elements(v_g -> 'tickets') t
        where t ->> 'order_id' = v_o::text and t ->> 'number' = '1'
          and t -> 'lines' -> 0 ->> 'notes' = 'sin cebolla' and t ->> 'author_user_id' = v_owner::text
          and t ->> 'source' = 'staff' and t ->> 'place_label' like 'Mesa %')),
    ('devuelve umbrales', v_g -> 'thresholds' ->> 'alert_minutes' = '20');

  select id into v_tk1 from public.tickets where order_id = v_o and number = 1;
  select id into v_tk2 from public.tickets where order_id = v_o and number = 2;

  -- Completar: sale de la cola y entra al historial; es idempotente.
  v_res := public.complete_ticket(v_tk1);
  insert into _m05 (test, ok) values
    ('complete_ticket completa', v_res ->> 'kitchen_status' = 'completed' and (v_res ->> 'replayed') = 'false'),
    ('complete_ticket baja el contador', (public.get_kitchen_tickets(v_r) ->> 'pending_count')::int = v_before + 1),
    ('aparece en el historial', exists (
        select 1 from jsonb_array_elements(public.get_kitchen_tickets(v_r, 'completed') -> 'tickets') t
        where t ->> 'ticket_id' = v_tk1::text)),
    ('complete_ticket idempotente', (public.complete_ticket(v_tk1) ->> 'replayed') = 'true');

  -- Devolver a preparación.
  v_res := public.return_ticket_to_preparation(v_tk1);
  insert into _m05 (test, ok) values
    ('devolver vuelve a la cola', v_res ->> 'kitchen_status' = 'pending'
       and (public.get_kitchen_tickets(v_r) ->> 'pending_count')::int = v_before + 2),
    ('devolver audita', exists (select 1 from public.audit_logs where entity_id = v_tk1 and metadata ->> 'action' = 'RETURN_TICKET'));

  -- Flujo clásico: pedido LISTO completa sus comandas pendientes.
  perform set_config('role', 'postgres', true);
  update public.orders set status = 'READY', ready_at = now() where id = v_o;
  insert into _m05 (test, ok) values
    ('pedido READY completa sus comandas', not exists (select 1 from public.tickets where order_id = v_o and kitchen_status = 'pending'));
  perform set_config('role', 'authenticated', true);
  begin
    perform public.return_ticket_to_preparation(v_tk2);
    insert into _m05 (test, ok) values ('no devuelve comanda de pedido ya listo', false);
  exception when others then
    insert into _m05 (test, ok) values ('no devuelve comanda de pedido ya listo', sqlerrm like '%ya no está en cocina%');
  end;

  -- Umbrales inválidos y rol.
  begin
    perform public.set_kds_settings(v_r, true, 30, 20);
    insert into _m05 (test, ok) values ('umbrales invertidos se rechazan', false);
  exception when check_violation then
    insert into _m05 (test, ok) values ('umbrales invertidos se rechazan', true);
  end;
  v_res := public.set_kds_settings(v_r, true, 8, 15);
  insert into _m05 (test, ok) values ('set_kds_settings guarda', (v_res ->> 'warn_minutes') = '8' and (v_res ->> 'alert_minutes') = '15');

  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.complete_ticket(v_tk2);
    insert into _m05 (test, ok) values ('un extraño no completa comandas', false);
  exception when others then
    insert into _m05 (test, ok) values ('un extraño no completa comandas', sqlerrm like '%sin permiso%');
  end;
  begin
    perform public.get_kitchen_tickets(v_r);
    insert into _m05 (test, ok) values ('un extraño no lee comandas', false);
  exception when others then
    insert into _m05 (test, ok) values ('un extraño no lee comandas', sqlerrm like '%No autorizado%');
  end;

  perform set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.get_kitchen_tickets(v_r);
    insert into _m05 (test, ok) values ('anon no ejecuta get_kitchen_tickets', false);
  exception when insufficient_privilege then
    insert into _m05 (test, ok) values ('anon no ejecuta get_kitchen_tickets', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m05 where not ok) then
    raise exception 'M05 falló: %', (select string_agg(test, '; ') from _m05 where not ok);
  end if;
end $$;

select n, test, ok from _m05 order by n;
rollback;
