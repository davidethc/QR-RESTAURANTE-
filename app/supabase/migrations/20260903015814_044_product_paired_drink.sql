alter table public.products
  add column paired_drink_id uuid references public.products(id) on delete set null;

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
                    p.available,
                    p.featured,
                    p.position,
                    case when d.id is not null then jsonb_build_object(
                      'id', d.id,
                      'name', d.name,
                      'price', d.price,
                      'image_url', d.image_url,
                      'available', d.available
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

create or replace function public.get_admin_menu(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  select jsonb_build_object(
    'categories', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',          c.id,
            'name',        c.name,
            'description', c.description,
            'position',    c.position,
            'active',      c.active,
            'product_count', (
              select count(*) from public.products p where p.category_id = c.id
            )
          )
          order by c.position, c.name
        )
        from public.categories c
        where c.restaurant_id = p_restaurant_id
      ),
      '[]'::jsonb
    ),
    'products', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',              p.id,
            'category_id',     p.category_id,
            'category_name',   c.name,
            'name',            p.name,
            'description',     p.description,
            'price',           p.price,
            'image_url',       p.image_url,
            'active',          p.active,
            'available',       p.available,
            'featured',        p.featured,
            'position',        p.position,
            'paired_drink_id', p.paired_drink_id
          )
          order by p.position, p.name
        )
        from public.products p
        left join public.categories c on c.id = p.category_id
        where p.restaurant_id = p_restaurant_id
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$function$;
