-- M03-T02/T03 · Ejecutar DESPUÉS de aplicar 20261021200000, solo en monky-qa.
-- Todo se revierte (ROLLBACK). Falla con excepción si algo no se cumple.
begin;

do $$
declare
  v_rest uuid; v_owner uuid := gen_random_uuid(); v_waiter uuid := gen_random_uuid();
  v_zone uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid; v_n1 int; v_n2 int; v_msg text;
begin
  select id into v_rest from public.restaurants where slug = 'monky-qa';
  if v_rest is null then raise exception 'Se requiere monky-qa'; end if;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'qa-m03rpc-' || u || '@example.invalid', now(), now()
  from unnest(array[v_owner, v_waiter]) u;
  insert into public.profiles (id, full_name) values (v_owner, 'QA owner'), (v_waiter, 'QA waiter')
  on conflict (id) do nothing;
  insert into public.restaurant_members (restaurant_id, user_id, role, status) values
    (v_rest, v_owner, 'OWNER', 'ACTIVE'), (v_rest, v_waiter, 'WAITER', 'ACTIVE');

  -- Mesero: rechazado.
  perform set_config('request.jwt.claims', json_build_object('sub', v_waiter, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.create_zone(v_rest, 'QA RPC', 4, 3);
    raise exception 'el mesero pudo crear zona';
  exception when sqlstate 'P0001' then null; end;

  -- Dueño.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_zone := public.create_zone(v_rest, 'QA RPC', 4, 3);

  v_t1 := public.create_table(v_zone, 0, 0);            -- 1x1 automático
  v_t2 := public.create_table(v_zone, 1, 0, null, 'round', 2, 2); -- ocupa (1..2, 0..1)
  select number into v_n1 from public.tables where id = v_t1;
  select number into v_n2 from public.tables where id = v_t2;
  if v_n2 <> v_n1 + 1 then raise exception 'identificador no consecutivo: % %', v_n1, v_n2; end if;

  -- Solapamiento rechazado (crear y mover).
  begin perform public.create_table(v_zone, 2, 1); raise exception 'solapó al crear';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%solapa%' then raise exception 'mensaje inesperado: %', v_msg; end if; end;
  begin perform public.move_table(v_t1, 1, 1, 1, 1); raise exception 'solapó al mover';
  exception when sqlstate 'P0001' then null; end;

  -- Fuera de la cuadrícula y tamaño mínimo.
  begin perform public.create_table(v_zone, 3, 2, null, 'square', 2, 1); raise exception 'salió de cuadrícula';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.move_table(v_t1, 0, 0, 0, 1); raise exception 'aceptó ancho 0';
  exception when sqlstate 'P0001' then null; end;

  -- Mover válido; qr_token distinto y no nulo.
  perform public.move_table(v_t1, 3, 2, 1, 1);
  v_t3 := public.create_table(v_zone, 0, 2, 99);
  if (select count(distinct qr_token) from public.tables where id in (v_t1, v_t2, v_t3)) <> 3 then
    raise exception 'qr_token no único'; end if;

  -- No reducir si deja mesas fuera.
  begin perform public.update_zone(v_zone, 'QA RPC', 3, 3); raise exception 'redujo con mesa fuera';
  exception when sqlstate 'P0001' then null; end;
  perform public.update_zone(v_zone, 'QA RPC 2', 4, 3);

  -- Sesión activa bloquea borrar mesa y zona.
  insert into public.table_sessions (restaurant_id, table_id) values (v_rest, v_t3);
  begin perform public.delete_table(v_t3); raise exception 'borró mesa con sesión';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.delete_zone(v_zone); raise exception 'borró zona con sesión';
  exception when sqlstate 'P0001' then null; end;
  update public.table_sessions set status = 'CLOSED', closed_at = now() where table_id = v_t3;

  perform public.delete_table(v_t3);
  perform public.delete_zone(v_zone);
  if exists (select 1 from public.zones where id = v_zone) then raise exception 'zona no borrada'; end if;

  -- anon sin execute.
  perform set_config('role', 'none', true);
  if has_function_privilege('anon', 'public.create_zone(uuid,text,integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.move_table(uuid,integer,integer,integer,integer,text,integer)', 'execute') then
    raise exception 'anon tiene execute'; end if;

  raise notice 'M03 RPCs OK';
end;
$$;

rollback;
