-- ---------------------------------------------------------------------------
-- M06 · POS de mostrador y tipos de pedido · EXPAND.
-- Depende de 20261022040000 (build_order_lines / insert_order_lines) y de
-- create_counter_sale (lock_counter_table, business_today).
--
-- a) orders: columnas nuevas, todas opcionales (M06-T01):
--      delivery_provider (own|uber_eats|rappi|didi_food), external_order_id,
--      customer_name, customer_phone, delivery_address (jsonb con llaves
--      permitidas), general_comment, shipping_cost (null = "Por cotizar"),
--      preferred_payment_method (cash|card|transfer), pays_with_amount.
--    Decisión: preferred_payment_method / pays_with_amount viven en orders
--    (así lo pide el encargo de S2); M07 §3 los proponía en bills. M12 puede
--    copiarlos a bills cuando exista el menú digital de domicilio.
-- b) create_counter_order: pedido de mostrador con tipo explícito
--    (dine_in_no_table | takeaway | delivery). Usa build_order_lines +
--    insert_order_lines (variantes, personalizaciones, precio del servidor).
--    Cuenta abierta (pago pendiente) cuando billing_enabled; p_pay_later=false
--    exige cobro habilitado (el cobro en sí es record_payment/record_payments).
--    Idempotente por p_client_request_id (table_sessions.client_request_id,
--    el mismo espacio que create_counter_sale).
-- c) update_counter_order: parche jsonb de datos editables (no productos).
--    Subir el envío de una cuenta con pagos exige p_confirm_total_increase.
--
-- Totales: orders.total = subtotal + coalesce(shipping_cost, 0). Las RPC
-- existentes suman/restan deltas sobre total, así que el envío se conserva.
--
-- Errores de campo: RAISE con HINT 'field=<campo>' para que la acción del
-- servidor devuelva el campo específico.
--
-- PII (teléfono, dirección) NUNCA se escribe en audit_logs.metadata.
-- Nota de RLS: orders ya es legible por todo el personal del restaurante
-- (orders_select_staff); teléfono y dirección quedan visibles para cocina y
-- meseros. Revisión de seguridad: decidir si se limita (vista o RPC) antes de
-- exponerlos en la UI de cocina.
--
-- Rollback: drop function create_counter_order / update_counter_order /
-- m06_normalize_counter_fields; las columnas nuevas son inofensivas.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.orders
  add column if not exists delivery_provider text,
  add column if not exists external_order_id text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists delivery_address jsonb,
  add column if not exists general_comment text,
  add column if not exists shipping_cost numeric(10,2),
  add column if not exists preferred_payment_method text,
  add column if not exists pays_with_amount numeric(10,2);

alter table public.orders
  drop constraint if exists orders_delivery_provider_valid,
  drop constraint if exists orders_external_order_id_len,
  drop constraint if exists orders_customer_name_len,
  drop constraint if exists orders_customer_phone_len,
  drop constraint if exists orders_delivery_address_object,
  drop constraint if exists orders_general_comment_len,
  drop constraint if exists orders_shipping_cost_valid,
  drop constraint if exists orders_preferred_payment_method_valid,
  drop constraint if exists orders_pays_with_amount_valid;

alter table public.orders
  add constraint orders_delivery_provider_valid
    check (delivery_provider is null or delivery_provider in ('own', 'uber_eats', 'rappi', 'didi_food')),
  add constraint orders_external_order_id_len
    check (external_order_id is null or length(external_order_id) between 1 and 60),
  add constraint orders_customer_name_len
    check (customer_name is null or length(customer_name) between 1 and 80),
  add constraint orders_customer_phone_len
    check (customer_phone is null or length(customer_phone) between 7 and 20),
  add constraint orders_delivery_address_object
    check (delivery_address is null or jsonb_typeof(delivery_address) = 'object'),
  add constraint orders_general_comment_len
    check (general_comment is null or length(general_comment) <= 300),
  add constraint orders_shipping_cost_valid
    check (shipping_cost is null or (shipping_cost >= 0 and shipping_cost <= 99999.99)),
  add constraint orders_preferred_payment_method_valid
    check (preferred_payment_method is null or preferred_payment_method in ('cash', 'card', 'transfer')),
  add constraint orders_pays_with_amount_valid
    check (pays_with_amount is null or (pays_with_amount >= 0 and pays_with_amount <= 99999.99));

