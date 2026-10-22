-- ---------------------------------------------------------------------------
-- M11 · Cliente por QR de mesa · EXPAND.
-- Depende de 20261022040000 (create_customer_order), 20261022010000
-- (orders.status_review) y create_waiter_call de 20260910140933.
--
-- Decisión de producto: el pedido del cliente por QR lo APRUEBA el mesero
-- antes de pasar a cocina, configurable por restaurante:
--   restaurants.qr_orders_require_approval (default true = comportamiento de
--   hoy: el pedido nace PENDING y solo entra a cocina con
--   accept_and_prepare_order). Con false nace PREPARING directo (auditado como
--   automático). En ambos casos queda status_review = 'new' hasta que un
--   mesero lo revise (alimenta el contador "comandas sin revisar", M09).
--   El KDS solo muestra comandas de pedidos ACCEPTED/PREPARING, por eso un
--   pedido PENDING no aparece en cocina.
--
-- Qué agrega:
--   a) restaurants.qr_orders_require_approval, restaurants.qr_call_cooldown_seconds
--      (default 60) + set_qr_settings (OWNER/ADMIN). orders.source
--      ('digital_menu' | 'staff' | 'counter' | 'web'; null en históricos).
--   b) open_table_from_qr(qr_token, "Nombre para la mesa"): crea o une a la
--      sesión activa (reutiliza resolve_table_qr); guarda
--      table_sessions.customer_label solo si estaba vacío (el primero que abre
--      pone el nombre; quien se une lo ve). Anon.
--   c) get_customer_session(token) y get_customer_account(token) ("Ver
--      cuenta": rondas con hora y líneas + total; solo la sesión del token). Anon.
--   d) create_waiter_call (misma firma): cooldown por sesión y tipo
--      (qr_call_cooldown_seconds) con candado de la sesión contra doble toque,
--      y una cuenta ya solicitada no se vuelve a pedir.
--   e) create_customer_order (misma firma): respeta la aprobación, marca el
--      origen y, tras pedir la cuenta (llamada BILL viva), rechaza nuevos
--      productos. Una repetición con el mismo client_request_id sigue
--      devolviendo el pedido original.
--   f) approve_customer_order / reject_customer_order / mark_order_reviewed
--      (OWNER, ADMIN, WAITER): envuelven accept_and_prepare_order y
--      reject_order (misma auditoría) y marcan el pedido como revisado.
--
-- Anon: solo las RPC del cliente (b, c, d, e). Todo lo demás exige sesión.
--
-- Rollback: reaplicar create_customer_order (20261022040000) y
-- create_waiter_call (20260910140933); drop de las RPC nuevas; las columnas
-- son inofensivas.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ======================= a) configuración y origen ==========================
alter table public.restaurants
  add column if not exists qr_orders_require_approval boolean not null default true,
  add column if not exists qr_call_cooldown_seconds integer not null default 60;

alter table public.restaurants
  drop constraint if exists restaurants_qr_cooldown_valid;
alter table public.restaurants
  add constraint restaurants_qr_cooldown_valid check (qr_call_cooldown_seconds between 10 and 600);

alter table public.orders
  add column if not exists source text;
alter table public.orders
  drop constraint if exists orders_source_valid;
alter table public.orders
  add constraint orders_source_valid check (source is null or source in ('digital_menu', 'staff', 'counter', 'web'));

comment on column public.restaurants.qr_orders_require_approval is 'M11: el pedido del cliente por QR espera la aprobación del mesero antes de pasar a cocina (default true).';
comment on column public.restaurants.qr_call_cooldown_seconds is 'M11: segundos mínimos entre llamadas del mismo tipo (mesero/cuenta) de una misma sesión de mesa.';
comment on column public.orders.source is 'M11: origen del pedido. digital_menu = cliente por QR. Null en pedidos anteriores a M11.';

