-- M02-T02/T03 · Ejecutar en monky-qa (nunca omm-siri) tras aplicar
-- 20261021180000_m02_availability_rpcs.sql. Todo es transitorio: ROLLBACK.
begin;

create temp table _r (test text, ok boolean) on commit drop;
grant all on _r to authenticated, anon;

do $$
declare
  v_rest uuid; v_owner uuid; v_waiter uuid := gen_random_uuid();
  v_out uuid := gen_random_uuid(); v_var uuid; v_prod uuid; v_opt uuid;
  v_n int; v_denied boolean;
begin
  select id into v_rest from public.restaurants where slug = 'monky-qa';
  if v_rest is null then raise exception 'Se requiere monky-qa'; end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_waiter, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-w-'||v_waiter||'@example.invalid', now(), now()),
         (v_out, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-o-'||v_out||'@example.invalid', now(), now());
  insert into public.profiles (id, full_name) values (v_waiter, 'QA w'), (v_out, 'QA o') on conflict do nothing;
  insert into public.restaurant_members (restaurant_id, user_id, role, status)
  values (v_rest, v_waiter, 'WAITER', 'ACTIVE');

  select v.id, v.product_id into v_var, v_prod
  from public.product_variants v join public.products p on p.id = v.product_id
  where p.restaurant_id = v_rest limit 1;
  select o.id into v_opt from public.modifier_options o
  join public.modifier_groups g on g.id = o.group_id where g.restaurant_id = v_rest limit 1;

  -- T02: sin fila = disponible; con todas agotadas = false
  delete from public.availability where item_type = 'variant' and item_id = v_var;
  insert into _r values ('sin fila = disponible', public.product_effective_available(v_prod) is true);
  update public.availability set available = false where item_type = 'variant' and product_id = v_prod;
  select count(*) into v_n from public.product_variants where product_id = v_prod;
  insert into _r values ('todas agotadas = false', public.product_effective_available(v_prod) is false);
  insert into _r values ('producto inexistente = null', public.product_effective_available(gen_random_uuid()) is null);

  -- T03: WAITER del mismo restaurante cambia variante
  perform set_config('request.jwt.claims', json_build_object('sub', v_waiter, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.set_item_availability('variant', v_var, true);
  insert into _r values ('waiter puede reactivar variante', public.product_effective_available(v_prod) is true);
  if v_opt is not null then
    perform public.set_item_availability('modifier_option', v_opt, false);
  end if;
  v_denied := false;
  begin perform public.set_item_availability('variant', gen_random_uuid(), true);
  exception when insufficient_privilege then v_denied := true; end;
  insert into _r values ('ítem inexistente = 42501', v_denied);

  -- Ajeno sin membresía
  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  v_denied := false;
  begin perform public.set_item_availability('variant', v_var, false);
  exception when insufficient_privilege then v_denied := true; end;
  insert into _r values ('usuario ajeno = 42501', v_denied);

  -- anon sin execute
  perform set_config('role', 'anon', true);
  v_denied := false;
  begin perform public.set_item_availability('variant', v_var, false);
  exception when insufficient_privilege then v_denied := true; end;
  insert into _r values ('anon sin execute', v_denied);
  perform set_config('role', 'none', true);

  insert into _r select 'audit_logs registrado', exists (
    select 1 from public.audit_logs where restaurant_id = v_rest and user_id = v_waiter
      and entity_type = 'availability' and entity_id = v_var);
end;
$$;

select test, ok from _r;
rollback;
