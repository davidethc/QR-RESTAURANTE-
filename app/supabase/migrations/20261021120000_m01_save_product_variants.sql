-- ---------------------------------------------------------------------------
-- M01-T04 · RPC save_product_variants (EXPAND).
-- Spec: docs/pos-spec/M01-catalogo.md §3 (product_variants), §5 (1..N
-- variantes; "Desde $X" = la más barata) y §12 M01-T04. Requiere
-- 20261020150000_m01_product_variants. Hermana de
-- 20261021100000_m01_save_product_with_variants (que NO se modifica).
--
-- Problema: la pantalla de variantes guarda solo las variantes. Usar
-- save_product_with_variants obligaría a reenviar name, category,
-- description, paired_drink, available y featured, y pisaría lo que otro
-- usuario haya cambiado en el producto entre que se abrió el formulario y se
-- guardó.
--
-- Solución: una sola función = una sola transacción que deja las variantes
-- del producto exactamente como las manda el formulario y no escribe en
-- products. Si algo falla, no queda nada escrito.
--
-- Compatible con la app que hoy está en producción: solo agrega la función.
-- No cambia tablas, triggers ni RPC existentes.
--
-- Decisiones (mismas reglas que save_product_with_variants):
--   * SECURITY DEFINER con search_path = '' y nombres calificados (audita en
--     audit_logs y devuelve 42501 en lugar de "0 filas" de la RLS). Repite a
--     mano lo que hace la RLS:
--       - sesión obligatoria (auth.uid());
--       - el restaurante sale del producto (no lo manda el cliente);
--         producto null, inexistente o de un restaurante donde no soy
--         OWNER/ADMIN activo dan el mismo 42501 (no se distingue "no existe"
--         de "es ajeno");
--       - el rol se revisa ANTES de bloquear la fila, para que un usuario sin
--         permiso no pueda bloquear productos ajenos.
--   * p_variants: arreglo jsonb [{id?, name, price}] en el orden en que se
--     muestran (position = índice). Validaciones, todas antes de escribir,
--     con los mismos mensajes y errcodes que save_product_with_variants:
--       - al menos una variante (22023);
--       - price número jsonb, >= 0 (23514), hasta 2 decimales y
--         <= 99999999.99 (22023);
--       - name texto de hasta 80 caracteres (se recorta);
--       - "un solo precio": con 1 variante, name = '' (23514); con 2 o más,
--         todas con nombre (23514);
--       - nombres no repetidos sin distinguir mayúsculas (23514). PROVISIONAL,
--         igual que en la RPC hermana;
--       - id opcional: uuid, sin repetir y de este producto (22023).
--   * products: nunca se escribe. products.price lo deriva el trigger de T02
--     (product_variants_sync_product_price) del mínimo de las variantes.
--   * Reutilización: las variantes sin id reutilizan primero las filas que el
--     formulario ya no referencia; las que sobran se borran al final. El
--     constraint diferido de T02 (>= 1 variante) se revisa al COMMIT.
--   * Concurrencia: products FOR UPDATE y luego sus variantes FOR UPDATE, en
--     ese orden (el mismo de la RPC hermana y del trigger de T02).
--   * Auditoría: audit_logs action UPDATE, entity_type 'product', con el
--     nombre del producto, scope 'variants' y las variantes guardadas.
--   * Sin función interna compartida: factorizar obligaba a reescribir la
--     RPC hermana ya aprobada (y su validación previa al INSERT del alta).
--     Se duplica el bloque de validación; unificar queda para el contract.
--   * Permisos: execute solo a authenticated.
--
-- Rollback (mientras la app no llame a la RPC; no hay datos que restaurar):
--   drop function public.save_product_variants(uuid, jsonb);
-- ---------------------------------------------------------------------------

create or replace function public.save_product_variants(
  p_product_id uuid,
  p_variants jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id uuid;
  v_product_name text;
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
  -- 1. Sesión, producto y rol -------------------------------------------------
  if v_uid is null then
    raise exception 'Inicia sesión para administrar el catálogo'
      using errcode = '42501';
  end if;

  select p.restaurant_id into v_restaurant_id
  from public.products p
  where p.id = p_product_id;

  if v_restaurant_id is null
     or not (public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')) then
    raise exception 'El producto no existe o no puedes modificar su catálogo'
      using errcode = '42501';
  end if;

  select p.name into v_product_name
  from public.products p
  where p.id = p_product_id
    and p.restaurant_id = v_restaurant_id
  for update;

  if not found then
    raise exception 'El producto no existe o no puedes modificar su catálogo'
      using errcode = '42501';
  end if;

  -- 2. Variantes (todo se valida antes de escribir) ---------------------------
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

  select coalesce(array_agg(v.id order by v.position, v.created_at, v.id), '{}')
  into v_existing
  from (
    select pv.id, pv.position, pv.created_at
    from public.product_variants pv
    where pv.product_id = p_product_id
    for update
  ) v;

  if exists (
    select 1 from unnest(v_ids) as i
    where i is not null and not (i = any(v_existing))
  ) then
    raise exception 'Una de las variantes no pertenece a este producto'
      using errcode = '22023';
  end if;

  -- 3. Escritura (solo product_variants; products.price lo deriva el trigger) --
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
      values (p_product_id, v_names[v_idx], v_prices[v_idx], v_idx - 1);
    else
      update public.product_variants pv
      set name = v_names[v_idx],
          price = v_prices[v_idx],
          position = v_idx - 1
      where pv.id = v_id
        and pv.product_id = p_product_id;
    end if;
  end loop;

  if cardinality(v_free) > 0 then
    delete from public.product_variants pv
    where pv.product_id = p_product_id
      and pv.id = any(v_free);
  end if;

  -- 4. Auditoría --------------------------------------------------------------
  select jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'price', pv.price) order by pv.position)
  into v_saved
  from public.product_variants pv
  where pv.product_id = p_product_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_restaurant_id, v_uid, 'UPDATE'::public.audit_action,
    'product', p_product_id,
    jsonb_build_object('name', v_product_name, 'scope', 'variants', 'variants', v_saved)
  );
end;
$$;

comment on function public.save_product_variants(uuid, jsonb) is
  'M01-T04: deja las variantes de un producto como p_variants [{id?, name, price}] en una sola transacción, sin tocar el resto del producto. OWNER/ADMIN del restaurante del producto.';

revoke all on function public.save_product_variants(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_product_variants(uuid, jsonb)
  to authenticated;