-- Las sesiones de mesa (TABLE) ahora pueden llevar el "Nombre para la mesa".
-- Se relaja el CHECK de M06 (solo prohibía customer_label fuera del mostrador);
-- client_request_id sigue siendo exclusivo del mostrador. Los 1-40 caracteres
-- de table_sessions_customer_label_check siguen vigentes.
alter table public.table_sessions
  drop constraint if exists table_sessions_counter_fields_check;
alter table public.table_sessions
  add constraint table_sessions_counter_fields_check check (
    table_kind = 'COUNTER' or client_request_id is null
  );

-- orders tiene SELECT por columna para authenticated en algunos entornos
-- (S3 fase 0): la columna nueva es inocua y la lee el personal.
grant select (source) on public.orders to authenticated;

create index if not exists orders_session_source_idx
  on public.orders (table_session_id) where source = 'digital_menu';
create index if not exists waiter_calls_session_type_created_idx
  on public.waiter_calls (table_session_id, type, created_at desc);

create or replace function public.set_qr_settings(
  p_restaurant_id uuid,
  p_require_approval boolean default null,
  p_call_cooldown_seconds integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_r public.restaurants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_restaurant_id is null or not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
  ) then
    raise exception 'Solo el dueño o un administrador configuran los pedidos por QR' using errcode = '42501';
  end if;

  update public.restaurants
  set qr_orders_require_approval = coalesce(p_require_approval, qr_orders_require_approval),
      qr_call_cooldown_seconds = coalesce(p_call_cooldown_seconds, qr_call_cooldown_seconds)
  where id = p_restaurant_id
  returning * into v_r;
  -- El CHECK rechaza un cooldown fuera de 10..600 s.

  if not found then
    raise exception 'Restaurante no encontrado';
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT', p_restaurant_id,
    jsonb_build_object('action', 'SET_QR_SETTINGS',
      'qr_orders_require_approval', v_r.qr_orders_require_approval,
      'qr_call_cooldown_seconds', v_r.qr_call_cooldown_seconds));

  return jsonb_build_object('qr_orders_require_approval', v_r.qr_orders_require_approval,
                            'qr_call_cooldown_seconds', v_r.qr_call_cooldown_seconds);
end;
$$;

revoke all on function public.set_qr_settings(uuid, boolean, integer) from public, anon;
grant execute on function public.set_qr_settings(uuid, boolean, integer) to authenticated, service_role;

-- ¿La sesión ya pidió la cuenta? (llamada BILL viva: nadie la canceló/rechazó)
create or replace function public.session_bill_requested(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.waiter_calls wc
    where wc.table_session_id = p_session_id
      and wc.type = 'BILL'
      and wc.status in ('PENDING', 'ACCEPTED', 'ATTENDED')
  );
$$;
revoke all on function public.session_bill_requested(uuid) from public, anon, authenticated;
grant execute on function public.session_bill_requested(uuid) to service_role;