comment on column public.orders.delivery_provider is 'M06: own | uber_eats | rappi | didi_food (solo service_type = delivery).';
comment on column public.orders.shipping_cost is 'M06: costo de envío; null = "Por cotizar". Ya está incluido en orders.total cuando no es null.';
comment on column public.orders.delivery_address is 'M06: jsonb con colonia, calle, numero, entre_calles, referencias, lat, lng (validado en create/update_counter_order). Dato personal.';
comment on column public.orders.customer_phone is 'M06: teléfono con código de país. Dato personal.';

-- ======================= validación común (interna) ========================
create or replace function public.m06_normalize_counter_fields(
  p_service_type text,
  p_provider text,
  p_external_id text,
  p_name text,
  p_phone text,
  p_address jsonb,
  p_shipping numeric,
  p_pref_method text,
  p_pays_with numeric
)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone    text := nullif(btrim(coalesce(p_phone, '')), '');
  v_ext      text := nullif(btrim(coalesce(p_external_id, '')), '');
  v_provider text := nullif(btrim(coalesce(p_provider, '')), '');
  v_addr     jsonb := null;
  v_key      text;
  v_val      jsonb;
  v_clean    jsonb := '{}'::jsonb;
  v_shipping numeric(10,2) := p_shipping;
  v_pref     text := nullif(btrim(coalesce(p_pref_method, '')), '');
  v_pays     numeric(10,2) := p_pays_with;
