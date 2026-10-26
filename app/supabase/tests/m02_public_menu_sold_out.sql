-- M02 fix · get_public_menu honours sold-out variants.
-- Run as postgres AFTER 20261026100000. monky-qa only, inside BEGIN ... ROLLBACK.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_r     uuid := (select id from public.restaurants where slug = 'monky-qa');
  v_p     uuid;
  v_other uuid;
  v_menu  jsonb;
  v_avail text;
begin
  -- A product with exactly one variant, available today, and another available product.
  select p.id into v_p from public.products p
    where p.restaurant_id = v_r and p.active and p.available
      and (select count(*) from public.product_variants v where v.product_id = p.id) = 1
    limit 1;
  select p.id into v_other from public.products p
    where p.restaurant_id = v_r and p.active and p.available and p.id <> v_p limit 1;
  if v_p is null or v_other is null then raise exception 'monky-qa needs two available products'; end if;
  delete from public.availability where product_id in (v_p, v_other);

  insert into public.availability (restaurant_id, item_type, item_id, product_id, available)
  select v_r, 'variant', v.id, v.product_id, false from public.product_variants v where v.product_id = v_p;

  perform set_config('role', 'anon', true);
  v_menu := public.get_public_menu('monky-qa');
  perform set_config('role', 'postgres', true);

  select prod ->> 'available' into v_avail
    from jsonb_array_elements(v_menu -> 'categories') c, jsonb_array_elements(c -> 'products') prod
    where prod ->> 'id' = v_p::text;
  if v_avail is distinct from 'false' then
    raise exception 'a product whose only variant is sold out must be unavailable, got %', v_avail;
  end if;

  select prod ->> 'available' into v_avail
    from jsonb_array_elements(v_menu -> 'categories') c, jsonb_array_elements(c -> 'products') prod
    where prod ->> 'id' = v_other::text;
  if v_avail is distinct from 'true' then
    raise exception 'an untouched product must stay available, got %', v_avail;
  end if;
end $$;

select 'm02 public menu sold out ok' as result;
rollback;
