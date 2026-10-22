-- ---------------------------------------------------------------------------
-- Integración sprint 1 + M04. Depende de TODAS las migraciones anteriores.
--   1) add_ticket (M04-T02) acepta variant_id en las líneas igual que
--      create_staff_order: copia variant_id/variant_name/variant_price que ya
--      entrega build_order_lines (M01-T05a) a order_items.
--   2) set_item_availability (M02-T03) admite también restaurant_members.roles[]
--      (CASHIER, MENU_MANAGER, además de ADMIN/WAITER/KITCHEN) y no solo el
--      role legacy. Sigue exigiendo miembro ACTIVE del restaurante del ítem.
--   build_order_lines / create_customer_order / create_staff_order no
--   necesitan cambio: el folio, short_code y la comanda #1 los asignan los
--   triggers de M04-T01 (BEFORE INSERT), compatibles con las líneas con variante.
-- Rollback: volver a aplicar las definiciones de 20261022020000 y 20261021180000.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';

create or replace function public.add_ticket(
  p_order_id uuid,
  p_items jsonb,
  p_request_id uuid default null,
  p_table_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table_id uuid;
  v_table    public.tables%rowtype;
  v_order    public.orders%rowtype;
  v_session  public.table_sessions%rowtype;
  v_ticket   public.tickets%rowtype;
  v_exist_o  public.orders%rowtype;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_number   integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_order_id is not null then
    select table_id into v_table_id from public.orders where id = p_order_id;
  else
    v_table_id := p_table_id;
  end if;
  if v_table_id is null then
    raise exception 'Pedido o mesa no encontrados';
  end if;

  -- Orden de candados: mesa -> pedido.
  select * into v_table from public.tables where id = v_table_id for update;
  if not found or v_table.kind <> 'TABLE' or v_table.status = 'INACTIVE' then
    raise exception 'Mesa no encontrada o inactiva';
  end if;

  if not (
    public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para tomar pedidos';
  end if;

  if p_order_id is not null then
    select * into v_order from public.orders where id = p_order_id for update;
    if not found or v_order.table_id is distinct from v_table.id then
      raise exception 'Pedido no encontrado';
    end if;
  end if;

  -- Idempotencia: mismo request_id => misma comanda (si es de este contexto).
  if p_request_id is not null then
    select * into v_ticket from public.tickets where client_request_id = p_request_id;
    if found then
      select * into v_exist_o from public.orders where id = v_ticket.order_id;
      if v_exist_o.restaurant_id <> v_table.restaurant_id
         or v_exist_o.table_id is distinct from v_table.id
         or (p_order_id is not null and v_exist_o.id <> p_order_id) then
        raise exception 'La clave de idempotencia ya se usó en otro pedido';
      end if;
      return jsonb_build_object('order_id', v_exist_o.id, 'ticket_id', v_ticket.id,
        'ticket_number', v_ticket.number, 'folio', v_exist_o.folio,
        'short_code', v_exist_o.short_code, 'replayed', true);
    end if;
  end if;

  -- Precios y límites del servidor (1-50 líneas, cantidad 1-99, notas <= 200).
  v_built := public.build_order_lines(v_table.restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;

  if p_order_id is null then
    -- Primer "Guardar" de la mesa: nace el pedido (folio y código por trigger).
    v_session := public.find_or_create_active_table_session(v_table.id, v_table.restaurant_id);
    if exists (select 1 from public.orders o
               where o.table_session_id = v_session.id
                 and o.status not in ('REJECTED', 'CANCELLED')) then
      raise exception 'La mesa ya tiene un pedido: agrega la comanda a ese pedido';
    end if;

    insert into public.orders (restaurant_id, table_id, table_session_id, status, subtotal, total,
                               accepted_by, accepted_at, preparing_at)
    values (v_table.restaurant_id, v_table.id, v_session.id, 'PREPARING', v_subtotal, v_subtotal,
            auth.uid(), now(), now())
    returning * into v_order;
  else
    if v_order.cancelled or v_order.status in ('REJECTED', 'CANCELLED') then
      raise exception 'El pedido está cancelado';
    end if;
    if v_order.status = 'PENDING' then
      raise exception 'Acepta primero el pedido del cliente';
    end if;
    if v_order.table_session_id is null
       or not exists (select 1 from public.table_sessions s
                      where s.id = v_order.table_session_id and s.status = 'ACTIVE') then
      raise exception 'La mesa ya fue cerrada';
    end if;
    if exists (select 1 from public.bills b
               where b.table_session_id = v_order.table_session_id and b.status in ('PAID', 'CLOSED')) then
      raise exception 'La cuenta ya fue cobrada: no se puede agregar productos';
    end if;

    update public.orders
    set subtotal = subtotal + v_subtotal,
        total = total + v_subtotal,
        status = 'PREPARING',
        accepted_by = coalesce(accepted_by, auth.uid()),
        accepted_at = coalesce(accepted_at, now()),
        preparing_at = case when status = 'PREPARING' then preparing_at else now() end,
        ready_at = case when status = 'PREPARING' then ready_at else null end,
        delivered_at = case when status = 'PREPARING' then delivered_at else null end
    where id = v_order.id
    returning * into v_order;
  end if;

  select coalesce(max(number), 0) + 1 into v_number from public.tickets where order_id = v_order.id;

  insert into public.tickets (order_id, number, created_by, client_request_id)
  values (v_order.id, v_number, auth.uid(), p_request_id)
  returning * into v_ticket;

  insert into public.order_items (order_id, ticket_id, product_id, product_name, quantity, unit_price, subtotal, notes,
                                  variant_id, variant_name, variant_price)
  select v_order.id, v_ticket.id, (l ->> 'product_id')::uuid, l ->> 'product_name',
         (l ->> 'quantity')::integer, (l ->> 'unit_price')::numeric, (l ->> 'subtotal')::numeric, l ->> 'notes',
         (l ->> 'variant_id')::uuid, l ->> 'variant_name', (l ->> 'variant_price')::numeric
  from jsonb_array_elements(v_built -> 'lines') with ordinality as t(l, n)
  order by n;

  update public.table_sessions set last_activity_at = now() where id = v_order.table_session_id;

  update public.waiter_calls
  set status = 'ATTENDED', handled_by = auth.uid(), handled_at = now()
  where table_id = v_table.id and type = 'WAITER' and status in ('PENDING', 'ACCEPTED');

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_table.restaurant_id, auth.uid(), 'CREATE', 'TICKET', v_ticket.id,
          jsonb_build_object('order_id', v_order.id, 'ticket_number', v_number,
                             'folio', v_order.folio, 'subtotal', v_subtotal));

  return jsonb_build_object('order_id', v_order.id, 'ticket_id', v_ticket.id,
    'ticket_number', v_number, 'folio', v_order.folio, 'short_code', v_order.short_code,
    'replayed', false);
end;
$$;

create or replace function public.set_item_availability(
  p_item_type text,
  p_item_id uuid,
  p_available boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id uuid;
  v_product_id uuid;
  v_group_id uuid;
  v_previous boolean;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para cambiar la disponibilidad'
      using errcode = '42501';
  end if;

  if p_item_type is null or p_item_type not in ('variant', 'modifier_option')
     or p_item_id is null or p_available is null then
    raise exception 'Datos de disponibilidad inválidos' using errcode = '22023';
  end if;

  -- El restaurante sale del ítem, nunca del cliente.
  if p_item_type = 'variant' then
    select p.restaurant_id, p.id into v_restaurant_id, v_product_id
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = p_item_id;
  else
    select g.restaurant_id, g.id into v_restaurant_id, v_group_id
    from public.modifier_options o
    join public.modifier_groups g on g.id = o.group_id
    where o.id = p_item_id;
  end if;

  if v_restaurant_id is null
     or not exists (
       select 1 from public.restaurant_members rm
       where rm.restaurant_id = v_restaurant_id
         and rm.user_id = v_uid
         and rm.status = 'ACTIVE'
         and (
           rm.role::text in ('OWNER', 'ADMIN', 'WAITER', 'KITCHEN', 'CASHIER')
           or rm.roles && array['ADMIN', 'WAITER', 'KITCHEN', 'CASHIER', 'MENU_MANAGER']::text[]
         )
     ) then
    raise exception 'El ítem no existe o no puedes cambiar su disponibilidad'
      using errcode = '42501';
  end if;

  select a.available into v_previous
  from public.availability a
  where a.restaurant_id = v_restaurant_id
    and a.item_type = p_item_type
    and a.item_id = p_item_id
  for update;

  insert into public.availability
    (restaurant_id, item_type, item_id, product_id, group_id, available)
  values
    (v_restaurant_id, p_item_type, p_item_id, v_product_id, v_group_id, p_available)
  on conflict (restaurant_id, item_type, item_id)
  do update set available = excluded.available;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_restaurant_id, v_uid, 'UPDATE'::public.audit_action,
    'availability', p_item_id,
    jsonb_build_object(
      'item_type', p_item_type,
      'available', p_available,
      'previous', coalesce(v_previous, true)
    )
  );
end;
$$;

revoke all on function public.add_ticket(uuid, jsonb, uuid, uuid) from public, anon;
grant execute on function public.add_ticket(uuid, jsonb, uuid, uuid) to authenticated, service_role;

revoke all on function public.set_item_availability(text, uuid, boolean) from public;
revoke execute on function public.set_item_availability(text, uuid, boolean) from anon;
grant execute on function public.set_item_availability(text, uuid, boolean) to authenticated, service_role;
