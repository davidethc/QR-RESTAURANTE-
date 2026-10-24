-- ---------------------------------------------------------------------------
-- M12 · Menú digital: domicilio y para recoger (EXPAND).
-- Spec: docs/pos-spec/M12-menu-digital-domicilio-recoger.md.
-- Contrato: docs/pos-spec/tanda4-db.md. Depende de 20261024100000 (M13:
-- build_order_lines con canal) y de M06 (columnas de cliente en orders,
-- m06_normalize_counter_fields, lock_counter_table).
--
-- Ya existían (M06/M11) y se REUTILIZAN: orders.service_type ('delivery',
-- 'pickup'), customer_name, customer_phone, delivery_address, shipping_cost
-- (null = "Por cotizar"), preferred_payment_method, pays_with_amount,
-- general_comment, status_review ('new' = sin revisar), source ('web').
-- customer_phone y delivery_address siguen SIN grant de SELECT para
-- authenticated (se leen con get_order_contact). Nada aquí los expone.
--
-- Qué agrega:
--   a) restaurants: digital_menu_status (inactive|active|paused),
--      digital_menu_paused_from/_until, whatsapp_number, whatsapp_monthly_volume.
--   b) delivery_settings y payment_method_settings (una fila por canal), con
--      los defaults de §5 cuando no hay fila (solo efectivo, 25–45 / 15 min,
--      envío "Por cotizar").
--   c) orders.confirmed_at / expires_at / expired_at. online_order_tokens:
--      token de seguimiento del cliente (sin RLS de lectura; solo por RPC).
--   d) Público (anon, SECURITY DEFINER, por slug o token):
--        get_digital_menu, quote_online_order, place_online_order,
--        get_online_order, confirm_online_order.
--   e) Personal: activate_digital_menu, pause_digital_menu,
--      resume_digital_menu, save_delivery_settings,
--      save_payment_method_settings, get_digital_menu_settings,
--      accept_online_order, review_online_order.
--   f) expire_online_orders: vence los pedidos no confirmados (CANCELLED +
--      expired_at, fuera de reportes). Se llama de forma perezosa desde las
--      RPC y por pg_cron cada 5 min si la extensión está instalada.
--
-- Flujo del pedido en línea:
--   place_online_order -> orders PENDING, status_review 'new', source 'web',
--   sesión de mostrador propia ("Para llevar/Domicilio #N"), SIN cuenta y SIN
--   cocina (el KDS solo muestra ACCEPTED/PREPARING). Vence en
--   delivery_settings.unconfirmed_ttl_minutes si nadie lo confirma.
--   confirm_online_order (cliente) o accept_online_order (personal) fijan
--   confirmed_at. accept_online_order además lo pasa a PREPARING, suma el
--   envío si se indica y abre la cuenta (billing_enabled), con el método
--   preferido ya guardado en orders para precargar el cobro (M07).
--
-- Abuso: idempotencia obligatoria (p_client_request_id), máximo 50 líneas
-- (build_order_lines), máximo 3 pedidos sin confirmar por teléfono en 15 min
-- y 30 por restaurante en 10 min; teléfono y dirección validados por
-- m06_normalize_counter_fields. Respuestas públicas sin datos de otros clientes.
--
-- Rollback: drop de las funciones nuevas y del job 'monky-expire-online-orders';
-- las columnas y tablas nuevas son inofensivas.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ======================= a) restaurants =====================================
alter table public.restaurants
  add column if not exists digital_menu_status text not null default 'inactive',
  add column if not exists digital_menu_paused_from timestamptz,
  add column if not exists digital_menu_paused_until timestamptz,
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_monthly_volume text;

alter table public.restaurants
  drop constraint if exists restaurants_digital_menu_status_valid,
  drop constraint if exists restaurants_whatsapp_number_valid,
  drop constraint if exists restaurants_whatsapp_volume_valid,
  drop constraint if exists restaurants_digital_menu_pause_valid;
alter table public.restaurants
  add constraint restaurants_digital_menu_status_valid
    check (digital_menu_status in ('inactive', 'active', 'paused')),
  add constraint restaurants_whatsapp_number_valid
    check (whatsapp_number is null or whatsapp_number ~ '^\+[1-9][0-9]{6,14}$'),
  add constraint restaurants_whatsapp_volume_valid
    check (whatsapp_monthly_volume is null or whatsapp_monthly_volume in ('lt_50', '50_150', '150_500', 'gt_500')),
  add constraint restaurants_digital_menu_pause_valid
    check (digital_menu_paused_until is null or digital_menu_paused_from is null
           or digital_menu_paused_until > digital_menu_paused_from);

comment on column public.restaurants.digital_menu_status is 'M12: inactive | active | paused. Pausado solo dentro de [paused_from, paused_until).';
comment on column public.restaurants.digital_menu_paused_from is 'M12: inicio de la pausa (null = desde que se pausó).';
comment on column public.restaurants.digital_menu_paused_until is 'M12: fin de la pausa (null = hasta reactivar a mano).';
comment on column public.restaurants.whatsapp_number is 'M12: número E.164 (+código país) que recibe los pedidos del menú digital.';
comment on column public.restaurants.whatsapp_monthly_volume is 'M12: volumen mensual aproximado de pedidos a domicilio: lt_50 | 50_150 | 150_500 | gt_500.';

-- Configura el menú digital: OWNER, ADMIN (legacy) o roles[] ADMIN / BRANCH_MANAGER.
create or replace function public.can_manage_digital_menu(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = p_restaurant_id
      and rm.user_id = auth.uid()
      and rm.status = 'ACTIVE'
      and (rm.role in ('OWNER', 'ADMIN') or rm.roles && array['ADMIN', 'BRANCH_MANAGER']::text[])
  );
$$;

-- Atiende pedidos en línea: OWNER, ADMIN, WAITER (legacy) o cajero con caja.
create or replace function public.can_handle_online_orders(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
      or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
      or public.user_has_restaurant_role(p_restaurant_id, 'WAITER')
      or public.can_handle_cash(p_restaurant_id);
$$;

revoke all on function public.can_manage_digital_menu(uuid) from public, anon;
revoke all on function public.can_handle_online_orders(uuid) from public, anon;
grant execute on function public.can_manage_digital_menu(uuid) to authenticated, service_role;
grant execute on function public.can_handle_online_orders(uuid) to authenticated, service_role;

-- ======================= b) configuración ===================================
create table if not exists public.delivery_settings (
  restaurant_id            uuid primary key references public.restaurants (id) on delete cascade,
  shipping_cost_type       text not null default 'quote',
  free_shipping_enabled    boolean not null default false,
  free_shipping_min_amount numeric(10,2),
  min_purchase_enabled     boolean not null default false,
  min_purchase_amount      numeric(10,2),
  delivery_time_min        integer not null default 25,
  delivery_time_max        integer not null default 45,
  pickup_time              integer not null default 15,
  unconfirmed_ttl_minutes  integer not null default 30,
  updated_at               timestamptz not null default now(),
  constraint delivery_settings_shipping_type_valid check (shipping_cost_type in ('quote', 'distance')),
  constraint delivery_settings_free_valid check (
    not free_shipping_enabled or (free_shipping_min_amount > 0 and free_shipping_min_amount <= 99999.99)),
  constraint delivery_settings_min_valid check (
    not min_purchase_enabled or (min_purchase_amount > 0 and min_purchase_amount <= 99999.99)),
  constraint delivery_settings_times_valid check (
    delivery_time_min between 1 and 600 and delivery_time_max between delivery_time_min and 600
    and pickup_time between 1 and 600),
  constraint delivery_settings_ttl_valid check (unconfirmed_ttl_minutes between 5 and 1440)
);

