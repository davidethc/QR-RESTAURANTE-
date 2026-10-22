-- ---------------------------------------------------------------------------
-- M01-T04 · RPC save_product_with_variants (EXPAND).
-- Spec: docs/pos-spec/M01-catalogo.md §3 (product_variants), §5 (1..N
-- variantes; "Desde $X" = la más barata) y §12 M01-T04 ("un solo precio"
-- validado en servidor). Requiere 20261020150000_m01_product_variants.
--
-- Problema: createProduct/updateProduct (src/lib/actions/menu.ts) escriben el
-- producto y sus variantes en varios pasos desde Next. Entre paso y paso la
-- carta puede ver un producto a medias, y si un paso falla el alta queda
-- con una limpieza "best effort".
--
-- Solución: una sola función = una sola transacción. Crea o actualiza el
-- producto y deja sus variantes exactamente como las manda el formulario.
-- Si algo falla, no queda nada escrito.
--
-- Compatible con la app que hoy está en producción: solo agrega la función.
-- No cambia tablas, triggers ni RPC existentes.
--
-- Decisiones:
--   * SECURITY DEFINER con search_path = '' y nombres calificados, para
--     auditar en audit_logs (authenticated no escribe ahí) y para devolver
--     errores claros (42501) en lugar de "0 filas" silenciosas de la RLS. A
--     cambio, la función repite a mano lo que hace la RLS de products:
--       - sesión obligatoria (auth.uid());
--       - OWNER o ADMIN activo en p_restaurant_id (user_has_restaurant_role);
--       - al editar, el producto debe ser de p_restaurant_id (si no, 42501
--         sin distinguir "no existe" de "es de otro restaurante");
--       - category_id y paired_drink_id deben ser de p_restaurant_id (22023).
--   * Firma: p_restaurant_id, p_name y p_variants obligatorios; el resto con
--     default. p_product_id null = alta. En la edición, p_available y
--     p_featured null conservan el valor actual; category_id, description y
--     paired_drink_id se reemplazan (null los vacía), igual que updateProduct.
--   * p_variants: arreglo jsonb [{id?, name, price}] en el orden en que se
--     muestran (position = índice). Validaciones, todas antes de escribir:
--       - al menos una variante (22023);
--       - price número jsonb, >= 0 (23514), hasta 2 decimales y
--         <= 99999999.99 (22023);
--       - name texto de hasta 80 caracteres sin espacios al borde (se recorta);
--       - "un solo precio": con 1 variante, name = '' (23514); con 2 o más,
--         todas con nombre (23514);
--       - nombres no repetidos sin distinguir mayúsculas (23514). PROVISIONAL:
--         la regla la confirma el usuario; la tabla no tiene índice único;
--       - id opcional: uuid, sin repetir y del mismo producto (22023); en el
--         alta no se aceptan ids (22023).
--   * products.price: la función nunca lo escribe en una edición. En el alta
--     lo inserta con el mínimo de las variantes, y desde ahí lo mantiene el
--     trigger de T02 (product_variants_sync_product_price). Escribirlo con 2
--     o más variantes daría 22023 (products_sync_variant_price).
--   * Variante automática: el alta de products dispara
--     products_create_default_variant ('' , price, 0). La función no inserta
--     otra al lado: reutiliza esa fila para la primera variante sin id. En la
--     edición, las variantes sin id también reutilizan primero las filas
--     existentes que el formulario ya no referencia (mismo id, menos
--     churn); las que sobran se borran al final. El constraint diferido de
--     T02 (≥ 1 variante) se revisa al COMMIT.
--   * Concurrencia: en la edición, products FOR UPDATE y luego sus variantes
--     FOR UPDATE, en ese orden (el mismo que usa el trigger de T02), antes de
--     comparar ids.
--   * Auditoría: audit_logs action CREATE/UPDATE, entity_type 'product', con
--     el nombre y las variantes guardadas.
--   * Permisos: execute solo a authenticated (ni public, ni anon, ni
--     service_role: sin sesión de usuario la función siempre rechaza).
--
-- Rollback (mientras la app no llame a la RPC; no hay datos que restaurar):
--   drop function public.save_product_with_variants(uuid, text, jsonb, uuid, uuid, text, uuid, boolean, boolean);
-- ---------------------------------------------------------------------------

