-- ---------------------------------------------------------------------------
-- Pedidos (2/3) · create_customer_order: límites + idempotencia.
--
-- Firma nueva:
--   create_customer_order(p_session_token uuid, p_items jsonb,
--                         p_notes text default null,
--                         p_client_request_id uuid default null) returns uuid
--
-- DROP de la firma vieja y CREATE de la nueva en esta misma migración: si
-- conviven (uuid,jsonb,text) y (uuid,jsonb,text,uuid) con defaults,
-- PostgREST no sabe cuál llamar cuando no llega p_client_request_id. La app
-- actual (que no manda el parámetro) sigue funcionando con la nueva.
--
-- Límites (build_order_lines): 1-50 líneas, cantidad 1-99, nota por línea
-- <= 200. Nota general (p_notes) <= 200. Errores P0001 en español.
--
-- Idempotencia: si ya existe un pedido con ese client_request_id en el
-- restaurante (índice único orders_client_request_id_uq, migración
-- 20260928134922), se devuelve ese mismo id sin crear otro. Si ese pedido es
-- de otra sesión, error (no se revela nada del otro pedido).
--
-- Candados: mesa -> sesión (mismo orden que resolve_table_qr). Dos envíos
-- simultáneos con la misma clave se serializan y el segundo ve el primero.
-- Antes no había candado y el trigger de estado de mesa tomaba tables
-- después de insertar el pedido.
--
-- La búsqueda por token no filtra por estado para que un reintento de un
-- pedido ya creado devuelva su id aunque la sesión se haya cerrado después;
-- un pedido NUEVO sigue exigiendo sesión ACTIVE.
-- ---------------------------------------------------------------------------

drop function if exists public.create_customer_order(uuid, jsonb, text);

create function public.create_customer_order(
  p_session_token uuid,
  p_items jsonb,
  p_notes text default null,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.table_sessions%rowtype;
  v_existing public.orders%rowtype;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_notes    text;
  v_order_id uuid;
begin
  if p_session_token is null then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  select * into v_session
  from public.table_sessions
  where session_token = p_session_token;

  if not found then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  -- Candados en orden mesa -> sesión.
  perform 1 from public.tables where id = v_session.table_id for update;

  select * into v_session
  from public.table_sessions
  where id = v_session.id
  for update;

  if p_client_request_id is not null then
    select * into v_existing
    from public.orders
    where restaurant_id = v_session.restaurant_id
      and client_request_id = p_client_request_id;

    if found then
      if v_existing.table_session_id is distinct from v_session.id then
        raise exception 'No se pudo enviar el pedido. Vuelve a intentarlo.';
      end if;
      return v_existing.id;
    end if;
  end if;

  if v_session.status <> 'ACTIVE' then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  if length(btrim(coalesce(p_notes, ''))) > 200 then
    raise exception 'La nota del pedido admite hasta 200 caracteres';
  end if;
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  v_built := public.build_order_lines(v_session.restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;

  insert into public.orders (
    restaurant_id,
    table_id,
    table_session_id,
    status,
    subtotal,
    total,
    notes,
    client_request_id
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    'PENDING',
    v_subtotal,
    v_subtotal,
    v_notes,
    p_client_request_id
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, subtotal, notes
  )
  select v_order_id,
         (l ->> 'product_id')::uuid,
         l ->> 'product_name',
         (l ->> 'quantity')::integer,
         (l ->> 'unit_price')::numeric,
         (l ->> 'subtotal')::numeric,
         l ->> 'notes'
  from jsonb_array_elements(v_built -> 'lines') with ordinality as t(l, n)
  order by n;

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_order_id;
end;
$$;

-- RPC de cliente: la única de pedidos que llega a anon.
revoke all on function public.create_customer_order(uuid, jsonb, text, uuid) from public;
grant execute on function public.create_customer_order(uuid, jsonb, text, uuid) to anon, authenticated, service_role;