comment on table public.delivery_settings is 'M12: envío y tiempos del menú digital. Sin fila = defaults (Por cotizar, 25–45 min, recoger 15 min, vencimiento 30 min).';

create table if not exists public.payment_method_settings (
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  channel          text not null,
  cash_enabled     boolean not null default true,
  card_enabled     boolean not null default false,
  transfer_enabled boolean not null default false,
  bank_holder      text,
  bank_name        text,
  bank_account     text,
  bank_card_number text,
  updated_at       timestamptz not null default now(),
  primary key (restaurant_id, channel),
  constraint payment_method_settings_channel_valid check (channel in ('delivery', 'pickup')),
  constraint payment_method_settings_one_enabled check (cash_enabled or card_enabled or transfer_enabled),
  constraint payment_method_settings_bank_len check (
    coalesce(length(bank_holder), 0) <= 80 and coalesce(length(bank_name), 0) <= 80
    and coalesce(length(bank_account), 0) <= 40 and coalesce(length(bank_card_number), 0) <= 25)
);

comment on table public.payment_method_settings is 'M12: métodos de pago del menú digital por canal. Sin fila = solo efectivo. Datos bancarios visibles al cliente solo si transfer_enabled.';

alter table public.delivery_settings enable row level security;
alter table public.payment_method_settings enable row level security;

drop policy if exists delivery_settings_select_members on public.delivery_settings;
create policy delivery_settings_select_members on public.delivery_settings
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

-- Datos bancarios: solo quien administra el menú digital (por RLS); el
-- cliente los ve por get_digital_menu cuando la transferencia está activa.
drop policy if exists payment_method_settings_select_admin on public.payment_method_settings;
create policy payment_method_settings_select_admin on public.payment_method_settings
  for select to authenticated
  using (public.can_manage_digital_menu(restaurant_id));

revoke all on table public.delivery_settings from public, anon, authenticated;
revoke all on table public.payment_method_settings from public, anon, authenticated;
grant select on table public.delivery_settings to authenticated;
grant select on table public.payment_method_settings to authenticated;
grant all on table public.delivery_settings to service_role;
grant all on table public.payment_method_settings to service_role;

-- ======================= c) orders y token de seguimiento ===================
alter table public.orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz;

comment on column public.orders.confirmed_at is 'M12: pedido en línea confirmado (cliente o personal). Null = sin confirmar.';
comment on column public.orders.expires_at is 'M12: vence si sigue sin confirmar a esta hora (solo source = web).';
comment on column public.orders.expired_at is 'M12: hora en que venció (status CANCELLED, no cuenta en reportes).';

grant select (confirmed_at, expires_at, expired_at) on public.orders to authenticated;

create index if not exists orders_restaurant_confirmed_idx on public.orders (restaurant_id, confirmed_at);
create index if not exists orders_web_pending_expiry_idx on public.orders (restaurant_id, expires_at)
  where source = 'web' and status = 'PENDING' and confirmed_at is null;