begin
  if p_service_type is null or p_service_type not in ('dine_in_no_table', 'takeaway', 'delivery') then
    raise exception 'Elige el tipo de pedido' using hint = 'field=service_type';
  end if;

  if v_name is not null and length(v_name) > 80 then
    raise exception 'El nombre admite hasta 80 caracteres' using hint = 'field=customer_name';
  end if;

  if v_pref is not null and v_pref not in ('cash', 'card', 'transfer') then
    raise exception 'Método de pago preferido inválido' using hint = 'field=preferred_payment_method';
  end if;
  if v_pays is not null then
    if v_pref is distinct from 'cash' then
      raise exception '"Pagará con" solo aplica al efectivo' using hint = 'field=pays_with_amount';
    end if;
    if v_pays < 0 or v_pays > 99999.99 then
      raise exception 'Monto "pagará con" inválido' using hint = 'field=pays_with_amount';
    end if;
  end if;

  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ()\-]{5,18}[0-9]$' then
    raise exception 'El teléfono no es válido' using hint = 'field=customer_phone';
  end if;

  if p_service_type <> 'delivery' then
    -- Tipos sin entrega: solo nombre opcional; lo demás no aplica.
    return jsonb_build_object(
      'customer_name', v_name, 'customer_phone', v_phone, 'delivery_provider', null,
      'external_order_id', null, 'delivery_address', null, 'shipping_cost', null,
      'preferred_payment_method', v_pref, 'pays_with_amount', v_pays);
  end if;

  if v_provider is null or v_provider not in ('own', 'uber_eats', 'rappi', 'didi_food') then
    raise exception 'Elige el servicio de entrega' using hint = 'field=delivery_provider';
  end if;

  if v_provider <> 'own' then
    if v_ext is null then
      raise exception 'Escribe el ID del pedido de la plataforma' using hint = 'field=external_order_id';
    end if;
    if length(v_ext) > 60 then
      raise exception 'El ID de la plataforma admite hasta 60 caracteres' using hint = 'field=external_order_id';
    end if;
    return jsonb_build_object(
      'customer_name', v_name, 'customer_phone', v_phone, 'delivery_provider', v_provider,
      'external_order_id', v_ext, 'delivery_address', null, 'shipping_cost', null,
      'preferred_payment_method', v_pref, 'pays_with_amount', v_pays);
  end if;

  -- Domicilio propio: datos completos.
  if v_name is null then
    raise exception 'Escribe el nombre del cliente' using hint = 'field=customer_name';
  end if;
  if v_phone is null then
    raise exception 'Escribe el teléfono del cliente' using hint = 'field=customer_phone';
  end if;

  if p_address is null or jsonb_typeof(p_address) <> 'object' then
    raise exception 'Escribe la dirección de entrega' using hint = 'field=delivery_address';
  end if;
  for v_key, v_val in select * from jsonb_each(p_address) loop
    if v_key in ('lat', 'lng') then
      if jsonb_typeof(v_val) not in ('number', 'null') then
        raise exception 'Ubicación inválida' using hint = 'field=delivery_address';
      end if;
      if jsonb_typeof(v_val) = 'number' then
        v_clean := v_clean || jsonb_build_object(v_key, v_val);
      end if;
    elsif v_key in ('colonia', 'calle', 'numero', 'entre_calles', 'referencias') then
      if jsonb_typeof(v_val) not in ('string', 'null') then
        raise exception 'Dirección inválida' using hint = 'field=delivery_address';
      end if;
      if jsonb_typeof(v_val) = 'string' then
        if length(btrim(v_val #>> '{}')) > 200 then
          raise exception 'Cada dato de la dirección admite hasta 200 caracteres' using hint = 'field=delivery_address';
        end if;
        if btrim(v_val #>> '{}') <> '' then
          v_clean := v_clean || jsonb_build_object(v_key, btrim(v_val #>> '{}'));
        end if;
      end if;
    else
      raise exception 'Dato de dirección no permitido: %', v_key using hint = 'field=delivery_address';
    end if;
  end loop;
  foreach v_key in array array['calle', 'numero', 'colonia'] loop
    if not (v_clean ? v_key) then
      raise exception 'Falta % en la dirección', v_key using hint = 'field=delivery_address.' || v_key;
    end if;
  end loop;
  v_addr := v_clean;

  if v_shipping is not null and (v_shipping < 0 or v_shipping > 99999.99) then
    raise exception 'El costo de envío no es válido' using hint = 'field=shipping_cost';
  end if;

  return jsonb_build_object(
    'customer_name', v_name, 'customer_phone', v_phone, 'delivery_provider', 'own',
    'external_order_id', null, 'delivery_address', v_addr, 'shipping_cost', v_shipping,
    'preferred_payment_method', v_pref, 'pays_with_amount', v_pays);
end;
$$;

revoke all on function public.m06_normalize_counter_fields(text, text, text, text, text, jsonb, numeric, text, numeric) from public, anon, authenticated;

-- ======================= create_counter_order ==============================
create or replace function public.create_counter_order(
  p_service_type text,
  p_items jsonb,
  p_client_request_id uuid,
  p_restaurant_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_delivery_provider text default null,
  p_external_order_id text default null,
  p_delivery_address jsonb default null,
  p_shipping_cost numeric default null,
  p_general_comment text default null,
  p_preferred_payment_method text default null,
  p_pays_with_amount numeric default null,
  p_pay_later boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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
      and rm.role in ('OWNER', 'ADMIN', 'WAITER');
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
$$;

revoke all on function public.create_counter_order(text, jsonb, uuid, uuid, text, text, text, text, jsonb, numeric, text, text, numeric, boolean) from public, anon;
grant execute on function public.create_counter_order(text, jsonb, uuid, uuid, text, text, text, text, jsonb, numeric, text, text, numeric, boolean) to authenticated, service_role;

-- ======================= update_counter_order ==============================
-- p_changes: llaves permitidas service_type, delivery_provider,
-- external_order_id, customer_name, customer_phone, delivery_address,
-- general_comment, shipping_cost, preferred_payment_method, pays_with_amount.
-- Llave presente con null = borrar. Los productos se editan por comanda (M04).
create or replace function public.update_counter_order(
  p_order_id uuid,
  p_changes jsonb,
  p_confirm_total_increase boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_restaurant_id uuid;
  v_o      public.orders%rowtype;
  v_kind   public.table_kind;
  v_bill   public.bills%rowtype;
  v_key    text;
  v_cur    jsonb;
  v_n      jsonb;
  v_service text;
  v_comment text;
  v_old_ship numeric(10,2);
  v_new_ship numeric(10,2);
  v_delta  numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'No hay cambios que guardar';
  end if;

  select restaurant_id into v_restaurant_id from public.orders where id = p_order_id;
  if v_restaurant_id is null or not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_restaurant_id, 'WAITER')
  ) then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('service_type', 'delivery_provider', 'external_order_id', 'customer_name',
        'customer_phone', 'delivery_address', 'general_comment', 'shipping_cost',
        'preferred_payment_method', 'pays_with_amount') then
      raise exception 'Campo no editable: %', v_key using hint = 'field=' || v_key;
    end if;
  end loop;

  select * into v_o from public.orders where id = p_order_id for update;

  select t.kind into v_kind from public.tables t where t.id = v_o.table_id;
  if v_kind is distinct from 'COUNTER' or v_o.service_type not in ('dine_in_no_table', 'takeaway', 'delivery') then
    raise exception 'Solo se editan aquí los pedidos de mostrador';
  end if;
  if v_o.cancelled or v_o.status in ('REJECTED', 'CANCELLED') then
    raise exception 'El pedido está cancelado';
  end if;

  v_cur := jsonb_build_object(
    'service_type', v_o.service_type, 'delivery_provider', v_o.delivery_provider,
    'external_order_id', v_o.external_order_id, 'customer_name', v_o.customer_name,
    'customer_phone', v_o.customer_phone, 'delivery_address', v_o.delivery_address,
    'shipping_cost', v_o.shipping_cost, 'preferred_payment_method', v_o.preferred_payment_method,
    'pays_with_amount', v_o.pays_with_amount, 'general_comment', v_o.general_comment);
  v_cur := v_cur || p_changes;  -- el parche pisa (null borra)

  v_service := v_cur ->> 'service_type';
  v_n := public.m06_normalize_counter_fields(
    v_service, v_cur ->> 'delivery_provider', v_cur ->> 'external_order_id',
    v_cur ->> 'customer_name', v_cur ->> 'customer_phone', v_cur -> 'delivery_address',
    (v_cur ->> 'shipping_cost')::numeric, v_cur ->> 'preferred_payment_method',
    (v_cur ->> 'pays_with_amount')::numeric);

  v_comment := nullif(btrim(coalesce(v_cur ->> 'general_comment', '')), '');
  if length(v_comment) > 300 then
    raise exception 'El comentario admite hasta 300 caracteres' using hint = 'field=general_comment';
  end if;

  v_old_ship := v_o.shipping_cost;
  v_new_ship := (v_n ->> 'shipping_cost')::numeric;
  v_delta := coalesce(v_new_ship, 0) - coalesce(v_old_ship, 0);

  if v_delta <> 0 and v_o.table_session_id is not null then
    -- Pedido -> mesa -> cuenta (mismo orden que mark_order_* y el trigger).
    select b.* into v_bill from public.bills b
    where b.table_session_id = v_o.table_session_id and b.status <> 'VOID'
    order by b.created_at desc limit 1;
    if v_bill.id is not null then
      v_bill := public.lock_bill(v_bill.id);
      if v_bill.status = 'CLOSED' then
        raise exception 'La cuenta ya está cerrada: no se puede cambiar el envío' using hint = 'field=shipping_cost';
      end if;
      if v_delta > 0 and v_bill.paid_total > 0 and not coalesce(p_confirm_total_increase, false) then
        raise exception 'CONFIRM_REQUIRED: el pedido ya tiene pagos y quedarían % por cobrar', v_bill.balance + v_delta
          using hint = 'confirm=p_confirm_total_increase';
      end if;
    end if;
  end if;

  update public.orders
  set service_type = v_service,
      delivery_provider = v_n ->> 'delivery_provider',
      external_order_id = v_n ->> 'external_order_id',
      customer_name = v_n ->> 'customer_name',
      customer_phone = v_n ->> 'customer_phone',
      delivery_address = nullif(v_n -> 'delivery_address', 'null'::jsonb),
      shipping_cost = v_new_ship,
      preferred_payment_method = v_n ->> 'preferred_payment_method',
      pays_with_amount = (v_n ->> 'pays_with_amount')::numeric,
      general_comment = v_comment,
      total = total + v_delta   -- dispara trg_orders_recompute_bill
  where id = p_order_id;

  if p_changes ? 'customer_name' or p_changes ? 'service_type' then
    update public.table_sessions
    set customer_label = left(v_n ->> 'customer_name', 40)
    where id = v_o.table_session_id;
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_restaurant_id, auth.uid(), 'UPDATE', 'ORDER', p_order_id,
    jsonb_build_object('action', 'UPDATE_COUNTER_ORDER',
      'fields', (select jsonb_agg(k order by k) from jsonb_object_keys(p_changes) k),
      'shipping_delta', v_delta));

  return jsonb_build_object('order_id', p_order_id, 'total', v_o.total + v_delta,
    'shipping_cost', v_new_ship, 'total_delta', v_delta);
end;
$$;

revoke all on function public.update_counter_order(uuid, jsonb, boolean) from public, anon;
grant execute on function public.update_counter_order(uuid, jsonb, boolean) to authenticated, service_role;