create or replace function public.save_product_with_variants(
  p_restaurant_id uuid,
  p_name text,
  p_variants jsonb,
  p_product_id uuid default null,
  p_category_id uuid default null,
  p_description text default null,
  p_paired_drink_id uuid default null,
  p_available boolean default null,
  p_featured boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_create boolean := p_product_id is null;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_product_id uuid;
  v_count int;
  v_elem jsonb;
  v_idx int;
  v_raw_id text;
  v_raw_price numeric;
  v_vname text;
  v_ids uuid[] := '{}';
  v_names text[] := '{}';
  v_prices numeric(10,2)[] := '{}';
  v_dup text;
  v_existing uuid[];
  v_free uuid[];
  v_id uuid;
  v_saved jsonb;
begin
  -- 1. Sesión y rol ---------------------------------------------------------
  if v_uid is null then
    raise exception 'Inicia sesión para administrar el catálogo'
      using errcode = '42501';
  end if;

  if p_restaurant_id is null
     or not (public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')) then
    raise exception 'Solo el dueño o administrador puede modificar el catálogo'
      using errcode = '42501';
  end if;

  if not v_is_create then
    select p.id into v_product_id
    from public.products p
    where p.id = p_product_id
      and p.restaurant_id = p_restaurant_id
    for update;

    if v_product_id is null then
      raise exception 'El producto no existe o no pertenece a este restaurante'
        using errcode = '42501';
    end if;
  end if;

  -- 2. Datos del producto ---------------------------------------------------
  if v_name = '' then
    raise exception 'El nombre del producto es obligatorio'
      using errcode = '22023';
  end if;
  if char_length(v_name) > 150 then
    raise exception 'El nombre del producto admite hasta 150 caracteres'
      using errcode = '22023';
  end if;
  if char_length(coalesce(v_description, '')) > 500 then
    raise exception 'La descripción admite hasta 500 caracteres'
      using errcode = '22023';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = p_category_id and c.restaurant_id = p_restaurant_id
  ) then
    raise exception 'La categoría no pertenece a este restaurante'
      using errcode = '22023';
  end if;

  if p_paired_drink_id is not null then
    if p_paired_drink_id = p_product_id then
      raise exception 'Un producto no puede sugerirse a sí mismo como bebida'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.products d
      where d.id = p_paired_drink_id and d.restaurant_id = p_restaurant_id
    ) then
      raise exception 'La bebida sugerida no pertenece a este restaurante'
        using errcode = '22023';
    end if;
  end if;

  -- 3. Variantes (todo se valida antes de escribir) ---------------------------
  if p_variants is null
     or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'El producto debe tener al menos una variante'
      using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_variants);

  for v_elem, v_idx in
    select e.value, e.ordinality::int
    from jsonb_array_elements(p_variants) with ordinality as e
  loop
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'La variante % no es válida', v_idx
        using errcode = '22023';
    end if;

    if jsonb_typeof(v_elem -> 'price') is distinct from 'number' then
      raise exception 'Ingresa un precio válido en la variante %', v_idx
        using errcode = '22023';
    end if;
    v_raw_price := (v_elem ->> 'price')::numeric;
    if v_raw_price < 0 then
      raise exception 'El precio no puede ser negativo (variante %)', v_idx
        using errcode = '23514';
    end if;
    if v_raw_price <> round(v_raw_price, 2) then
      raise exception 'Usa hasta dos decimales en el precio (variante %)', v_idx
        using errcode = '22023';
    end if;
    if v_raw_price > 99999999.99 then
      raise exception 'El precio es demasiado alto (variante %)', v_idx
        using errcode = '22023';
    end if;

    if coalesce(jsonb_typeof(v_elem -> 'name'), 'null') not in ('string', 'null') then
      raise exception 'El nombre de la variante % no es válido', v_idx
        using errcode = '22023';
    end if;
    v_vname := btrim(coalesce(v_elem ->> 'name', ''));
    if char_length(v_vname) > 80 then
      raise exception 'El nombre de la variante admite hasta 80 caracteres (variante %)', v_idx
        using errcode = '22023';
    end if;

    v_id := null;
    if coalesce(jsonb_typeof(v_elem -> 'id'), 'null') <> 'null' then
      v_raw_id := v_elem ->> 'id';
      if jsonb_typeof(v_elem -> 'id') <> 'string'
         or v_raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'El identificador de la variante % no es válido', v_idx
          using errcode = '22023';
      end if;
      if v_is_create then
        raise exception 'No envíes identificadores de variantes al crear un producto'
          using errcode = '22023';
      end if;
      v_id := v_raw_id::uuid;
      if v_id = any(v_ids) then
        raise exception 'Una variante no puede repetirse'
          using errcode = '22023';
      end if;
    end if;

    v_ids := v_ids || v_id;
    v_names := v_names || v_vname;
    v_prices := v_prices || v_raw_price::numeric(10,2);
  end loop;

  if v_count = 1 and v_names[1] <> '' then
    raise exception 'Con un solo precio, la variante no lleva nombre'
      using errcode = '23514';
  end if;
  if v_count > 1 and '' = any(v_names) then
    raise exception 'Nombra cada variante cuando hay varios precios'
      using errcode = '23514';
  end if;

  select min(n) into v_dup
  from unnest(v_names) as n
  where n <> ''
  group by lower(n)
  having count(*) > 1
  limit 1;
  if v_dup is not null then
    raise exception 'La variante "%" está repetida', v_dup
      using errcode = '23514';
  end if;

  if not v_is_create then
    select coalesce(array_agg(v.id order by v.position, v.created_at, v.id), '{}')
    into v_existing
    from (
      select pv.id, pv.position, pv.created_at
      from public.product_variants pv
      where pv.product_id = v_product_id
      for update
    ) v;

    if exists (
      select 1 from unnest(v_ids) as i
      where i is not null and not (i = any(v_existing))
    ) then
      raise exception 'Una de las variantes no pertenece a este producto'
        using errcode = '22023';
    end if;
  end if;

  -- 4. Escritura ------------------------------------------------------------
  if v_is_create then
    -- products.price = mínimo; el trigger de alta crea la variante automática.
    insert into public.products (
      restaurant_id, category_id, name, description, price,
      available, featured, paired_drink_id
    ) values (
      p_restaurant_id, p_category_id, v_name, v_description,
      (select min(x) from unnest(v_prices) as x),
      coalesce(p_available, true), coalesce(p_featured, false), p_paired_drink_id
    )
    returning id into v_product_id;

    select coalesce(array_agg(pv.id order by pv.position, pv.created_at, pv.id), '{}')
    into v_existing
    from public.product_variants pv
    where pv.product_id = v_product_id;
  else
    -- Sin price: lo deriva el trigger del mínimo de variantes.
    update public.products p
    set category_id = p_category_id,
        name = v_name,
        description = v_description,
        available = coalesce(p_available, p.available),
        featured = coalesce(p_featured, p.featured),
        paired_drink_id = p_paired_drink_id
    where p.id = v_product_id;
  end if;

  -- Filas existentes que el formulario ya no referencia: se reutilizan para
  -- las variantes sin id (en el alta, la automática) y las que sobran se borran.
  select coalesce(array_agg(e order by o), '{}')
  into v_free
  from unnest(v_existing) with ordinality as t(e, o)
  where not (e = any(array_remove(v_ids, null)));

  for v_idx in 1 .. v_count loop
    v_id := v_ids[v_idx];
    if v_id is null and cardinality(v_free) > 0 then
      v_id := v_free[1];
      v_free := v_free[2:];
    end if;

    if v_id is null then
      insert into public.product_variants (product_id, name, price, position)
      values (v_product_id, v_names[v_idx], v_prices[v_idx], v_idx - 1);
    else
      update public.product_variants pv
      set name = v_names[v_idx],
          price = v_prices[v_idx],
          position = v_idx - 1
      where pv.id = v_id
        and pv.product_id = v_product_id;
    end if;
  end loop;

  if cardinality(v_free) > 0 then
    delete from public.product_variants pv
    where pv.product_id = v_product_id
      and pv.id = any(v_free);
  end if;

  -- 5. Auditoría ------------------------------------------------------------
  select jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'price', pv.price) order by pv.position)
  into v_saved
  from public.product_variants pv
  where pv.product_id = v_product_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    p_restaurant_id, v_uid,
    case when v_is_create then 'CREATE' else 'UPDATE' end::public.audit_action,
    'product', v_product_id,
    jsonb_build_object('name', v_name, 'variants', v_saved)
  );

  return v_product_id;
end;
$$;

comment on function public.save_product_with_variants(uuid, text, jsonb, uuid, uuid, text, uuid, boolean, boolean) is
  'M01-T04: crea (p_product_id null) o edita un producto y deja sus variantes como p_variants [{id?, name, price}] en una sola transacción. OWNER/ADMIN del restaurante.';

revoke all on function public.save_product_with_variants(uuid, text, jsonb, uuid, uuid, text, uuid, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.save_product_with_variants(uuid, text, jsonb, uuid, uuid, text, uuid, boolean, boolean)
  to authenticated;
