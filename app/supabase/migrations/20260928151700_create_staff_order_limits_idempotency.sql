-- ---------------------------------------------------------------------------
-- Pedidos (3/3) · create_staff_order: límites + idempotencia.
--
-- Firma nueva:
--   create_staff_order(p_table_id uuid, p_items jsonb,
--                      p_notes text default null,
--                      p_client_request_id uuid default null) returns uuid
--
-- DROP + CREATE en la misma migración (ver create_customer_order): sin
-- overloads ambiguos en PostgREST; la app actual sigue funcionando.
--
-- Límites (build_order_lines): 1-50 líneas, cantidad 1-99, nota por línea
-- <= 200. Nota general <= 200. Errores P0001 en español.
--
-- Idempotencia: después del candado de la mesa, si ya existe un pedido con
-- ese client_request_id en el restaurante se devuelve el mismo id (si es de
-- esta mesa) o error (si es de otra). No se repiten auditoría ni cierre de
-- llamadas en el reintento.
--
-- Resto del flujo idéntico a la versión vigente en producción.
-- ---------------------------------------------------------------------------

drop function if exists public.create_staff_order(uuid, jsonb, text);

create function public.create_staff_order(
  p_table_id uuid,
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
  v_table    public.tables%rowtype;
  v_session  public.table_sessions%rowtype;
  v_existing public.orders%rowtype;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_notes    text;
  v_order_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- for update: el mismo candado que usa resolve_table_qr. Sin él, dos meseros
  -- enviando a la vez en la misma mesa podrían crear dos sesiones.
  select *
  into v_table
  from public.tables
  where id = p_table_id
    and status <> 'INACTIVE'
    and kind = 'TABLE'  -- C2: el mostrador vende con create_counter_sale.
  for update;

  if not found then
    raise exception 'Mesa no encontrada o inactiva';
  end if;

  if not (
    public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para tomar pedidos';
  end if;

  if p_client_request_id is not null then
    select * into v_existing
    from public.orders
    where restaurant_id = v_table.restaurant_id
      and client_request_id = p_client_request_id;

    if found then
      if v_existing.table_id is distinct from v_table.id then
        raise exception 'La clave de idempotencia ya se usó en otra mesa';
      end if;
      return v_existing.id;
    end if;
  end if;

  if length(btrim(coalesce(p_notes, ''))) > 200 then
    raise exception 'La nota del pedido admite hasta 200 caracteres';
  end if;
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  -- Los precios se calculan acá, nunca se toman de lo que mande el navegador.
  v_built := public.build_order_lines(v_table.restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;

  v_session := public.find_or_create_active_table_session(
    v_table.id,
    v_table.restaurant_id
  );

  insert into public.orders (
    restaurant_id,
    table_id,
    table_session_id,
    status,
    subtotal,
    total,
    notes,
    accepted_by,
    accepted_at,
    preparing_at,
    client_request_id
  )
  values (
    v_table.restaurant_id,
    v_table.id,
    v_session.id,
    'PREPARING',
    v_subtotal,
    v_subtotal,
    v_notes,
    auth.uid(),
    now(),
    now(),
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

  -- Mismas dos entradas que deja accept_and_prepare_order: el pedido pasó por
  -- los dos momentos a la vez, y quién lo hizo tiene que quedar registrado.
  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id
  )
  values
    (v_table.restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order_id),
    (v_table.restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order_id);

  -- Si la mesa había llamado al mesero, esa llamada acaba de ser atendida por
  -- definición: él está ahí, tomándole el pedido.
  update public.waiter_calls
  set status = 'ATTENDED',
      handled_by = auth.uid(),
      handled_at = now()
  where table_id = v_table.id
    and type = 'WAITER'
    and status in ('PENDING', 'ACCEPTED');

  return v_order_id;
end;
$$;

revoke all on function public.create_staff_order(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.create_staff_order(uuid, jsonb, text, uuid) to authenticated, service_role;