create table if not exists public.online_order_tokens (
  order_id      uuid primary key references public.orders (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  token         uuid not null unique default gen_random_uuid(),
  created_at    timestamptz not null default now()
);

comment on table public.online_order_tokens is 'M12: token de seguimiento del pedido en línea. Sin acceso directo: solo RPC.';

alter table public.online_order_tokens enable row level security;
revoke all on table public.online_order_tokens from public, anon, authenticated;
grant all on table public.online_order_tokens to service_role;

-- ======================= helpers internos ===================================
-- Estado efectivo: una pausa solo cuenta dentro de [paused_from, paused_until).
create or replace function public.digital_menu_effective_status(p_restaurant_id uuid, p_at timestamptz default now())
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when r.digital_menu_status = 'inactive' then 'inactive'
    when r.digital_menu_status = 'paused'
         and (r.digital_menu_paused_from is null or p_at >= r.digital_menu_paused_from)
         and (r.digital_menu_paused_until is null or p_at < r.digital_menu_paused_until) then 'paused'
    else 'active'
  end
  from public.restaurants r
  where r.id = p_restaurant_id;
$$;

-- Horario: turnos de TODOS los horarios del restaurante (M01). Sin turnos =
-- abierto 24 h (M12 §7.5). Un turno con ends_at < starts_at cruza la medianoche.
create or replace function public.digital_menu_open_state(p_restaurant_id uuid, p_at timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_tz    text;
  v_local timestamp;
  v_d     date;
  v_t     time;
  v_w     integer;
  v_open  boolean;
  v_next  timestamp;
begin
  select timezone into v_tz from public.restaurants where id = p_restaurant_id;
  v_local := p_at at time zone v_tz;
  v_d := v_local::date;
  v_t := v_local::time;
  v_w := extract(dow from v_local)::integer;

  if not exists (
    select 1 from public.schedule_shifts s
    join public.schedules sc on sc.id = s.schedule_id
    where sc.restaurant_id = p_restaurant_id
  ) then
    return jsonb_build_object('open', true, 'always_open', true, 'next_open_at', null);
  end if;

  select exists (
    select 1 from public.schedule_shifts s
    join public.schedules sc on sc.id = s.schedule_id
    where sc.restaurant_id = p_restaurant_id
      and (
        (s.weekday = v_w and (
          (s.starts_at < s.ends_at and v_t >= s.starts_at and v_t < s.ends_at)
          or (s.starts_at > s.ends_at and v_t >= s.starts_at)))
        or (s.weekday = (v_w + 6) % 7 and s.starts_at > s.ends_at and v_t < s.ends_at)
      )
  ) into v_open;

  if not v_open then
    select min((v_d + k) + s.starts_at) into v_next
    from public.schedule_shifts s
    join public.schedules sc on sc.id = s.schedule_id
    cross join generate_series(0, 7) as k
    where sc.restaurant_id = p_restaurant_id
      and s.weekday = (v_w + k) % 7
      and (v_d + k) + s.starts_at > v_local;
  end if;

  return jsonb_build_object(
    'open', v_open, 'always_open', false,
    'next_open_at', case when v_next is null then null else v_next at time zone v_tz end);
end;
$$;

create or replace function public.digital_menu_state_json(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_status text := public.digital_menu_effective_status(p_restaurant_id);
  v_open   jsonb := public.digital_menu_open_state(p_restaurant_id);
  v_r      public.restaurants%rowtype;
begin
  select * into v_r from public.restaurants where id = p_restaurant_id;
  return jsonb_build_object(
    'status',           v_status,
    'accepting_orders', v_status = 'active' and (v_open ->> 'open')::boolean,
    'reason',           case
                          when v_status <> 'active' then v_status
                          when not (v_open ->> 'open')::boolean then 'closed'
                        end,
    'paused_from',      case when v_status = 'paused' then v_r.digital_menu_paused_from end,
    'paused_until',     case when v_status = 'paused' then v_r.digital_menu_paused_until end,
    'open',             (v_open ->> 'open')::boolean,
    'always_open',      (v_open ->> 'always_open')::boolean,
    'next_open_at',     v_open -> 'next_open_at');
end;
$$;

create or replace function public.delivery_settings_json(p_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'shipping_cost_type',       coalesce(d.shipping_cost_type, 'quote'),
    'free_shipping_enabled',    coalesce(d.free_shipping_enabled, false),
    'free_shipping_min_amount', d.free_shipping_min_amount,
    'min_purchase_enabled',     coalesce(d.min_purchase_enabled, false),
    'min_purchase_amount',      d.min_purchase_amount,
    'delivery_time_min',        coalesce(d.delivery_time_min, 25),
    'delivery_time_max',        coalesce(d.delivery_time_max, 45),
    'pickup_time',              coalesce(d.pickup_time, 15),
    'unconfirmed_ttl_minutes',  coalesce(d.unconfirmed_ttl_minutes, 30))
  from (select p_restaurant_id as rid) x
  left join public.delivery_settings d on d.restaurant_id = x.rid;
$$;

-- {delivery: {...}, pickup: {...}}; datos bancarios solo si p_include_bank y
-- la transferencia del canal está activa.
create or replace function public.payment_methods_json(p_restaurant_id uuid, p_include_bank boolean)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_object_agg(c.channel, jsonb_build_object(
    'cash',     coalesce(s.cash_enabled, true),
    'card',     coalesce(s.card_enabled, false),
    'transfer', coalesce(s.transfer_enabled, false),
    'bank', case when p_include_bank and coalesce(s.transfer_enabled, false) then jsonb_build_object(
              'holder', s.bank_holder, 'bank', s.bank_name,
              'account', s.bank_account, 'card_number', s.bank_card_number) end))
  from (values ('delivery'), ('pickup')) as c(channel)
  left join public.payment_method_settings s
    on s.restaurant_id = p_restaurant_id and s.channel = c.channel;
$$;

-- Cierra la sesión de mostrador de un pedido en línea que ya no tiene
-- pedidos vivos (vencido o rechazado), para que no quede "abierta".
create or replace function public.close_online_order_session(p_session_id uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.table_sessions ts
  set status = 'CLOSED', closed_at = coalesce(ts.closed_at, now())
  where ts.id = p_session_id
    and ts.status = 'ACTIVE'
    and ts.table_kind = 'COUNTER'
    and not exists (
      select 1 from public.orders o
      where o.table_session_id = ts.id and o.status not in ('REJECTED', 'CANCELLED'))
    and not exists (
      select 1 from public.bills b
      where b.table_session_id = ts.id and b.status not in ('VOID'));
$$;

-- f) Vence pedidos en línea sin confirmar. Devuelve cuántos venció.
create or replace function public.expire_online_orders(p_restaurant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row record;
  v_n   integer := 0;
begin
  for v_row in
    update public.orders o
    set status = 'CANCELLED',
        cancelled = true,
        cancel_reason = 'Pedido en línea no confirmado a tiempo',
        expired_at = now(),
        status_review = 'reviewed'
    where o.source = 'web'
      and o.status = 'PENDING'
      and o.confirmed_at is null
      and o.expires_at <= now()
      and (p_restaurant_id is null or o.restaurant_id = p_restaurant_id)
    returning o.id, o.restaurant_id, o.table_session_id
  loop
    v_n := v_n + 1;
    perform public.close_online_order_session(v_row.table_session_id);
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_row.restaurant_id, null, 'UPDATE', 'ORDER', v_row.id,
            jsonb_build_object('action', 'EXPIRE_ONLINE_ORDER', 'auto', true));
  end loop;
  return v_n;
end;
$$;

-- Respuesta pública de un pedido en línea (sin teléfono ni dirección).
create or replace function public.online_order_json(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'order_id',       o.id,
    'short_code',     o.short_code,
    'folio',          o.folio,
    'service_type',   o.service_type,
    'tracking_token', t.token,
    'step', case
      when o.status = 'CANCELLED' and o.expired_at is not null then 'expired'
      when o.status = 'PENDING' and o.confirmed_at is null and o.expires_at <= now() then 'expired'
      when o.status = 'PENDING' and o.confirmed_at is null then 'new'
      when o.status = 'PENDING' then 'confirmed'
      when o.status in ('ACCEPTED', 'PREPARING') then 'preparing'
      when o.status = 'READY' then 'ready'
      when o.status = 'DELIVERED' then 'delivered'
      when o.status = 'REJECTED' then 'rejected'
      else 'cancelled'
    end,
    'created_at',     o.created_at,
    'confirmed_at',   o.confirmed_at,
    'expires_at',     o.expires_at,
    'customer_name',  o.customer_name,
    'preferred_payment_method', o.preferred_payment_method,
    'pays_with_amount', o.pays_with_amount,
    'general_comment', o.general_comment,
    'subtotal',       o.subtotal,
    'promo_discount_total', coalesce((
      select sum(oi.promo_discount) from public.order_items oi
      where oi.order_id = o.id and not oi.cancelled), 0),
    'shipping_cost',  o.shipping_cost,
    'shipping_pending', o.service_type = 'delivery' and o.shipping_cost is null,
    'total',          o.total,
    'restaurant', jsonb_build_object(
      'name', r.name, 'slug', r.slug, 'logo_url', r.logo_url, 'whatsapp_number', r.whatsapp_number),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name',   oi.product_name,
        'variant_name',   oi.variant_name,
        'quantity',       oi.quantity,
        'unit_price',     oi.unit_price,
        'list_subtotal',  oi.unit_price * oi.quantity,
        'promo_discount', oi.promo_discount,
        'subtotal',       oi.subtotal,
        'notes',          oi.notes,
        'promotions', coalesce((
          select jsonb_agg(public.promotion_label(p ->> 'type', p ->> 'value_type',
                   (p ->> 'value')::numeric, (p ->> 'receive_qty')::integer, (p ->> 'buy_qty')::integer))
          from jsonb_array_elements(oi.promotions) p), '[]'::jsonb),
        'options', coalesce((
          select jsonb_agg(jsonb_build_object('name', oo.option_name, 'value_name', oo.value_name,
                   'qty', oo.qty, 'price_modifier', oo.price_modifier) order by oo.created_at, oo.id)
          from public.order_item_options oo where oo.order_item_id = oi.id), '[]'::jsonb))
        order by oi.created_at, oi.id)
      from public.order_items oi
      where oi.order_id = o.id and not oi.cancelled), '[]'::jsonb))
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  left join public.online_order_tokens t on t.order_id = o.id
  where o.id = p_order_id;
$$;

