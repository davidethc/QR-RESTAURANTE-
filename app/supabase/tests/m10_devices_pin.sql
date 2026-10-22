-- M10 · Dispositivos vinculados y PIN. Ejecutar como postgres DESPUÉS de 20261023130000.
-- Solo monky-qa, todo en BEGIN ... ROLLBACK. Requiere un OWNER y un WAITER activos.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m10 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m10 to public;
grant usage on sequence _m10_n_seq to public;

do $$
declare
  v_r uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner uuid; v_waiter uuid; v_wmember uuid;
  v_link jsonb; v_act jsonb; v_pin text; v_res jsonb; v_secret text; v_dev uuid;
  v_link2 jsonb; i int;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select user_id, id into v_waiter, v_wmember from public.restaurant_members
    where restaurant_id = v_r and role = 'WAITER' and status = 'ACTIVE' limit 1;
  if v_owner is null or v_waiter is null then raise exception 'Faltan datos de monky-qa'; end if;

  -- sin acceso directo a la tabla
  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin
    perform 1 from public.devices limit 1;
    insert into _m10 (test, ok) values ('authenticated no lee devices directo', false);
  exception when insufficient_privilege then
    insert into _m10 (test, ok) values ('authenticated no lee devices directo', true);
  end;

  -- el mesero no vincula
  perform set_config('request.jwt.claims', json_build_object('sub', v_waiter, 'role', 'authenticated')::text, true);
  begin
    perform public.create_device_link(v_r, 'Tablet');
    insert into _m10 (test, ok) values ('WAITER no vincula dispositivos', false);
  exception when others then
    insert into _m10 (test, ok) values ('WAITER no vincula dispositivos', sqlstate = '42501');
  end;

  -- el dueño vincula; PIN del mesero
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_link := public.create_device_link(v_r, 'Tablet de meseros', 10);
  v_pin := public.generate_member_pin(v_wmember);
  perform set_config('role', 'postgres', true);
  insert into _m10 (test, ok) values
    ('create_device_link devuelve token de 64 hex', (v_link ->> 'link_token') ~ '^[0-9a-f]{64}$'),
    ('el token no se guarda en claro', not exists (select 1 from public.devices where link_token_hash = v_link ->> 'link_token')),
    ('el token no está en audit_logs', not exists (select 1 from public.audit_logs where metadata::text like '%' || (v_link ->> 'link_token') || '%'));

  -- el navegador (anon/authenticated) no activa ni hace login
  perform set_config('role', 'anon', true);
  begin
    perform public.activate_device(v_link ->> 'link_token', 'X1');
    insert into _m10 (test, ok) values ('anon no ejecuta activate_device', false);
  exception when insufficient_privilege then
    insert into _m10 (test, ok) values ('anon no ejecuta activate_device', true);
  end;
  begin
    perform public.pin_login('a', '1234');
    insert into _m10 (test, ok) values ('anon no ejecuta pin_login', false);
  exception when insufficient_privilege then
    insert into _m10 (test, ok) values ('anon no ejecuta pin_login', true);
  end;

  -- el servidor (service_role) activa
  perform set_config('role', 'service_role', true);
  insert into _m10 (test, ok) values ('get_device_link_info no consume', public.get_device_link_info(v_link ->> 'link_token') is not null);
  v_act := public.activate_device(v_link ->> 'link_token', 'Tablet de meseros');
  v_secret := v_act ->> 'device_secret';
  v_dev := (v_act ->> 'device_id')::uuid;
  insert into _m10 (test, ok) values
    ('activate_device devuelve secreto de 64 hex', v_secret ~ '^[0-9a-f]{64}$'),
    ('el enlace queda consumido', public.get_device_link_info(v_link ->> 'link_token') is null);
  begin
    perform public.activate_device(v_link ->> 'link_token', 'Otra');
    insert into _m10 (test, ok) values ('token de un solo uso', false);
  exception when others then
    insert into _m10 (test, ok) values ('token de un solo uso', true);
  end;
  perform set_config('role', 'postgres', true);
  insert into _m10 (test, ok) values
    ('solo se guarda el hash del secreto', not exists (select 1 from public.devices where token_hash = v_secret)
        and exists (select 1 from public.devices where id = v_dev and token_hash is not null and link_token_hash is null));

  -- enlace vencido
  perform set_config('role', 'authenticated', true);
  v_link2 := public.create_device_link(v_r, null, 1);
  perform set_config('role', 'postgres', true);
  update public.devices set link_expires_at = now() - interval '1 second' where id = (v_link2 ->> 'device_id')::uuid;
  perform set_config('role', 'service_role', true);
  begin
    perform public.activate_device(v_link2 ->> 'link_token', 'Vencido');
    insert into _m10 (test, ok) values ('enlace vencido se rechaza', false);
  exception when others then
    insert into _m10 (test, ok) values ('enlace vencido se rechaza', sqlerrm like '%venci%');
  end;

  -- PIN: éxito, scoping, rate limit
  v_res := public.pin_login(v_secret, v_pin);
  insert into _m10 (test, ok) values
    ('pin_login OK devuelve al miembro del PIN', v_res ->> 'status' = 'OK' and (v_res ->> 'user_id')::uuid = v_waiter
        and (v_res ->> 'restaurant_id')::uuid = v_r),
    ('pin_login no devuelve hash ni PIN', v_res::text not like '%pin%hash%' and v_res::text not like '%' || v_pin || '%'),
    ('secreto desconocido = DEVICE_INVALID', public.pin_login(repeat('0', 64), v_pin) ->> 'status' = 'DEVICE_INVALID'),
    ('validate_device activo', public.validate_device(v_secret) is not null);

  for i in 1..4 loop
    v_res := public.pin_login(v_secret, case when v_pin = '0000' then '1111' else '0000' end);
  end loop;
  insert into _m10 (test, ok) values ('4 fallos siguen INVALID', v_res ->> 'status' = 'INVALID');
  v_res := public.pin_login(v_secret, case when v_pin = '0000' then '1111' else '0000' end);
  insert into _m10 (test, ok) values ('el 5.º fallo bloquea (LOCKED)', v_res ->> 'status' = 'LOCKED');
  v_res := public.pin_login(v_secret, v_pin);
  insert into _m10 (test, ok) values ('bloqueado aunque el PIN sea correcto', v_res ->> 'status' = 'LOCKED');

  -- el dueño desbloquea y revoca
  perform set_config('role', 'authenticated', true);
  perform public.unlock_pin_login(v_r);
  insert into _m10 (test, ok) values
    ('list_devices no expone hashes', public.list_devices(v_r)::text not like '%hash%'
        and jsonb_array_length(public.list_devices(v_r)) >= 1);
  perform public.revoke_device(v_dev);
  perform public.revoke_device(v_dev); -- idempotente
  perform set_config('role', 'service_role', true);
  v_res := public.pin_login(v_secret, v_pin);
  insert into _m10 (test, ok) values
    ('dispositivo revocado rechaza PIN correcto', v_res ->> 'status' = 'DEVICE_INVALID'),
    ('validate_device revocado = null', public.validate_device(v_secret) is null);

  -- check_member_pin conserva su contrato (wrapper)
  perform set_config('role', 'authenticated', true);
  perform public.unlock_pin_login(v_r);
  insert into _m10 (test, ok) values
    ('check_member_pin sigue funcionando', (select status from public.check_member_pin(v_r, v_pin)) = 'OK');
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m10 where ok is not true) then
    raise exception 'M10 falló: %', (select string_agg(test, '; ') from _m10 where ok is not true);
  end if;
end $$;

select n, test, ok from _m10 order by n;
rollback;