-- ======================= b) abrir mesa con nombre ===========================
create or replace function public.open_table_from_qr(p_qr_token uuid, p_customer_label text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_label text := nullif(btrim(regexp_replace(coalesce(p_customer_label, ''), '\s+', ' ', 'g')), '');
  v_r record;
  v_set uuid;
  v_final text;
begin
  -- Se valida ANTES de crear la sesión: un nombre inválido no deja mesas abiertas.
  if v_label is null then
    raise exception 'Escribe un nombre para la mesa';
  end if;
  if char_length(v_label) not between 2 and 40 or v_label ~ '[[:cntrl:]]' then
    raise exception 'El nombre de la mesa debe tener entre 2 y 40 caracteres';
  end if;

  -- Crea o reutiliza la sesión ACTIVE de la mesa y deja la mesa bloqueada
  -- (for update) hasta el final de esta transacción.
  select * into v_r from public.resolve_table_qr(p_qr_token);

  update public.table_sessions
     set customer_label = v_label
   where session_token = v_r.session_token
     and customer_label is null
  returning id into v_set;

  select ts.customer_label into v_final
  from public.table_sessions ts where ts.session_token = v_r.session_token;

  return jsonb_build_object(
    'restaurant_id', v_r.restaurant_id,
    'restaurant_name', v_r.restaurant_name,
    'restaurant_slug', v_r.restaurant_slug,
    'table_id', v_r.table_id,
    'table_number', v_r.table_number,
    'session_token', v_r.session_token,
    'customer_label', v_final,
    'joined', v_set is null
  );
end;
$$;

revoke all on function public.open_table_from_qr(uuid, text) from public;
grant execute on function public.open_table_from_qr(uuid, text) to anon, authenticated, service_role;

-- ======================= c) estado y cuenta del cliente =====================
create or replace function public.get_customer_session(p_session_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_s public.table_sessions%rowtype;
  v_r public.restaurants%rowtype;
  v_cd integer;
begin
  select * into v_s from public.table_sessions where session_token = p_session_token;
  if not found then
    raise exception 'Sesión de mesa inválida';
  end if;
  select * into v_r from public.restaurants where id = v_s.restaurant_id;
  v_cd := v_r.qr_call_cooldown_seconds;

  return jsonb_build_object(
    'status', v_s.status,
    'customer_label', v_s.customer_label,
    'table_number', (select t.number from public.tables t where t.id = v_s.table_id),
    'restaurant_name', v_r.name,
    'bill_requested', public.session_bill_requested(v_s.id),
    'can_order', v_s.status = 'ACTIVE' and not public.session_bill_requested(v_s.id),
    'orders_require_approval', v_r.qr_orders_require_approval,
    'call_cooldown_seconds', v_cd,
    -- Segundos que faltan para poder volver a llamar, por tipo (0 = ya se puede).
    'waiter_cooldown_left', coalesce((
      select greatest(0, ceil(v_cd - extract(epoch from (now() - max(wc.created_at))))::int)
      from public.waiter_calls wc
      where wc.table_session_id = v_s.id and wc.type = 'WAITER'), 0),
    'bill_cooldown_left', coalesce((
      select greatest(0, ceil(v_cd - extract(epoch from (now() - max(wc.created_at))))::int)
      from public.waiter_calls wc
      where wc.table_session_id = v_s.id and wc.type = 'BILL'), 0)
  );
end;
$$;

revoke all on function public.get_customer_session(uuid) from public;
grant execute on function public.get_customer_session(uuid) to anon, authenticated, service_role;

-- "Ver cuenta": rondas con hora y líneas de producto, y el total a pagar.
-- Sin propina, método de pago ni división: el cobro lo hace el mesero.
create or replace function public.get_customer_account(p_session_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_s public.table_sessions%rowtype;
begin
  select * into v_s from public.table_sessions where session_token = p_session_token;
  if not found then
    raise exception 'Sesión de mesa inválida';
  end if;

  return jsonb_build_object(
    'customer_label', v_s.customer_label,
    'started_at', v_s.started_at,
    'bill_requested', public.session_bill_requested(v_s.id),
    'total', coalesce((
      select sum(o.total) from public.orders o
      where o.table_session_id = v_s.id and o.status not in ('REJECTED', 'CANCELLED') and not o.cancelled), 0),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_number', o.order_number,
        'folio', o.folio,
        'status', o.status,
        'created_at', o.created_at,
        'total', o.total,
        'awaiting_approval', o.status = 'PENDING',
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', oi.product_name, 'variant', oi.variant_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'subtotal', oi.subtotal,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'group', oo.option_name, 'name', oo.value_name,
                'price', oo.price_modifier, 'qty', oo.qty) order by oo.id)
              from public.order_item_options oo where oo.order_item_id = oi.id), '[]'::jsonb)
          ) order by oi.created_at, oi.id)
          from public.order_items oi
          where oi.order_id = o.id and not oi.cancelled), '[]'::jsonb)
      ) order by o.created_at)
      from public.orders o
      where o.table_session_id = v_s.id and o.status not in ('REJECTED', 'CANCELLED') and not o.cancelled), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_customer_account(uuid) from public;
