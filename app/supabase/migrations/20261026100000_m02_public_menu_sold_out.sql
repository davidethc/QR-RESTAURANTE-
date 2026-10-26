-- ---------------------------------------------------------------------------
-- M02 fix · The public menu honours sold-out variants.
--
-- set_item_availability (M02) marks variants sold out in public.availability,
-- but get_public_menu still returned only products.available, so a dish
-- switched to "Agotado" in /availability kept its add button in /r and
-- /pedir (found by the M18 e2e unit 6). A product is now available only
-- when products.available is on AND at least one of its variants is
-- available (product_effective_available). Same signature and output shape.
--
-- Rollback: reapply get_public_menu from 20260903015814_044_product_paired_drink.sql.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.get_public_menu(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_restaurant public.restaurants%rowtype;
  v_result jsonb;
begin
  select *
  into v_restaurant
  from public.restaurants
  where slug = p_slug
    and status = 'ACTIVE';

  if not found then
    raise exception 'Restaurante no disponible';
  end if;

  select jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id',              v_restaurant.id,
      'name',            v_restaurant.name,
      'slug',            v_restaurant.slug,
      'description',     v_restaurant.description,
      'logo_url',        v_restaurant.logo_url,
      'cover_image_url', v_restaurant.cover_image_url,
      'phone',           v_restaurant.phone,
      'address',         v_restaurant.address,
      'timezone',        v_restaurant.timezone,
      'opening_hours',   v_restaurant.opening_hours
    ),
    'categories', coalesce(
      (
        select jsonb_agg(cat order by cat.position, cat.name)
        from (
          select
            c.id,
            c.name,
            c.description,
            c.position,
            coalesce(
              (
                select jsonb_agg(prod order by prod.position, prod.name)
                from (
                  select
                    p.id,
                    p.name,
                    p.description,
                    p.price,
                    p.image_url,
                    -- Sold out when the product is off OR every variant is
                    -- sold out in availability (M02); no variants = on.
                    (p.available and coalesce(public.product_effective_available(p.id), true)
                      or (p.available and not exists (
                        select 1 from public.product_variants v where v.product_id = p.id)))
                      as available,
                    p.featured,
                    p.position,
                    case when d.id is not null then jsonb_build_object(
                      'id', d.id,
                      'name', d.name,
                      'price', d.price,
                      'image_url', d.image_url,
                      'available', d.available and coalesce(public.product_effective_available(d.id), true)
                    ) else null end as paired_drink
                  from public.products p
                  left join public.products d on d.id = p.paired_drink_id
                  where p.category_id = c.id
                    and p.active = true
                ) prod
              ),
              '[]'::jsonb
            ) as products
          from public.categories c
          where c.restaurant_id = v_restaurant.id
            and c.active = true
        ) cat
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$function$;
