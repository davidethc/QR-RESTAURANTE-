-- ---------------------------------------------------------------------------
-- Pedidos (1/3) · Validación y precio de las líneas de un pedido.
--
-- Una sola implementación para create_customer_order y create_staff_order
-- (las mismas reglas que ya aplica add_items_to_bill):
--   · p_items: arreglo de 1 a 50 líneas
--   · cada línea: objeto con product_id (uuid) y quantity (entero 1..99)
--   · notes de la línea: texto o null, hasta 200 caracteres (tras btrim)
--   · el producto debe ser del restaurante, activo y disponible
--   · el precio sale de products, nunca del navegador
-- Todos los errores son RAISE EXCEPTION (SQLSTATE P0001) con mensaje en
-- español para mostrar tal cual.
--
-- Devuelve {"subtotal": n, "lines": [{product_id, product_name, quantity,
-- unit_price, subtotal, notes}, ...]} en el orden recibido.
--
-- Interna: solo la llaman RPCs SECURITY DEFINER.
-- ---------------------------------------------------------------------------

create or replace function public.build_order_lines(p_restaurant_id uuid, p_items jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_item       jsonb;
  v_product    public.products%rowtype;
  v_product_id uuid;
  v_quantity   integer;
  v_notes      text;
  v_lines      jsonb := '[]'::jsonb;
  v_subtotal   numeric(10,2) := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener productos';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Demasiados productos en un solo pedido (máximo 50 líneas)';
  end if;

  -- Primera pasada: forma de cada línea (barato, sin tocar tablas).
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Producto inválido en el pedido';
    end if;

    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity   := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Producto inválido en el pedido';
    end;

    if v_product_id is null then
      raise exception 'Producto inválido en el pedido';
    end if;

    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'La cantidad debe estar entre 1 y 99';
    end if;

    if v_item ? 'notes'
       and jsonb_typeof(v_item -> 'notes') not in ('string', 'null') then
      raise exception 'Producto inválido en el pedido';
    end if;

    if length(btrim(coalesce(v_item ->> 'notes', ''))) > 200 then
      raise exception 'La nota de un producto admite hasta 200 caracteres';
    end if;
  end loop;

  -- Segunda pasada: producto y precio del servidor.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity   := (v_item ->> 'quantity')::integer;
    v_notes      := nullif(btrim(coalesce(v_item ->> 'notes', '')), '');

    select * into v_product
    from public.products
    where id = v_product_id
      and restaurant_id = p_restaurant_id
      and active = true
      and available = true;

    if not found then
      raise exception 'Uno de los productos no está disponible';
    end if;

    v_subtotal := v_subtotal + v_product.price * v_quantity;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',   v_product.id,
      'product_name', v_product.name,
      'quantity',     v_quantity,
      'unit_price',   v_product.price,
      'subtotal',     v_product.price * v_quantity,
      'notes',        v_notes
    ));
  end loop;

  return jsonb_build_object('subtotal', v_subtotal, 'lines', v_lines);
end;
$$;

comment on function public.build_order_lines(uuid, jsonb) is
  'Valida (1-50 líneas, cantidad 1-99, nota <= 200) y valoriza con precios del servidor las líneas de un pedido. Interna.';

revoke all on function public.build_order_lines(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.build_order_lines(uuid, jsonb) to service_role;