grant execute on function public.get_customer_account(uuid) to anon, authenticated, service_role;

-- ======================= d) create_waiter_call con cooldown =================
create or replace function public.create_waiter_call(
  p_session_token uuid,
  p_type public.waiter_call_type
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session public.table_sessions%rowtype;
  v_existing_call uuid;
  v_call_id uuid;
  v_cooldown integer;
  v_last timestamptz;
  v_left integer;
begin
  -- Candados en el orden mesa -> sesión (el mismo de create_customer_order);
  -- dos toques simultáneos se serializan y el segundo ve el primero.
  perform 1
  from public.tables t
  join public.table_sessions ts on ts.table_id = t.id
  where ts.session_token = p_session_token
  for update of t;

  select *
  into v_session
  from public.table_sessions
  where session_token = p_session_token
    and status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'Sesión de mesa inválida o expirada';
  end if;

  if p_type = 'BILL' then
    if not exists (
      select 1
      from public.orders o
      where o.table_session_id = v_session.id
        and o.status not in ('REJECTED', 'CANCELLED')
    ) then
      raise exception 'Primero hay que hacer un pedido para poder pedir la cuenta';
    end if;
  end if;

  select id
  into v_existing_call
  from public.waiter_calls
  where table_id = v_session.table_id
    and restaurant_id = v_session.restaurant_id
    and type = p_type
    and status = 'PENDING';

  if found then
    raise exception 'Ya existe una solicitud pendiente de este tipo';
  end if;

  -- M11: la cuenta se pide una sola vez por sesión.
  if p_type = 'BILL' and public.session_bill_requested(v_session.id) then
    raise exception 'La cuenta ya fue solicitada'
      using errcode = 'P0001', hint = 'BILL_REQUESTED';
  end if;

  -- M11: anti-spam. Una llamada por tipo cada qr_call_cooldown_seconds por sesión.
  select r.qr_call_cooldown_seconds into v_cooldown
  from public.restaurants r where r.id = v_session.restaurant_id;
  v_cooldown := coalesce(v_cooldown, 60);

  select max(wc.created_at) into v_last
  from public.waiter_calls wc
  where wc.table_session_id = v_session.id and wc.type = p_type;

  if v_last is not null and v_last > now() - make_interval(secs => v_cooldown) then
    v_left := ceil(extract(epoch from (v_last + make_interval(secs => v_cooldown) - now())))::int;
    raise exception 'Espera % segundos antes de volver a llamar', v_left
      using errcode = 'P0001', hint = 'COOLDOWN';
  end if;

  insert into public.waiter_calls (
    restaurant_id,
    table_id,
    table_session_id,
    type,
    status
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    p_type,
    'PENDING'
  )
  returning id
  into v_call_id;

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_call_id;
end;
$function$;

revoke all on function public.create_waiter_call(uuid, public.waiter_call_type) from public;
grant execute on function public.create_waiter_call(uuid, public.waiter_call_type) to anon, authenticated, service_role;

-- ======================= e) create_customer_order ===========================
-- Cuerpo de 20261022040000; cambia: bloqueo tras pedir la cuenta, aprobación
-- configurable, origen y status_review.
create or replace function public.create_customer_order(
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
  v_require  boolean;
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

  -- M11: tras pedir la cuenta el cliente ya no agrega productos.
  if public.session_bill_requested(v_session.id) then
    raise exception 'La cuenta ya fue solicitada. Pide ayuda al mesero si quieres agregar algo.'
      using errcode = 'P0001', hint = 'BILL_REQUESTED';
  end if;

  select r.qr_orders_require_approval into v_require
  from public.restaurants r where r.id = v_session.restaurant_id;
  v_require := coalesce(v_require, true);

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
    client_request_id,
    source,
    status_review,
    accepted_at,
    preparing_at
  )
  values (
    v_session.restaurant_id,
    v_session.table_id,
    v_session.id,
    -- M11: con aprobación (default) queda PENDING y no entra a cocina hasta
    -- que el mesero la apruebe; sin aprobación entra directo a PREPARING.
    case when v_require then 'PENDING'::public.order_status else 'PREPARING'::public.order_status end,
    v_subtotal,
    v_subtotal,
    v_notes,
    p_client_request_id,
    'digital_menu',
    'new',
    case when v_require then null else now() end,
    case when v_require then null else now() end
  )
  returning id into v_order_id;

  perform public.insert_order_lines(v_order_id, null, v_built -> 'lines');

  if not v_require then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values
      (v_session.restaurant_id, null, 'ACCEPT_ORDER', 'ORDER', v_order_id,
       jsonb_build_object('auto', true, 'source', 'digital_menu')),
      (v_session.restaurant_id, null, 'START_PREPARING', 'ORDER', v_order_id,
       jsonb_build_object('auto', true, 'source', 'digital_menu'));
  end if;

  update public.table_sessions
  set last_activity_at = now()
  where id = v_session.id;

  return v_order_id;
