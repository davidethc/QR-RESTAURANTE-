-- ---------------------------------------------------------------------------
-- M04-T02 / T03 / T09 · RPC de mesa: abrir, comandas, cancelar producto,
-- cancelar pedido con motivo y transferir. Depende de M04-T01 (20261022010000).
-- Fuente: docs/pos-spec/M04-pedido-mesa-comandas.md §4, §5, §10.
--
-- Aditiva: no cambia ninguna RPC existente (create_staff_order,
-- create_customer_order, cancel_order, close_table_session... siguen igual).
-- Todas SECURITY DEFINER con search_path '' (todo calificado), rol por
-- restaurante, revoke a anon, candados mesa -> pedido (mismo orden que
-- close_table_session / lock_bill, sin inversión) y auditoría.
--
-- Decisiones:
--   * open_table SOLO abre la sesión de la mesa; NO crea pedido. El pedido
--     (con folio y código) y la comanda #1 nacen en el primer add_ticket
--     (§10.1: sin pedidos vacíos que bloqueen el corte de caja; el folio no
--     se consume por mesas abiertas y abandonadas). Consecuencia: table_
--     effective_status sigue marcando la mesa AVAILABLE hasta la primera
--     comanda; la UI debe usar la sesión devuelta por open_table.
--   * add_ticket(p_order_id null, ..., p_table_id) crea ese primer pedido.
--     Con p_order_id agrega la comanda #N+1 y reabre el pedido a PREPARING
--     (si estaba ACCEPTED/READY/DELIVERED). No acepta pedidos PENDING del
--     cliente (primero se aceptan) ni cuentas PAID/CLOSED ("cobrada no se
--     reabre"). Idempotencia: tickets.client_request_id (único).
--   * cancel_order_item: motivo >= 3; rechaza si el pedido queda sin
--     productos (usar cancelar pedido) o si el ítem tiene descuento activo.
--     Evento de seguridad: audit_logs action UPDATE + metadata.security_event
--     (el enum audit_action no tiene CANCEL_*; no se altera aquí para evitar
--     el uso de un valor de enum en la misma transacción).
--   * cancel_order_with_reason: OWNER/ADMIN (igual que cancel_order). Si la
--     cuenta tiene pagos COMPLETED se RECHAZA (lo seguro: anular antes con
--     void_payment, que valida la caja). Si no quedan pedidos vivos en la
--     sesión: anula la cuenta vacía, cierra la sesión y libera la mesa.
--   * transfer_order: solo a mesa TABLE activa, misma zona (spec §5; ambas
--     sin zona también vale), mismo restaurante y disponible. Mueve sesión,
--     pedidos, cuenta (y con ella los pagos) y llamadas abiertas.
--
-- Rollback: DROP FUNCTION de las 5 RPC + DROP INDEX tickets_client_request_
-- id_uq + ALTER TABLE tickets DROP COLUMN client_request_id (sin pérdida de
-- datos de negocio; las comandas ya creadas conservan su número).
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.tickets add column client_request_id uuid;
create unique index tickets_client_request_id_uq
  on public.tickets (client_request_id) where client_request_id is not null;

-- ============================ open_table ==================================
create or replace function public.open_table(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table   public.tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_had     boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_table from public.tables where id = p_table_id for update;
  if not found or v_table.kind <> 'TABLE' or v_table.status = 'INACTIVE' then
    raise exception 'Mesa no encontrada o inactiva';
  end if;

  if not (
    public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para abrir mesas';
  end if;

  -- Una sesión activa sin pedidos (mesa ya abierta) es idempotente.
  select exists (
    select 1 from public.table_sessions s
    where s.table_id = v_table.id and s.status = 'ACTIVE'
      and not exists (select 1 from public.orders o
                      where o.table_session_id = s.id and o.status not in ('REJECTED', 'CANCELLED'))
  ) into v_had;

  if not v_had and public.table_effective_status(v_table.id) <> 'AVAILABLE' then
    raise exception 'La mesa no está disponible';
  end if;

  v_session := public.find_or_create_active_table_session(v_table.id, v_table.restaurant_id);

  if not v_had then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_table.restaurant_id, auth.uid(), 'CREATE', 'TABLE_SESSION', v_session.id,
            jsonb_build_object('action', 'OPEN_TABLE', 'table_id', v_table.id));
  end if;

  return jsonb_build_object('session_id', v_session.id, 'table_id', v_table.id, 'already_open', v_had);
end;
$$;

-- ============================= add_ticket =================================
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

  insert into public.order_items (order_id, ticket_id, product_id, product_name, quantity, unit_price, subtotal, notes)
  select v_order.id, v_ticket.id, (l ->> 'product_id')::uuid, l ->> 'product_name',
         (l ->> 'quantity')::integer, (l ->> 'unit_price')::numeric, (l ->> 'subtotal')::numeric, l ->> 'notes'
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

-- =========================== cancel_order_item ============================
create or replace function public.cancel_order_item(p_order_item_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_order_id uuid;
  v_table_id uuid;
  v_table   public.tables%rowtype;
  v_order   public.orders%rowtype;
  v_item    public.order_items%rowtype;
  v_bill_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select oi.order_id, o.table_id into v_order_id, v_table_id
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id;
  if v_order_id is null then
    raise exception 'Producto no encontrado';
  end if;

  select * into v_table from public.tables where id = v_table_id for update;
  select * into v_order from public.orders where id = v_order_id for update;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para cancelar productos';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Escribe el motivo de la cancelación (mínimo 3 caracteres)';
  end if;
  if length(v_reason) > 200 then
    raise exception 'El motivo admite hasta 200 caracteres';
  end if;

  select * into v_item from public.order_items where id = p_order_item_id for update;
  if v_item.cancelled then
    raise exception 'El producto ya está cancelado';
  end if;
  if v_order.cancelled or v_order.status in ('REJECTED', 'CANCELLED') then
    raise exception 'El pedido está cancelado';
  end if;

  select id into v_bill_id from public.bills
  where table_session_id = v_order.table_session_id and status in ('OPEN', 'PAID', 'CLOSED');
  if exists (select 1 from public.bills where id = v_bill_id and status in ('PAID', 'CLOSED')) then
    raise exception 'La cuenta ya fue cobrada: no se puede cancelar productos';
  end if;
  if exists (select 1 from public.bill_discounts
             where order_item_id = v_item.id and removed_at is null) then
    raise exception 'El producto tiene un descuento activo: quítalo primero';
  end if;
  if not exists (select 1 from public.order_items
                 where order_id = v_order.id and not cancelled and id <> v_item.id) then
    raise exception 'Es el último producto del pedido: cancela el pedido completo';
  end if;

  update public.order_items set cancelled = true where id = v_item.id;
  update public.orders
  set subtotal = subtotal - v_item.subtotal, total = total - v_item.subtotal
  where id = v_order.id;

  if v_bill_id is not null then
    perform public.lock_bill(v_bill_id);
    perform public.recompute_bill(v_bill_id);  -- error si dejaría saldo negativo
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_order.restaurant_id, auth.uid(), 'UPDATE', 'ORDER_ITEM', v_item.id,
          jsonb_build_object('action', 'CANCEL_ORDER_ITEM', 'security_event', true,
            'order_id', v_order.id, 'ticket_id', v_item.ticket_id, 'product_name', v_item.product_name,
            'quantity', v_item.quantity, 'amount', v_item.subtotal, 'reason', v_reason));

  return jsonb_build_object('order_id', v_order.id, 'order_item_id', v_item.id,
    'removed_amount', v_item.subtotal);
end;
$$;

-- ======================= cancel_order_with_reason =========================
create or replace function public.cancel_order_with_reason(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_table_id uuid;
  v_table    public.tables%rowtype;
  v_order    public.orders%rowtype;
  v_bill     public.bills%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select table_id into v_table_id from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  select * into v_table from public.tables where id = v_table_id for update;
  select * into v_order from public.orders where id = p_order_id for update;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado para cancelar pedidos';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Escribe el motivo de la cancelación (mínimo 3 caracteres)';
  end if;
  if length(v_reason) > 200 then
    raise exception 'El motivo admite hasta 200 caracteres';
  end if;

  if v_order.cancelled or v_order.status in ('REJECTED', 'CANCELLED') then
    raise exception 'El pedido ya está cancelado';
  end if;

  select * into v_bill from public.bills
  where table_session_id = v_order.table_session_id and status <> 'VOID';
  if found then
    if v_bill.status = 'CLOSED' then
      raise exception 'La cuenta ya fue cobrada y cerrada: no se puede cancelar';
    end if;
    -- Lo más seguro: con pagos no se cancela; se anulan antes (void_payment
    -- valida la caja abierta) y recién entonces se cancela el pedido.
    if exists (select 1 from public.payments where bill_id = v_bill.id and status = 'COMPLETED') then
      raise exception 'La cuenta tiene pagos: anúlalos primero';
    end if;
  end if;

  update public.order_items set cancelled = true where order_id = v_order.id and not cancelled;
  update public.tickets
  set kitchen_status = 'completed', completed_at = now(), is_new = false
  where order_id = v_order.id and kitchen_status = 'pending';

  update public.orders
  set status = 'CANCELLED', cancelled = true, cancel_reason = v_reason, cancelled_by = auth.uid()
  where id = v_order.id;  -- trigger recalcula la cuenta viva

  -- Sin pedidos vivos en la sesión: cuenta vacía anulada, sesión cerrada, mesa libre.
  if v_order.table_session_id is not null
     and not exists (select 1 from public.orders o
                     where o.table_session_id = v_order.table_session_id
                       and o.id <> v_order.id and o.status not in ('REJECTED', 'CANCELLED')) then
    if v_bill.id is not null then
      update public.bills
      set status = 'VOID', voided_by = auth.uid(), voided_at = now(),
          void_reason = 'Pedido cancelado: ' || v_reason
      where id = v_bill.id and status = 'OPEN';
    end if;
    update public.table_sessions set status = 'CLOSED', closed_at = now()
    where id = v_order.table_session_id and status = 'ACTIVE';
    update public.waiter_calls set status = 'ATTENDED', handled_by = auth.uid(), handled_at = now()
    where table_id = v_order.table_id and status in ('PENDING', 'ACCEPTED');
    perform public.refresh_table_status(v_order.table_id);
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_order.restaurant_id, auth.uid(), 'UPDATE', 'ORDER', v_order.id,
          jsonb_build_object('action', 'CANCEL_ORDER', 'security_event', true,
            'folio', v_order.folio, 'total', v_order.total, 'reason', v_reason));
end;
$$;

-- ============================ transfer_order ==============================
create or replace function public.transfer_order(p_order_id uuid, p_target_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_src_id  uuid;
  v_order   public.orders%rowtype;
  v_src     public.tables%rowtype;
  v_dst     public.tables%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select table_id into v_src_id from public.orders where id = p_order_id;
  if v_src_id is null then
    raise exception 'Pedido no encontrado';
  end if;
  if v_src_id = p_target_table_id then
    raise exception 'La mesa destino es la misma que la de origen';
  end if;

  -- Ambas mesas en orden de id: evita interbloqueo entre transferencias cruzadas.
  perform 1 from public.tables where id in (v_src_id, p_target_table_id) order by id for update;
  select * into v_src from public.tables where id = v_src_id;
  select * into v_dst from public.tables where id = p_target_table_id;
  select * into v_order from public.orders where id = p_order_id for update;

  if v_dst.id is null or v_dst.restaurant_id <> v_src.restaurant_id then
    raise exception 'Mesa destino no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_src.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_src.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_src.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para transferir pedidos';
  end if;

  if v_order.cancelled or v_order.status in ('REJECTED', 'CANCELLED') or v_order.table_session_id is null
     or not exists (select 1 from public.table_sessions s
                    where s.id = v_order.table_session_id and s.status = 'ACTIVE') then
    raise exception 'El pedido no está activo en la mesa';
  end if;
  if v_src.kind <> 'TABLE' or v_dst.kind <> 'TABLE' or v_dst.status = 'INACTIVE' then
    raise exception 'Mesa destino no válida';
  end if;
  if v_dst.zone_id is distinct from v_src.zone_id then
    raise exception 'Solo se puede transferir a una mesa de la misma zona';
  end if;
  if exists (select 1 from public.bills b
             where b.table_session_id = v_order.table_session_id and b.status in ('PAID', 'CLOSED')) then
    raise exception 'La cuenta ya fue cobrada: no se puede transferir';
  end if;

  -- Destino: una sesión abierta VACÍA (mesa recién abierta) se descarta; con
  -- consumo o saldo la mesa no está disponible.
  if exists (select 1 from public.table_sessions s
             where s.table_id = v_dst.id and s.status = 'ACTIVE'
               and exists (select 1 from public.orders o
                           where o.table_session_id = s.id and o.status not in ('REJECTED', 'CANCELLED'))) then
    raise exception 'La mesa destino no está disponible';
  end if;
  update public.table_sessions set status = 'CLOSED', closed_at = now()
  where table_id = v_dst.id and status = 'ACTIVE' and id <> v_order.table_session_id;
  if public.table_effective_status(v_dst.id) <> 'AVAILABLE' then
    raise exception 'La mesa destino no está disponible';
  end if;

  -- Se mueve todo lo de la sesión: pedidos (con sus comandas, folio y notas),
  -- cuenta (y con ella los pagos) y llamadas abiertas.
  update public.table_sessions set table_id = v_dst.id, last_activity_at = now()
  where id = v_order.table_session_id;
  update public.orders set table_id = v_dst.id where table_session_id = v_order.table_session_id;
  update public.bills set table_id = v_dst.id where table_session_id = v_order.table_session_id;
  update public.waiter_calls set table_id = v_dst.id
  where table_id = v_src.id and status in ('PENDING', 'ACCEPTED');

  perform public.refresh_table_status(v_src.id);
  perform public.refresh_table_status(v_dst.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_src.restaurant_id, auth.uid(), 'UPDATE', 'ORDER', v_order.id,
          jsonb_build_object('action', 'TRANSFER_ORDER', 'from_table_id', v_src.id,
            'to_table_id', v_dst.id, 'folio', v_order.folio));

  return jsonb_build_object('order_id', v_order.id, 'from_table_id', v_src.id, 'to_table_id', v_dst.id);
end;
$$;

revoke all on function public.open_table(uuid) from public, anon;
revoke all on function public.add_ticket(uuid, jsonb, uuid, uuid) from public, anon;
revoke all on function public.cancel_order_item(uuid, text) from public, anon;
revoke all on function public.cancel_order_with_reason(uuid, text) from public, anon;
revoke all on function public.transfer_order(uuid, uuid) from public, anon;
grant execute on function public.open_table(uuid) to authenticated, service_role;
grant execute on function public.add_ticket(uuid, jsonb, uuid, uuid) to authenticated, service_role;
grant execute on function public.cancel_order_item(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_order_with_reason(uuid, text) to authenticated, service_role;
grant execute on function public.transfer_order(uuid, uuid) to authenticated, service_role;