revoke all on function public.digital_menu_effective_status(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.digital_menu_open_state(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.digital_menu_state_json(uuid) from public, anon, authenticated;
revoke all on function public.delivery_settings_json(uuid) from public, anon, authenticated;
revoke all on function public.payment_methods_json(uuid, boolean) from public, anon, authenticated;
revoke all on function public.close_online_order_session(uuid) from public, anon, authenticated;
revoke all on function public.expire_online_orders(uuid) from public, anon, authenticated;
revoke all on function public.online_order_json(uuid) from public, anon, authenticated;
grant execute on function public.digital_menu_effective_status(uuid, timestamptz) to service_role;
grant execute on function public.digital_menu_open_state(uuid, timestamptz) to service_role;
grant execute on function public.digital_menu_state_json(uuid) to service_role;
grant execute on function public.delivery_settings_json(uuid) to service_role;
grant execute on function public.payment_methods_json(uuid, boolean) to service_role;
grant execute on function public.close_online_order_session(uuid) to service_role;
grant execute on function public.expire_online_orders(uuid) to service_role;
grant execute on function public.online_order_json(uuid) to service_role;

-- ======================= d) RPC públicas (anon) =============================
-- Configuración pública de la carta de domicilio/recoger. El catálogo sigue
-- saliendo de get_public_menu(p_slug); aquí van estado, tiempos, métodos de
-- pago, promociones vigentes y productos ocultos por canal.
create or replace function public.get_digital_menu(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_r     public.restaurants%rowtype;
  v_today date;
  v_state jsonb;
begin
  select * into v_r from public.restaurants
  where slug = p_slug and status = 'ACTIVE';
  if not found then
    raise exception 'Restaurante no disponible';
  end if;

  v_state := public.digital_menu_state_json(v_r.id);

  if v_state ->> 'status' = 'inactive' then
    return jsonb_build_object(
      'restaurant', jsonb_build_object('id', v_r.id, 'name', v_r.name, 'slug', v_r.slug, 'logo_url', v_r.logo_url),
      'state', v_state);
  end if;

  v_today := public.restaurant_local_date(v_r.id);

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', v_r.id, 'name', v_r.name, 'slug', v_r.slug, 'logo_url', v_r.logo_url,
      'phone', v_r.phone, 'address', v_r.address, 'timezone', v_r.timezone,
      'whatsapp_number', v_r.whatsapp_number),
    'state', v_state,
    'delivery', public.delivery_settings_json(v_r.id) - 'unconfirmed_ttl_minutes',
    'payment_methods', public.payment_methods_json(v_r.id, true),
    'promotions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'type', p.type, 'value_type', p.value_type, 'value', p.value,
        'receive_qty', p.receive_qty, 'buy_qty', p.buy_qty, 'applies_to', p.applies_to,
        'target_ids', to_jsonb(p.target_ids),
        'channels', jsonb_build_object(
          'delivery', public.promotion_channel_ok(p.service_options, 'digital_menu.delivery'),
          'pickup',   public.promotion_channel_ok(p.service_options, 'digital_menu.pickup')),
        'label', public.promotion_label(p.type, p.value_type, p.value, p.receive_qty, p.buy_qty))
        order by p.created_at, p.id)
      from public.promotions p
      where p.restaurant_id = v_r.id
        and p.status = 'active'
        and public.promotion_runs_on(p.weekdays, p.starts_on, p.ends_on, v_today)
        and (public.promotion_channel_ok(p.service_options, 'digital_menu.delivery')
             or public.promotion_channel_ok(p.service_options, 'digital_menu.pickup'))
    ), '[]'::jsonb),
    'hidden_product_ids', jsonb_build_object(
      'delivery', coalesce((select jsonb_agg(pr.id) from public.products pr
        where pr.restaurant_id = v_r.id and pr.active
          and not public.promotion_channel_ok(pr.service_options, 'digital_menu.delivery')), '[]'::jsonb),
      'pickup', coalesce((select jsonb_agg(pr.id) from public.products pr
        where pr.restaurant_id = v_r.id and pr.active
          and not public.promotion_channel_ok(pr.service_options, 'digital_menu.pickup')), '[]'::jsonb)));
end;
$$;

-- Precio del carrito en el servidor (con promociones), envío y compra mínima.
-- No crea nada. El checkout debe mostrar ESTOS montos.
create or replace function public.quote_online_order(p_slug text, p_service_type text, p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_r        public.restaurants%rowtype;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_ds       jsonb;
  v_free_min numeric(10,2);
  v_min      numeric(10,2);
begin
  if p_service_type is null or p_service_type not in ('delivery', 'pickup') then
    raise exception 'Elige A domicilio o Para recoger' using hint = 'field=service_type';
  end if;
  select * into v_r from public.restaurants where slug = p_slug and status = 'ACTIVE';
  if not found or public.digital_menu_effective_status(v_r.id) = 'inactive' then
    raise exception 'El menú digital no está disponible';
  end if;

  v_built := public.build_order_lines(v_r.id, p_items, 'digital_menu.' || p_service_type);
  v_subtotal := (v_built ->> 'subtotal')::numeric;
  v_ds := public.delivery_settings_json(v_r.id);
  v_free_min := case when (v_ds ->> 'free_shipping_enabled')::boolean then (v_ds ->> 'free_shipping_min_amount')::numeric end;
  v_min := case when (v_ds ->> 'min_purchase_enabled')::boolean then (v_ds ->> 'min_purchase_amount')::numeric end;

  return jsonb_build_object(
    'service_type', p_service_type,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', l ->> 'product_id', 'product_name', l ->> 'product_name',
        'variant_id', l ->> 'variant_id', 'variant_name', l ->> 'variant_name',
        'quantity', (l ->> 'quantity')::integer, 'unit_price', (l ->> 'unit_price')::numeric,
        'list_subtotal', (l ->> 'list_subtotal')::numeric,
        'promo_discount', (l ->> 'promo_discount')::numeric,
        'subtotal', (l ->> 'subtotal')::numeric,
        'promotions', coalesce((
          select jsonb_agg(jsonb_build_object('id', p ->> 'id', 'name', p ->> 'name',
            'label', public.promotion_label(p ->> 'type', p ->> 'value_type', (p ->> 'value')::numeric,
                       (p ->> 'receive_qty')::integer, (p ->> 'buy_qty')::integer)))
          from jsonb_array_elements(case when jsonb_typeof(l -> 'promotions') = 'array'
                                         then l -> 'promotions' else '[]'::jsonb end) p), '[]'::jsonb))
        order by n)
      from jsonb_array_elements(v_built -> 'lines') with ordinality as t(l, n)), '[]'::jsonb),
    'subtotal', v_subtotal,
    'promo_discount_total', coalesce((
      select sum((l ->> 'promo_discount')::numeric) from jsonb_array_elements(v_built -> 'lines') l), 0),
    'shipping', jsonb_build_object(
      'applies', p_service_type = 'delivery',
      'type', v_ds ->> 'shipping_cost_type',
      'pending', p_service_type = 'delivery',
      'free', p_service_type = 'delivery' and v_free_min is not null and v_subtotal >= v_free_min),
    'free_shipping', case when p_service_type = 'delivery' and v_free_min is not null then jsonb_build_object(
      'min_amount', v_free_min, 'remaining', greatest(v_free_min - v_subtotal, 0),
      'reached', v_subtotal >= v_free_min) end,
    'min_purchase', case when p_service_type = 'delivery' and v_min is not null then jsonb_build_object(
      'min_amount', v_min, 'remaining', greatest(v_min - v_subtotal, 0),
      'reached', v_subtotal >= v_min) end);
end;
$$;