end;
$$;

revoke all on function public.create_customer_order(uuid, jsonb, text, uuid) from public;
grant execute on function public.create_customer_order(uuid, jsonb, text, uuid) to anon, authenticated, service_role;

-- ======================= f) revisión por el mesero ==========================
create or replace function public.assert_floor_staff(p_restaurant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(p_restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.assert_floor_staff(uuid) from public, anon, authenticated;
grant execute on function public.assert_floor_staff(uuid) to service_role;

-- Aprueba un pedido del cliente: PENDING -> PREPARING (accept_and_prepare_order,
-- que audita ACCEPT_ORDER/START_PREPARING) y lo marca como revisado.
create or replace function public.approve_customer_order(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_o public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_o from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  perform public.assert_floor_staff(v_o.restaurant_id);

  if v_o.status = 'PENDING' then
    perform public.accept_and_prepare_order(p_order_id);
  elsif v_o.status in ('REJECTED', 'CANCELLED') then
    raise exception 'El pedido ya fue procesado (estado actual: %)', v_o.status;
  end if;

  update public.orders set status_review = 'reviewed'
  where id = p_order_id and status_review = 'new';

  select * into v_o from public.orders where id = p_order_id;
  return jsonb_build_object('order_id', v_o.id, 'status', v_o.status, 'status_review', v_o.status_review);
end;
$$;

create or replace function public.reject_customer_order(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_o public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_o from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  perform public.assert_floor_staff(v_o.restaurant_id);

  perform public.reject_order(p_order_id, nullif(btrim(coalesce(p_reason, '')), ''));

  update public.orders set status_review = 'reviewed'
  where id = p_order_id and status_review = 'new';

  select * into v_o from public.orders where id = p_order_id;
  return jsonb_build_object('order_id', v_o.id, 'status', v_o.status, 'status_review', v_o.status_review);
end;
$$;

-- Pedido que entró directo a cocina (sin aprobación): el mesero solo lo "ve".
create or replace function public.mark_order_reviewed(p_order_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_restaurant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select restaurant_id into v_restaurant_id from public.orders where id = p_order_id;
  if v_restaurant_id is null then
    raise exception 'Pedido no encontrado';
  end if;
  perform public.assert_floor_staff(v_restaurant_id);

  update public.orders set status_review = 'reviewed'
  where id = p_order_id and status_review = 'new';
end;
$$;

revoke all on function public.approve_customer_order(uuid) from public, anon;
revoke all on function public.reject_customer_order(uuid, text) from public, anon;
revoke all on function public.mark_order_reviewed(uuid) from public, anon;
grant execute on function public.approve_customer_order(uuid) to authenticated, service_role;
grant execute on function public.reject_customer_order(uuid, text) to authenticated, service_role;
grant execute on function public.mark_order_reviewed(uuid) to authenticated, service_role;
