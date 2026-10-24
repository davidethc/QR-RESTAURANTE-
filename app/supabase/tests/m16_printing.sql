-- M16 · Impresión. Ejecutar como postgres DESPUÉS de 20261024120000.
-- Solo monky-qa, todo dentro de BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create temp table _m16 (n int generated always as identity, test text, ok boolean) on commit drop;
grant select, insert on _m16 to public;
grant usage on sequence _m16_n_seq to public;

do $$
declare
  v_r      uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_owner  uuid;
  v_member uuid;
  v_res    jsonb;
  v_hint   text;
begin
  if v_r is null then raise exception 'No existe monky-qa'; end if;
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_r and role = 'OWNER' and status = 'ACTIVE' limit 1;
  select user_id into v_member from public.restaurant_members
    where restaurant_id = v_r and role in ('WAITER', 'KITCHEN') and status = 'ACTIVE' limit 1;
  if v_owner is null then raise exception 'Faltan datos de monky-qa'; end if;
  delete from public.printing_settings where restaurant_id = v_r;

  perform set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  v_res := public.get_printing_settings(v_r);
  insert into _m16 (test, ok) values
    ('defaults: normal, sin encabezado ni pie, avanzada apagada',
      v_res ->> 'customer_ticket_font_size' = 'normal' and v_res ->> 'kitchen_ticket_font_size' = 'normal'
      and v_res ->> 'customer_ticket_header' is null and v_res ->> 'customer_ticket_footer' is null
      and not (v_res ->> 'advanced_printing')::boolean),
    ('incluye logo y nombre para la cabecera', v_res #> '{restaurant}' ? 'logo_url' and v_res #>> '{restaurant,name}' is not null);

  v_res := public.save_printing_settings(v_r, '{"customer_ticket_font_size":"large","customer_ticket_header":"  Gracias por tu visita  ","customer_ticket_footer":"Vuelve pronto"}');
  insert into _m16 (test, ok) values
    ('guarda tamaño, encabezado (recortado) y pie',
      v_res ->> 'customer_ticket_font_size' = 'large' and v_res ->> 'customer_ticket_header' = 'Gracias por tu visita'
      and v_res ->> 'customer_ticket_footer' = 'Vuelve pronto' and v_res ->> 'kitchen_ticket_font_size' = 'normal');

  v_res := public.save_printing_settings(v_r, '{"customer_ticket_header":""}');
  insert into _m16 (test, ok) values
    ('parche: texto vacío borra el encabezado y conserva lo demás',
      v_res ->> 'customer_ticket_header' is null and v_res ->> 'customer_ticket_font_size' = 'large');

  begin
    perform public.save_printing_settings(v_r, '{"kitchen_ticket_font_size":"huge"}');
    insert into _m16 (test, ok) values ('tamaño inválido se rechaza', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m16 (test, ok) values ('tamaño inválido se rechaza', v_hint = 'field=kitchen_ticket_font_size');
  end;
  begin
    perform public.save_printing_settings(v_r, '{"advanced_printing":true}');
    insert into _m16 (test, ok) values ('impresión avanzada aún no se enciende', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m16 (test, ok) values ('impresión avanzada aún no se enciende', v_hint = 'field=advanced_printing');
  end;
  begin
    perform public.save_printing_settings(v_r, '{"os":"windows"}');
    insert into _m16 (test, ok) values ('campos de la extensión no editables', false);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into _m16 (test, ok) values ('campos de la extensión no editables', v_hint = 'field=os');
  end;

  if v_member is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    v_res := public.save_printing_settings(v_r, '{"kitchen_ticket_font_size":"small"}');
    insert into _m16 (test, ok) values ('rol operativo también configura impresión (M16 §6)',
      v_res ->> 'kitchen_ticket_font_size' = 'small');
  end if;

  begin
    insert into public.printing_settings (restaurant_id) values (v_r);
    insert into _m16 (test, ok) values ('sin escritura directa en printing_settings', false);
  exception when insufficient_privilege then
    insert into _m16 (test, ok) values ('sin escritura directa en printing_settings', true);
  end;

  perform set_config('role', 'anon', true),
          set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform public.get_printing_settings(v_r);
    insert into _m16 (test, ok) values ('anon no lee ajustes de impresión', false);
  exception when insufficient_privilege then
    insert into _m16 (test, ok) values ('anon no lee ajustes de impresión', true);
  end;
  perform set_config('role', 'postgres', true);

  if exists (select 1 from _m16 where not ok) then
    raise exception 'M16 falló: %', (select string_agg(test, '; ') from _m16 where not ok);
  end if;
end $$;

select n, test, ok from _m16 order by n;
rollback;