-- Crea el pedido en línea ("Nuevo", pago y envío pendientes). Idempotente por
-- p_client_request_id: un reintento devuelve el mismo pedido con replayed=true.
create or replace function public.place_online_order(
  p_slug text,
  p_service_type text,
  p_items jsonb,
  p_client_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_delivery_address jsonb default null,
  p_pays_with_amount numeric default null,
  p_general_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_r        public.restaurants%rowtype;
  v_state    jsonb;
  v_n        jsonb;
  v_pm       jsonb;
  v_ds       jsonb;
  v_comment  text;
  v_table    public.tables%rowtype;
  v_existing public.table_sessions%rowtype;
  v_order    public.orders%rowtype;
  v_built    jsonb;
  v_subtotal numeric(10,2);
  v_min      numeric(10,2);
  v_day      date;
  v_start    timestamptz;
  v_end      timestamptz;
  v_number   integer;
  v_session  public.table_sessions%rowtype;
  v_recent   integer;
begin
  if p_client_request_id is null then
    raise exception 'Falta la clave de idempotencia';
  end if;
  if p_service_type is null or p_service_type not in ('delivery', 'pickup') then
    raise exception 'Elige A domicilio o Para recoger' using hint = 'field=service_type';
  end if;

  select * into v_r from public.restaurants where slug = p_slug and status = 'ACTIVE';
  if not found then
    raise exception 'Restaurante no disponible';
  end if;

  -- Candado del mostrador del restaurante: serializa idempotencia, número de
  -- mostrador y límites de abuso.
  v_table := public.lock_counter_table(v_r.id);

  select * into v_existing from public.table_sessions
  where restaurant_id = v_r.id and client_request_id = p_client_request_id;
  if found then
    select * into v_order from public.orders
    where table_session_id = v_existing.id order by created_at, order_number limit 1;
    if v_order.id is null or v_order.source is distinct from 'web' then
      raise exception 'No se pudo enviar el pedido. Vuelve a intentarlo.';
    end if;
    return public.online_order_json(v_order.id) || jsonb_build_object('replayed', true);
  end if;

  v_state := public.digital_menu_state_json(v_r.id);
  if not (v_state ->> 'accepting_orders')::boolean then
    raise exception '%', case v_state ->> 'reason'
        when 'paused' then 'Los pedidos en línea están en pausa por el momento'
        when 'closed' then 'Estamos fuera de horario: puedes ver el menú, pero no hacer pedidos'
        else 'El menú digital no está disponible'
      end
      using errcode = 'P0001', hint = 'state=' || coalesce(v_state ->> 'reason', 'inactive');
  end if;

  -- Datos del cliente (mismas reglas que el domicilio propio de M06).
  v_n := public.m06_normalize_counter_fields(
    case when p_service_type = 'delivery' then 'delivery' else 'takeaway' end,
    case when p_service_type = 'delivery' then 'own' end,
    null, p_customer_name, p_customer_phone,
    case when p_service_type = 'delivery' then p_delivery_address end,
    null, p_payment_method, p_pays_with_amount);
  if v_n ->> 'customer_name' is null then
    raise exception 'Escribe tu nombre' using hint = 'field=customer_name';
  end if;
  if v_n ->> 'customer_phone' is null then
    raise exception 'Escribe tu teléfono' using hint = 'field=customer_phone';
  end if;

  if v_n ->> 'preferred_payment_method' is null then
    raise exception 'Elige un método de pago' using hint = 'field=preferred_payment_method';
  end if;
  v_pm := public.payment_methods_json(v_r.id, false) -> p_service_type;
  if not coalesce((v_pm ->> (v_n ->> 'preferred_payment_method'))::boolean, false) then
    raise exception 'Ese método de pago no está disponible' using hint = 'field=preferred_payment_method';
  end if;

  v_comment := nullif(btrim(coalesce(p_general_comment, '')), '');
  if length(v_comment) > 300 then
    raise exception 'El comentario admite hasta 300 caracteres' using hint = 'field=general_comment';
  end if;

  -- Precios del servidor con las promociones del canal.
  v_built := public.build_order_lines(v_r.id, p_items, 'digital_menu.' || p_service_type);
  v_subtotal := (v_built ->> 'subtotal')::numeric;

  v_ds := public.delivery_settings_json(v_r.id);
  if p_service_type = 'delivery' and (v_ds ->> 'min_purchase_enabled')::boolean then
    v_min := (v_ds ->> 'min_purchase_amount')::numeric;
    if v_subtotal < v_min then
      raise exception 'La compra mínima para envío a domicilio es de $%', to_char(v_min, 'FM999990.00')
        using hint = 'field=min_purchase';
    end if;
  end if;

  if (v_n ->> 'pays_with_amount') is not null and (v_n ->> 'pays_with_amount')::numeric < v_subtotal then
    raise exception 'El monto con el que pagarás no cubre los productos' using hint = 'field=pays_with_amount';
  end if;

  -- Límites de abuso, después de vencer lo viejo de este restaurante.
  perform public.expire_online_orders(v_r.id);

  select count(*) into v_recent from public.orders
  where restaurant_id = v_r.id and source = 'web' and status = 'PENDING' and confirmed_at is null
    and customer_phone = v_n ->> 'customer_phone'
    and created_at > now() - interval '15 minutes';
  if v_recent >= 3 then
    raise exception 'Ya tienes pedidos esperando confirmación. Espera unos minutos o escríbenos por WhatsApp.'
      using hint = 'rate_limit=phone';
  end if;

  select count(*) into v_recent from public.orders
  where restaurant_id = v_r.id and source = 'web' and status = 'PENDING' and confirmed_at is null
    and created_at > now() - interval '10 minutes';
  if v_recent >= 30 then
    raise exception 'Estamos recibiendo muchos pedidos. Inténtalo de nuevo en unos minutos.'
      using hint = 'rate_limit=restaurant';
  end if;

  v_day := public.business_today(v_r.id);
  select b.start_at, b.end_at into v_start, v_end
  from public.business_day_bounds(v_r.id, v_day, v_day) b;

  select coalesce(max(ts.counter_number), 0) + 1 into v_number
  from public.table_sessions ts
  where ts.table_id = v_table.id and ts.table_kind = 'COUNTER'
    and ts.started_at >= v_start and ts.started_at < v_end;

  insert into public.table_sessions (
    restaurant_id, table_id, table_kind, counter_number, customer_label, client_request_id
  )
  values (
    v_r.id, v_table.id, 'COUNTER', v_number, left(v_n ->> 'customer_name', 40), p_client_request_id
  )
  returning * into v_session;

  insert into public.orders (
    restaurant_id, table_id, table_session_id, status, service_type, subtotal, total,
    delivery_provider, customer_name, customer_phone, delivery_address, general_comment,
    shipping_cost, preferred_payment_method, pays_with_amount,
    source, status_review, expires_at
  )
  values (
    v_r.id, v_table.id, v_session.id, 'PENDING', p_service_type, v_subtotal, v_subtotal,
    v_n ->> 'delivery_provider', v_n ->> 'customer_name', v_n ->> 'customer_phone',
    nullif(v_n -> 'delivery_address', 'null'::jsonb), v_comment,
    null, v_n ->> 'preferred_payment_method', (v_n ->> 'pays_with_amount')::numeric,
    'web', 'new', now() + make_interval(mins => (v_ds ->> 'unconfirmed_ttl_minutes')::integer)
  )
  returning * into v_order;

  perform public.insert_order_lines(v_order.id, null, v_built -> 'lines');

  insert into public.online_order_tokens (order_id, restaurant_id) values (v_order.id, v_r.id);

  -- Sin PII en la auditoría.
  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_r.id, null, 'CREATE', 'ORDER', v_order.id,
          jsonb_build_object('source', 'web', 'service_type', p_service_type,
            'counter_number', v_number, 'subtotal', v_subtotal));

  return public.online_order_json(v_order.id) || jsonb_build_object('replayed', false);
