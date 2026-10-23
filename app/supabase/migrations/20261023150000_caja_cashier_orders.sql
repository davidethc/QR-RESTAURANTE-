-- Caja: a CASHIER (roles[] contains CASHIER with an assigned register, same rule as
-- can_handle_cash) can list and read open bills to charge them, and take orders
-- from Caja (counter and table). Only widens the role checks; no other logic changes.

CREATE OR REPLACE FUNCTION public.add_ticket(p_order_id uuid, p_items jsonb, p_request_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    or public.can_handle_cash(v_table.restaurant_id)
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
    if exists (select 1 from public.waiter_calls w
               where w.table_id = v_table.id and w.type = 'BILL' and w.status in ('PENDING', 'ACCEPTED')) then
      raise exception 'La mesa pidió la cuenta. Reábrela para agregar productos.';
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

  perform public.insert_order_lines(v_order.id, v_ticket.id, v_built -> 'lines');

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
$function$;

CREATE OR REPLACE FUNCTION public.create_counter_order(p_service_type text, p_items jsonb, p_client_request_id uuid, p_restaurant_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_delivery_provider text DEFAULT NULL::text, p_external_order_id text DEFAULT NULL::text, p_delivery_address jsonb DEFAULT NULL::jsonb, p_shipping_cost numeric DEFAULT NULL::numeric, p_general_comment text DEFAULT NULL::text, p_preferred_payment_method text DEFAULT NULL::text, p_pays_with_amount numeric DEFAULT NULL::numeric, p_pay_later boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_restaurant_id uuid;
  v_count    integer;
  v_billing  boolean;
  v_table    public.tables%rowtype;
  v_existing public.table_sessions%rowtype;
  v_n        jsonb;
  v_comment  text;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_shipping numeric(10,2);
  v_day      date;
  v_start    timestamptz;
  v_end      timestamptz;
  v_number   integer;
  v_session  public.table_sessions%rowtype;
  v_order    public.orders%rowtype;
  v_bill     public.bills%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_client_request_id is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  if p_restaurant_id is null then
    select count(distinct rm.restaurant_id), min(rm.restaurant_id::text)::uuid
    into v_count, v_restaurant_id
    from public.restaurant_members rm
    where rm.user_id = auth.uid() and rm.status = 'ACTIVE'
      and (rm.role in ('OWNER', 'ADMIN', 'WAITER')
           or (rm.roles @> array['CASHIER']::text[] and cardinality(rm.cash_register_ids) > 0));
    if v_count <> 1 then
      raise exception 'Indica el restaurante del pedido';
    end if;
  else
    v_restaurant_id := p_restaurant_id;
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_restaurant_id, 'WAITER')
    or public.can_handle_cash(v_restaurant_id)
  ) then
    raise exception 'No autorizado para tomar pedidos de mostrador';
  end if;

  select billing_enabled into v_billing from public.restaurants where id = v_restaurant_id;
  if not coalesce(v_billing, false) and not coalesce(p_pay_later, true) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  -- Validación de campos (barata) antes de tomar candados.
  v_n := public.m06_normalize_counter_fields(
    p_service_type, p_delivery_provider, p_external_order_id, p_customer_name,
    p_customer_phone, p_delivery_address, p_shipping_cost,
    p_preferred_payment_method, p_pays_with_amount);

  v_comment := nullif(btrim(coalesce(p_general_comment, '')), '');
  if length(v_comment) > 300 then
    raise exception 'El comentario admite hasta 300 caracteres' using hint = 'field=general_comment';
  end if;

  v_table := public.lock_counter_table(v_restaurant_id);

  select * into v_existing from public.table_sessions
  where restaurant_id = v_restaurant_id and client_request_id = p_client_request_id;
  if found then
    select * into v_order from public.orders
    where table_session_id = v_existing.id order by created_at, order_number limit 1;
    if v_order.id is null or v_order.service_type not in ('dine_in_no_table', 'takeaway', 'delivery') then
      raise exception 'La clave de idempotencia ya se usó en otra venta';
    end if;
    select * into v_bill from public.bills where table_session_id = v_existing.id and status <> 'VOID' limit 1;
    return jsonb_build_object(
      'order_id', v_order.id, 'folio', v_order.folio, 'short_code', v_order.short_code,
      'table_session_id', v_existing.id, 'counter_number', v_existing.counter_number,
      'bill_id', v_bill.id, 'bill_number', v_bill.bill_number, 'total', v_order.total,
      'pay_later', coalesce(p_pay_later, true), 'replayed', true);
  end if;

  -- Precios y personalizaciones del servidor (M01/M04).
  v_built := public.build_order_lines(v_restaurant_id, p_items);
  v_subtotal := (v_built ->> 'subtotal')::numeric;
  v_shipping := (v_n ->> 'shipping_cost')::numeric;

  v_day := public.business_today(v_restaurant_id);
  select b.start_at, b.end_at into v_start, v_end
  from public.business_day_bounds(v_restaurant_id, v_day, v_day) b;

  select coalesce(max(ts.counter_number), 0) + 1 into v_number
  from public.table_sessions ts
  where ts.table_id = v_table.id and ts.table_kind = 'COUNTER'
    and ts.started_at >= v_start and ts.started_at < v_end;

  insert into public.table_sessions (
    restaurant_id, table_id, table_kind, counter_number, customer_label, client_request_id
  )
  values (
    v_restaurant_id, v_table.id, 'COUNTER', v_number,
    left(v_n ->> 'customer_name', 40), p_client_request_id
  )
  returning * into v_session;

  insert into public.orders (
    restaurant_id, table_id, table_session_id, status, service_type, subtotal, total,
    accepted_by, accepted_at, preparing_at,
    delivery_provider, external_order_id, customer_name, customer_phone, delivery_address,
    general_comment, shipping_cost, preferred_payment_method, pays_with_amount
  )
  values (
    v_restaurant_id, v_table.id, v_session.id, 'PREPARING', p_service_type,
    v_subtotal, v_subtotal + coalesce(v_shipping, 0),
    auth.uid(), now(), now(),
    v_n ->> 'delivery_provider', v_n ->> 'external_order_id', v_n ->> 'customer_name',
    v_n ->> 'customer_phone', nullif(v_n -> 'delivery_address', 'null'::jsonb),
    v_comment, v_shipping, v_n ->> 'preferred_payment_method',
    (v_n ->> 'pays_with_amount')::numeric
  )
  returning * into v_order;

  perform public.insert_order_lines(v_order.id, null, v_built -> 'lines');

  if coalesce(v_billing, false) then
    insert into public.bills (restaurant_id, table_id, table_session_id, opened_by)
    values (v_restaurant_id, v_table.id, v_session.id, auth.uid())
    returning * into v_bill;
    v_bill := public.recompute_bill(v_bill.id);
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values
    (v_restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order.id,
     jsonb_build_object('counter_number', v_number, 'service_type', p_service_type)),
    (v_restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order.id, null);
  if v_bill.id is not null then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_restaurant_id, auth.uid(), 'OPEN_BILL', 'BILL', v_bill.id,
      jsonb_build_object('bill_number', v_bill.bill_number, 'table_session_id', v_session.id,
        'counter_number', v_number, 'pay_later', coalesce(p_pay_later, true)));
  end if;

  return jsonb_build_object(
    'order_id', v_order.id, 'folio', v_order.folio, 'short_code', v_order.short_code,
    'table_session_id', v_session.id, 'counter_number', v_number,
    'bill_id', v_bill.id, 'bill_number', v_bill.bill_number, 'total', v_order.total,
    'pay_later', coalesce(p_pay_later, true), 'replayed', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_bill(p_bill_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_restaurant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select restaurant_id into v_restaurant_id from public.bills where id = p_bill_id;

  if v_restaurant_id is null then
    raise exception 'Cuenta no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_restaurant_id, 'WAITER')
    or public.can_handle_cash(v_restaurant_id)
  ) then
    raise exception 'No autorizado';
  end if;

  return public.bill_json(p_bill_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_open_bills(p_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(p_restaurant_id, 'WAITER')
    or public.can_handle_cash(p_restaurant_id)
  ) then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select jsonb_agg(e.item order by e.opened_at)
    from (
      select
        b.opened_at,
        jsonb_build_object(
          'id',               b.id,
          'bill_number',      b.bill_number,
          'table_id',         b.table_id,
          'table_number',     t.number,
          'table_name',       t.name,
          -- C3
          'table_kind',       t.kind,
          'counter_number',   ts.counter_number,
          'customer_label',   ts.customer_label,
          'place_label',      public.session_place_label(b.table_session_id),  -- S3-F0
          'table_session_id', b.table_session_id,
          'session_status',   ts.status,
          'status',           b.status,
          'total',            b.total,
          'paid_total',       b.paid_total,
          'balance',          b.balance,
          'split_mode',       b.split_mode,
          'split_parts',      b.split_parts,
          'opened_at',        b.opened_at,
          'active_orders', (
            select count(*) from public.orders o
            where o.table_session_id = b.table_session_id
              and o.status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
          ),
          'has_bill',         true
        ) as item
      from public.bills b
      join public.tables t on t.id = b.table_id
      join public.table_sessions ts on ts.id = b.table_session_id
      where b.restaurant_id = p_restaurant_id
        and b.status in ('OPEN', 'PAID')

      union all

      select
        ts.started_at,
        jsonb_build_object(
          'id',               null,
          'bill_number',      null,
          'table_id',         ts.table_id,
          'table_number',     t.number,
          'table_name',       t.name,
          'table_kind',       t.kind,
          'counter_number',   ts.counter_number,
          'customer_label',   ts.customer_label,
          'place_label',      public.place_label(t.kind, t.number, ts.counter_number, ts.customer_label),
          'table_session_id', ts.id,
          'session_status',   ts.status,
          'status',           'OPEN',
          'total',            s.total,
          'paid_total',       0,
          'balance',          s.total,
          'split_mode',       'NONE',
          'split_parts',      1,
          'opened_at',        ts.started_at,
          'active_orders',    s.active_orders,
          'has_bill',         false
        )
      from public.table_sessions ts
      join public.tables t on t.id = ts.table_id
      cross join lateral (
        select
          round(coalesce(sum(o.total) filter (where o.status not in ('REJECTED', 'CANCELLED')), 0), 2) as total,
          count(*) filter (where o.status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')) as active_orders
        from public.orders o
        where o.table_session_id = ts.id
      ) s
      where ts.restaurant_id = p_restaurant_id
        and ts.status = 'ACTIVE'
        and ts.table_kind = 'TABLE'
        and not exists (
          select 1 from public.bills b
          where b.table_session_id = ts.id
            and b.status <> 'VOID'
        )
        and public.table_session_has_unpaid_consumption(ts.id)
    ) e
  ), '[]'::jsonb);
end;
$function$;
