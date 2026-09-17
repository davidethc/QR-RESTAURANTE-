
-- Carta pública para el cliente anónimo del QR.
-- Una sola llamada (sección 55 del documento V2) y sin abrir tablas a anon.
-- Expone únicamente lo que la sección 54 permite: restaurante, categorías
-- activas y productos activos. Nunca usuarios, pedidos ni datos administrativos.

create or replace function public.get_public_menu(
  p_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
                    p.available,
                    p.position
                  from public.products p
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
$$;

revoke execute on function public.get_public_menu(text) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated;