end;
$$;

create or replace function public.get_online_order(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_order_id uuid;
begin
  select order_id into v_order_id from public.online_order_tokens where token = p_token;
  if v_order_id is null then
    raise exception 'Pedido no encontrado';
  end if;
  return public.online_order_json(v_order_id);
end;
$$;

-- El cliente confirma su pedido dentro del sistema (además del WhatsApp).
create or replace function public.confirm_online_order(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order_id uuid;
  v_o        public.orders%rowtype;
begin
  select order_id into v_order_id from public.online_order_tokens where token = p_token;
  if v_order_id is null then
    raise exception 'Pedido no encontrado';
  end if;

  select * into v_o from public.orders where id = v_order_id for update;
  if v_o.status = 'PENDING' and v_o.confirmed_at is null then
    if v_o.expires_at <= now() then
      raise exception 'El pedido venció sin confirmarse. Haz uno nuevo.' using hint = 'state=expired';
    end if;
    update public.orders set confirmed_at = now() where id = v_o.id;
  end if;

  return public.online_order_json(v_order_id);
end;
$$;

revoke all on function public.get_digital_menu(text) from public;
revoke all on function public.quote_online_order(text, text, jsonb) from public;
revoke all on function public.place_online_order(text, text, jsonb, uuid, text, text, text, jsonb, numeric, text) from public;
revoke all on function public.get_online_order(uuid) from public;
revoke all on function public.confirm_online_order(uuid) from public;
grant execute on function public.get_digital_menu(text) to anon, authenticated, service_role;
grant execute on function public.quote_online_order(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.place_online_order(text, text, jsonb, uuid, text, text, text, jsonb, numeric, text) to anon, authenticated, service_role;
grant execute on function public.get_online_order(uuid) to anon, authenticated, service_role;
grant execute on function public.confirm_online_order(uuid) to anon, authenticated, service_role;

-- ======================= e) RPC del personal ================================
create or replace function public.get_digital_menu_settings(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_r public.restaurants%rowtype;
begin
  if auth.uid() is null or not public.can_manage_digital_menu(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_r from public.restaurants where id = p_restaurant_id;
  return jsonb_build_object(
    'slug', v_r.slug,
    'digital_menu_status', v_r.digital_menu_status,
    'paused_from', v_r.digital_menu_paused_from,
    'paused_until', v_r.digital_menu_paused_until,
    'whatsapp_number', v_r.whatsapp_number,
    'whatsapp_monthly_volume', v_r.whatsapp_monthly_volume,
    'state', public.digital_menu_state_json(p_restaurant_id),
    'delivery', public.delivery_settings_json(p_restaurant_id),
    'payment_methods', public.payment_methods_json(p_restaurant_id, true));
end;
$$;

-- Paso 1 del asistente y "WhatsApp vinculado": número (se limpian espacios,
-- guiones y paréntesis; debe quedar en E.164) y volumen mensual.
create or replace function public.set_digital_menu_whatsapp(
  p_restaurant_id uuid, p_whatsapp_number text, p_monthly_volume text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_num text := regexp_replace(coalesce(p_whatsapp_number, ''), '[\s()\-]', '', 'g');
begin
  if auth.uid() is null or not public.can_manage_digital_menu(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_num !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'Escribe el número con código de país, por ejemplo +593 99 123 4567'
      using hint = 'field=whatsapp_number';
  end if;
  if p_monthly_volume is not null and p_monthly_volume not in ('lt_50', '50_150', '150_500', 'gt_500') then
    raise exception 'Volumen mensual inválido' using hint = 'field=whatsapp_monthly_volume';
  end if;

  update public.restaurants
  set whatsapp_number = v_num,
      whatsapp_monthly_volume = coalesce(p_monthly_volume, whatsapp_monthly_volume)
  where id = p_restaurant_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT', p_restaurant_id,
          jsonb_build_object('action', 'SET_DIGITAL_MENU_WHATSAPP'));

  return public.get_digital_menu_settings(p_restaurant_id);
end;
$$;

-- Paso 2 del asistente / "Reactivar": activo y sin pausa.
create or replace function public.activate_digital_menu(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not public.can_manage_digital_menu(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if (select whatsapp_number from public.restaurants where id = p_restaurant_id) is null then
    raise exception 'Primero vincula el número de WhatsApp' using hint = 'field=whatsapp_number';
  end if;

  update public.restaurants
  set digital_menu_status = 'active', digital_menu_paused_from = null, digital_menu_paused_until = null
  where id = p_restaurant_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT', p_restaurant_id,
          jsonb_build_object('action', 'ACTIVATE_DIGITAL_MENU'));

  return public.get_digital_menu_settings(p_restaurant_id);
end;
$$;

-- Pausa: p_preset 15m | 30m | 45m | 1h | 2h | today (hasta la medianoche
-- local) | indefinite (hasta reactivar) | custom (p_until obligatorio,
-- p_from opcional = pausa programada).
create or replace function public.pause_digital_menu(
  p_restaurant_id uuid,
  p_preset text,
  p_from timestamptz default null,
  p_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_r     public.restaurants%rowtype;
  v_from  timestamptz;
  v_until timestamptz;
begin
  if auth.uid() is null or not public.can_manage_digital_menu(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_r from public.restaurants where id = p_restaurant_id for update;
  if v_r.digital_menu_status = 'inactive' then
    raise exception 'Primero activa el menú digital';
  end if;

  v_until := case p_preset
    when '15m' then now() + interval '15 minutes'
    when '30m' then now() + interval '30 minutes'
    when '45m' then now() + interval '45 minutes'
    when '1h'  then now() + interval '1 hour'
    when '2h'  then now() + interval '2 hours'
    when 'today' then ((public.restaurant_local_date(p_restaurant_id) + 1)::timestamp) at time zone v_r.timezone
    when 'indefinite' then null
    when 'custom' then p_until
  end;

  if p_preset is null or p_preset not in ('15m', '30m', '45m', '1h', '2h', 'today', 'indefinite', 'custom') then
    raise exception 'Elige cuánto tiempo pausar' using hint = 'field=preset';
  end if;
  if p_preset = 'custom' then
    v_from := p_from;
    if p_until is null then
      raise exception 'Elige hasta cuándo pausar' using hint = 'field=until';
    end if;
    if p_until <= coalesce(p_from, now()) then
      raise exception 'El fin de la pausa debe ser posterior al inicio' using hint = 'field=until';
    end if;
    if p_until > now() + interval '90 days' then
      raise exception 'La pausa admite hasta 90 días' using hint = 'field=until';
    end if;
  end if;

  update public.restaurants
  set digital_menu_status = 'paused', digital_menu_paused_from = v_from, digital_menu_paused_until = v_until
  where id = p_restaurant_id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT', p_restaurant_id,
          jsonb_build_object('action', 'PAUSE_DIGITAL_MENU', 'preset', p_preset,
            'from', v_from, 'until', v_until));

  return public.get_digital_menu_settings(p_restaurant_id);
end;
$$;

create or replace function public.resume_digital_menu(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not public.can_manage_digital_menu(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.restaurants
  set digital_menu_status = 'active', digital_menu_paused_from = null, digital_menu_paused_until = null
  where id = p_restaurant_id and digital_menu_status = 'paused';

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT', p_restaurant_id,
          jsonb_build_object('action', 'RESUME_DIGITAL_MENU'));

  return public.get_digital_menu_settings(p_restaurant_id);
end;
$$;

-- Parche: solo cambian las llaves enviadas. Llaves: shipping_cost_type,
-- free_shipping_enabled, free_shipping_min_amount, min_purchase_enabled,
-- min_purchase_amount, delivery_time_min, delivery_time_max, pickup_time,
-- unconfirmed_ttl_minutes.
create or replace function public.save_delivery_settings(p_restaurant_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cur  jsonb;
  v_new  jsonb;
  v_key  text;
begin
  if auth.uid() is null or not public.can_manage_digital_menu(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Datos inválidos';
  end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if v_key not in ('shipping_cost_type', 'free_shipping_enabled', 'free_shipping_min_amount',
                     'min_purchase_enabled', 'min_purchase_amount', 'delivery_time_min',
                     'delivery_time_max', 'pickup_time', 'unconfirmed_ttl_minutes') then
      raise exception 'Campo no editable: %', v_key using hint = 'field=' || v_key;
    end if;
  end loop;

  v_cur := public.delivery_settings_json(p_restaurant_id);
  v_new := v_cur || p_data;

  if v_new ->> 'shipping_cost_type' <> 'quote' then
    raise exception 'Por ahora el envío solo se cotiza a mano' using hint = 'field=shipping_cost_type';
  end if;

  begin
    insert into public.delivery_settings as d (
      restaurant_id, shipping_cost_type, free_shipping_enabled, free_shipping_min_amount,
      min_purchase_enabled, min_purchase_amount, delivery_time_min, delivery_time_max,
      pickup_time, unconfirmed_ttl_minutes, updated_at
    )
    values (
      p_restaurant_id, v_new ->> 'shipping_cost_type',
      (v_new ->> 'free_shipping_enabled')::boolean, (v_new ->> 'free_shipping_min_amount')::numeric,
      (v_new ->> 'min_purchase_enabled')::boolean, (v_new ->> 'min_purchase_amount')::numeric,
      (v_new ->> 'delivery_time_min')::integer, (v_new ->> 'delivery_time_max')::integer,
      (v_new ->> 'pickup_time')::integer, (v_new ->> 'unconfirmed_ttl_minutes')::integer, now()
    )
    on conflict (restaurant_id) do update
    set shipping_cost_type = excluded.shipping_cost_type,
        free_shipping_enabled = excluded.free_shipping_enabled,
        free_shipping_min_amount = excluded.free_shipping_min_amount,
        min_purchase_enabled = excluded.min_purchase_enabled,
        min_purchase_amount = excluded.min_purchase_amount,
        delivery_time_min = excluded.delivery_time_min,
        delivery_time_max = excluded.delivery_time_max,
        pickup_time = excluded.pickup_time,
        unconfirmed_ttl_minutes = excluded.unconfirmed_ttl_minutes,
        updated_at = now();
  exception
    when check_violation or invalid_text_representation or not_null_violation or numeric_value_out_of_range then
      raise exception 'Revisa los montos y tiempos: hay un valor inválido' using hint = 'field=delivery_settings';
  end;

  return public.delivery_settings_json(p_restaurant_id);
end;
$$;

-- Parche por canal (delivery | pickup). Llaves: cash_enabled, card_enabled,
-- transfer_enabled, bank_holder, bank_name, bank_account, bank_card_number.
create or replace function public.save_payment_method_settings(p_restaurant_id uuid, p_channel text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cur  public.payment_method_settings%rowtype;
  v_key  text;
  v_cash boolean;
  v_card boolean;
  v_tr   boolean;
  v_h    text;
  v_b    text;
  v_a    text;
  v_c    text;
begin
  if auth.uid() is null or not public.can_manage_digital_menu(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_channel is null or p_channel not in ('delivery', 'pickup') then
    raise exception 'Canal inválido' using hint = 'field=channel';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Datos inválidos';
  end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if v_key not in ('cash_enabled', 'card_enabled', 'transfer_enabled', 'bank_holder',
                     'bank_name', 'bank_account', 'bank_card_number') then
      raise exception 'Campo no editable: %', v_key using hint = 'field=' || v_key;
    end if;
    if v_key like '%_enabled' and jsonb_typeof(p_data -> v_key) <> 'boolean' then
      raise exception 'Valor inválido' using hint = 'field=' || v_key;
    end if;
    if v_key like 'bank_%' and jsonb_typeof(p_data -> v_key) not in ('string', 'null') then
      raise exception 'Valor inválido' using hint = 'field=' || v_key;
    end if;
  end loop;

  select * into v_cur from public.payment_method_settings
  where restaurant_id = p_restaurant_id and channel = p_channel for update;

  v_cash := coalesce((p_data ->> 'cash_enabled')::boolean, v_cur.cash_enabled, true);
  v_card := coalesce((p_data ->> 'card_enabled')::boolean, v_cur.card_enabled, false);
  v_tr   := coalesce((p_data ->> 'transfer_enabled')::boolean, v_cur.transfer_enabled, false);
  v_h := case when p_data ? 'bank_holder' then nullif(btrim(p_data ->> 'bank_holder'), '') else v_cur.bank_holder end;
  v_b := case when p_data ? 'bank_name' then nullif(btrim(p_data ->> 'bank_name'), '') else v_cur.bank_name end;
  v_a := case when p_data ? 'bank_account' then nullif(btrim(p_data ->> 'bank_account'), '') else v_cur.bank_account end;
  v_c := case when p_data ? 'bank_card_number' then nullif(btrim(p_data ->> 'bank_card_number'), '') else v_cur.bank_card_number end;

  if not (v_cash or v_card or v_tr) then
    raise exception 'Deja al menos un método de pago activo' using hint = 'field=cash_enabled';
  end if;
  if v_tr and (v_h is null or v_b is null or (v_a is null and v_c is null)) then
    raise exception 'Para transferencia escribe titular, banco y cuenta o tarjeta' using hint = 'field=bank_holder';
  end if;
  if length(v_h) > 80 or length(v_b) > 80 or length(v_a) > 40 or length(v_c) > 25 then
    raise exception 'Algún dato bancario es demasiado largo' using hint = 'field=bank_account';
  end if;

  insert into public.payment_method_settings as s (
    restaurant_id, channel, cash_enabled, card_enabled, transfer_enabled,
    bank_holder, bank_name, bank_account, bank_card_number, updated_at
  )
  values (p_restaurant_id, p_channel, v_cash, v_card, v_tr, v_h, v_b, v_a, v_c, now())
  on conflict (restaurant_id, channel) do update
  set cash_enabled = excluded.cash_enabled, card_enabled = excluded.card_enabled,
      transfer_enabled = excluded.transfer_enabled, bank_holder = excluded.bank_holder,
      bank_name = excluded.bank_name, bank_account = excluded.bank_account,
      bank_card_number = excluded.bank_card_number, updated_at = now();

  -- Sin datos bancarios en la auditoría.
  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(), 'UPDATE', 'RESTAURANT', p_restaurant_id,
          jsonb_build_object('action', 'SET_PAYMENT_METHODS', 'channel', p_channel,
            'cash', v_cash, 'card', v_card, 'transfer', v_tr));

  return public.payment_methods_json(p_restaurant_id, true);
end;
$$;

-- El personal abre el pedido: deja de ser "Nuevo". No lo acepta.
create or replace function public.review_online_order(p_order_id uuid)
returns jsonb
language plpgsql
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
  if not found or not public.can_handle_online_orders(v_o.restaurant_id) then
    raise exception 'Pedido no encontrado o sin permiso';
  end if;
  if v_o.source is distinct from 'web' then
    raise exception 'No es un pedido en línea';
  end if;
  update public.orders set status_review = 'reviewed'
  where id = p_order_id and status_review = 'new';
  return jsonb_build_object('order_id', p_order_id, 'status_review', 'reviewed');
end;
$$;

-- Acepta el pedido en línea: confirma (si el cliente no lo hizo), lo manda a
-- cocina (PREPARING), suma el envío si se indica y abre la cuenta.
create or replace function public.accept_online_order(p_order_id uuid, p_shipping_cost numeric default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table_id uuid;
  v_o        public.orders%rowtype;
  v_billing  boolean;
  v_bill     public.bills%rowtype;
  v_ship     numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select table_id into v_table_id from public.orders where id = p_order_id;
  if v_table_id is null then
    raise exception 'Pedido no encontrado';
  end if;

  -- Orden de candados: mesa -> pedido.
  perform 1 from public.tables where id = v_table_id for update;
  select * into v_o from public.orders where id = p_order_id for update;

  if not public.can_handle_online_orders(v_o.restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_o.source is distinct from 'web' then
    raise exception 'No es un pedido en línea';
  end if;
  if v_o.status <> 'PENDING' then
    raise exception 'El pedido ya fue procesado (estado actual: %)', v_o.status;
  end if;
  if v_o.confirmed_at is null and v_o.expires_at <= now() then
    raise exception 'El pedido venció sin confirmarse' using hint = 'state=expired';
  end if;

  v_ship := v_o.shipping_cost;
  if p_shipping_cost is not null then
    if v_o.service_type <> 'delivery' then
      raise exception 'El envío solo aplica a domicilio' using hint = 'field=shipping_cost';
    end if;
    if p_shipping_cost < 0 or p_shipping_cost > 99999.99 then
      raise exception 'El costo de envío no es válido' using hint = 'field=shipping_cost';
    end if;
    v_ship := p_shipping_cost;
  end if;

  update public.orders
  set status = 'PREPARING', accepted_by = auth.uid(), accepted_at = now(), preparing_at = now(),
      confirmed_at = coalesce(confirmed_at, now()), status_review = 'reviewed',
      shipping_cost = v_ship, total = subtotal + coalesce(v_ship, 0)
  where id = v_o.id
  returning * into v_o;

  select billing_enabled into v_billing from public.restaurants where id = v_o.restaurant_id;
  if coalesce(v_billing, false) then
    select * into v_bill from public.bills
    where table_session_id = v_o.table_session_id and status <> 'VOID' limit 1;
    if v_bill.id is null then
      insert into public.bills (restaurant_id, table_id, table_session_id, opened_by)
      values (v_o.restaurant_id, v_o.table_id, v_o.table_session_id, auth.uid())
      returning * into v_bill;
      insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
      values (v_o.restaurant_id, auth.uid(), 'OPEN_BILL', 'BILL', v_bill.id,
              jsonb_build_object('bill_number', v_bill.bill_number, 'table_session_id', v_o.table_session_id,
                'source', 'web'));
    end if;
    v_bill := public.recompute_bill(v_bill.id);
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values
    (v_o.restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_o.id,
     jsonb_build_object('source', 'web', 'service_type', v_o.service_type)),
    (v_o.restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_o.id, null);

  return jsonb_build_object('order_id', v_o.id, 'status', v_o.status, 'total', v_o.total,
    'shipping_cost', v_o.shipping_cost, 'bill_id', v_bill.id, 'bill_number', v_bill.bill_number,
    'preferred_payment_method', v_o.preferred_payment_method, 'pays_with_amount', v_o.pays_with_amount);
end;
$$;

create or replace function public.reject_online_order(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_table_id uuid;
  v_o        public.orders%rowtype;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select table_id into v_table_id from public.orders where id = p_order_id;
  if v_table_id is null then
    raise exception 'Pedido no encontrado';
  end if;
  perform 1 from public.tables where id = v_table_id for update;
  select * into v_o from public.orders where id = p_order_id for update;

  if not public.can_handle_online_orders(v_o.restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_o.source is distinct from 'web' then
    raise exception 'No es un pedido en línea';
  end if;
  if v_o.status <> 'PENDING' then
    raise exception 'El pedido ya fue procesado (estado actual: %)', v_o.status;
  end if;
  if length(v_reason) > 200 then
    raise exception 'El motivo admite hasta 200 caracteres' using hint = 'field=reason';
  end if;

  update public.orders
  set status = 'REJECTED', rejection_reason = v_reason, accepted_by = auth.uid(), status_review = 'reviewed'
  where id = v_o.id;

  perform public.close_online_order_session(v_o.table_session_id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_o.restaurant_id, auth.uid(), 'REJECT_ORDER', 'ORDER', v_o.id,
          jsonb_build_object('reason', v_reason, 'source', 'web'));

  return jsonb_build_object('order_id', v_o.id, 'status', 'REJECTED');
end;
$$;

revoke all on function public.get_digital_menu_settings(uuid) from public, anon;
revoke all on function public.set_digital_menu_whatsapp(uuid, text, text) from public, anon;
revoke all on function public.activate_digital_menu(uuid) from public, anon;
revoke all on function public.pause_digital_menu(uuid, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.resume_digital_menu(uuid) from public, anon;
revoke all on function public.save_delivery_settings(uuid, jsonb) from public, anon;
revoke all on function public.save_payment_method_settings(uuid, text, jsonb) from public, anon;
revoke all on function public.review_online_order(uuid) from public, anon;
revoke all on function public.accept_online_order(uuid, numeric) from public, anon;
revoke all on function public.reject_online_order(uuid, text) from public, anon;
grant execute on function public.get_digital_menu_settings(uuid) to authenticated, service_role;
grant execute on function public.set_digital_menu_whatsapp(uuid, text, text) to authenticated, service_role;
grant execute on function public.activate_digital_menu(uuid) to authenticated, service_role;
grant execute on function public.pause_digital_menu(uuid, text, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.resume_digital_menu(uuid) to authenticated, service_role;
grant execute on function public.save_delivery_settings(uuid, jsonb) to authenticated, service_role;
grant execute on function public.save_payment_method_settings(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.review_online_order(uuid) to authenticated, service_role;
grant execute on function public.accept_online_order(uuid, numeric) to authenticated, service_role;
grant execute on function public.reject_online_order(uuid, text) to authenticated, service_role;

-- ======================= f) vencimiento programado ==========================
-- Solo si pg_cron está instalado (no se instala aquí). Sin él, el vencimiento
-- ocurre de forma perezosa en place_online_order y el estado público ya
-- muestra "expired" en cuanto pasa expires_at.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'monky-expire-online-orders';
    perform cron.schedule('monky-expire-online-orders', '*/5 * * * *',
                          'select public.expire_online_orders()');
  end if;
end $$;
