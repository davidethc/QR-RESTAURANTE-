-- ---------------------------------------------------------------------------
-- M13 · Promociones (EXPAND). Spec: docs/pos-spec/M13-promociones.md.
-- Contrato para los siguientes agentes: docs/pos-spec/tanda4-db.md.
--
-- Qué agrega:
--   a) Tabla promotions (descuento % / monto fijo, y "Compra X lleva Y"),
--      activación por días de la semana O por rango de fechas, canales con la
--      misma forma que products.service_options. Escritura solo por RPC
--      (save_promotion / delete_promotion): OWNER, ADMIN o roles[] ADMIN /
--      MENU_MANAGER. Lectura por RLS para miembros del restaurante.
--   b) Motor de precio en el servidor:
--        restaurant_local_date  fecha local de la sucursal (restaurants.timezone).
--        promotion_runs_on      vigencia por día local (fin inclusivo).
--        promotion_channel_ok   canal habilitado en service_options.
--        line_promotions        mejores promos aplicables a una línea (snapshot).
--        promo_line_discount    descuento de la línea a partir del snapshot.
--   c) build_order_lines(restaurant, items, channel) (sobrecarga NUEVA de 3
--      argumentos). La de 2 argumentos queda como envoltorio con canal null =
--      SIN promociones (comportamiento anterior intacto).
--      Por línea: unit_price sigue siendo el precio de lista
--      (variante + personalizaciones); promo_discount es el descuento total de
--      la línea; subtotal = unit_price × quantity − promo_discount (neto).
--      orders.subtotal/total y bills suman el neto, así que el descuento de
--      promoción ya viene dentro de bills.subtotal (no es un bill_discount).
--   d) order_items.promo_discount (default 0) y order_items.promotions (snapshot
--      jsonb de las reglas aplicadas). insert_order_lines los persiste.
--   e) Las RPC que crean pedidos pasan su canal (cambio de UNA línea en cada
--      una, cuerpo copiado de la última migración del repo):
--        create_customer_order  digital_menu.tables
--        create_staff_order     pos.tables
--        add_ticket             pos.tables
--        create_counter_order   pos.<p_service_type>
--        create_counter_sale    pos.takeaway
--        add_items_to_bill      session_price_channel(sesión)
--      edit_order_item recalcula el descuento con el snapshot de la línea
--      (no con las promos vigentes al editar).
--   f) bill_json: por línea promo_discount / promotions / list_subtotal, y a
--      nivel cuenta promo_discount_total.
--
-- Reglas de cálculo (M13 §5), por línea y por unidad de la variante:
--   descuento: percent -> round(precio_variante × valor / 100, 2)
--              fixed   -> least(valor, precio_variante)
--              Las personalizaciones NO se descuentan.
--   compra X lleva Y (receive_qty = X, buy_qty = Y): de cada X unidades se
--              regalan X − Y; la unidad regalada vale el precio de la variante
--              YA descontado por el porcentaje/monto (el % va primero).
--              Las personalizaciones de las unidades regaladas se cobran.
--   promo_discount = round(desc_unit × qty + regaladas × (variante − desc_unit), 2)
--   Ej. M13 §11: 2 × $2.50 con 10% y 2x1 -> 0.25×2 + 1×2.25 = 2.75; neto 2.25.
--   Varias promos del mismo tipo: gana la de mayor beneficio para esa línea
--   (empate: la más antigua, luego id). Nunca se suman dos del mismo tipo.
--   Compra X lleva Y se cuenta por línea (no junta líneas del mismo producto).
--
-- Rollback: reaplicar las funciones desde 20261022040000 / 20261022120000 /
-- 20261023140000 / 20261023150000 / 20261023160000 y drop de las nuevas.
-- Las columnas y la tabla nuevas son inofensivas.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ======================= a) tabla promotions ================================
create table if not exists public.promotions (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants (id) on delete cascade,
  name            text not null,
  type            text not null,
  value_type      text,
  value           numeric(10,2),
  receive_qty     integer,
  buy_qty         integer,
  applies_to      text not null,
  target_ids      uuid[] not null,
  weekdays        integer[],
  starts_on       date,
  ends_on         date,
  service_options jsonb not null default
    '{"pos":{"tables":true,"dine_in_no_table":true,"takeaway":true,"delivery":true},"digital_menu":{"tables":true,"pickup":true,"delivery":true}}'::jsonb,
  status          text not null default 'active',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint promotions_name_len check (length(btrim(name)) between 1 and 80),
  constraint promotions_type_valid check (type in ('discount', 'buy_x_get_y')),
  constraint promotions_status_valid check (status in ('active', 'paused')),
  constraint promotions_applies_to_valid check (applies_to in ('products', 'categories')),
  constraint promotions_targets_valid check (
    cardinality(target_ids) between 1 and 500 and array_position(target_ids, null) is null),
  constraint promotions_discount_shape check (
    type <> 'discount' or (
      value_type in ('percent', 'fixed') and value > 0
      and (value_type <> 'percent' or value <= 100)
      and value <= 99999.99
      and receive_qty is null and buy_qty is null)),
  constraint promotions_bxgy_shape check (
    type <> 'buy_x_get_y' or (
      value_type is null and value is null
      and receive_qty between 2 and 99 and buy_qty >= 1 and buy_qty < receive_qty
      and weekdays is not null)),
  constraint promotions_activation_one check (
    (weekdays is not null and starts_on is null and ends_on is null
      and cardinality(weekdays) between 1 and 7
      and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]
      and array_position(weekdays, null) is null)
    or
    (weekdays is null and starts_on is not null and ends_on is not null and ends_on >= starts_on)),
  constraint promotions_service_options_shape check (
    jsonb_typeof(service_options) = 'object'
    and jsonb_typeof(service_options -> 'pos') is not distinct from 'object'
    and jsonb_typeof(service_options -> 'digital_menu') is not distinct from 'object')
);

comment on table public.promotions is
  'M13: promociones. type discount (value_type percent|fixed, value) o buy_x_get_y (receive_qty X, buy_qty Y: de cada X se cobran Y). Activación: weekdays (0=domingo..6) o starts_on..ends_on (fin inclusivo, hora local). buy_x_get_y solo con weekdays.';
comment on column public.promotions.target_ids is 'M13: ids de products o categories del mismo restaurante (según applies_to). Validado en save_promotion.';
comment on column public.promotions.status is 'M13: active | paused. "Activa" además exige vigencia del día local (no persistido).';

create index if not exists promotions_restaurant_status_idx on public.promotions (restaurant_id, status);
create index if not exists promotions_target_ids_gin on public.promotions using gin (target_ids);

alter table public.promotions enable row level security;

drop policy if exists promotions_select_members on public.promotions;
create policy promotions_select_members on public.promotions
  for select to authenticated
  using (public.user_belongs_to_restaurant(restaurant_id));

revoke all on table public.promotions from public, anon, authenticated;
grant select on table public.promotions to authenticated;
grant all on table public.promotions to service_role;

-- ======================= d) columnas de línea ===============================
alter table public.order_items
  add column if not exists promo_discount numeric(10,2) not null default 0,
  add column if not exists promotions jsonb;

alter table public.order_items
  drop constraint if exists order_items_promo_discount_valid,
  drop constraint if exists order_items_promotions_array;
alter table public.order_items
  add constraint order_items_promo_discount_valid check (promo_discount >= 0),
  add constraint order_items_promotions_array check (promotions is null or jsonb_typeof(promotions) = 'array');

comment on column public.order_items.promo_discount is
  'M13: descuento total de promociones de la línea. subtotal = unit_price × quantity − promo_discount.';
comment on column public.order_items.promotions is
  'M13: snapshot de las promociones aplicadas [{id,name,type,value_type,value,receive_qty,buy_qty}]; null si ninguna.';

-- order_items tiene SELECT por columna para authenticated en algunos entornos.
grant select (promo_discount, promotions) on public.order_items to authenticated;

-- ======================= b) motor de precio =================================
create or replace function public.restaurant_local_date(p_restaurant_id uuid, p_at timestamptz default now())
returns date
language sql
stable
security definer
set search_path to ''
as $$
  select (p_at at time zone r.timezone)::date
  from public.restaurants r
  where r.id = p_restaurant_id;
$$;

create or replace function public.promotion_runs_on(
  p_weekdays integer[], p_starts_on date, p_ends_on date, p_local_date date
)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(
    case
      when p_weekdays is not null then extract(dow from p_local_date)::integer = any (p_weekdays)
      else p_local_date between p_starts_on and p_ends_on
    end, false);
$$;

-- Canal: 'pos.tables' | 'pos.dine_in_no_table' | 'pos.takeaway' | 'pos.delivery'
-- | 'digital_menu.tables' | 'digital_menu.pickup' | 'digital_menu.delivery'.
create or replace function public.promotion_channel_ok(p_service_options jsonb, p_channel text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_channel is not null
    and coalesce((p_service_options #>> string_to_array(p_channel, '.')) = 'true', false);
$$;

create or replace function public.price_channel_valid(p_channel text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_channel in ('pos.tables', 'pos.dine_in_no_table', 'pos.takeaway', 'pos.delivery',
                       'digital_menu.tables', 'digital_menu.pickup', 'digital_menu.delivery');
$$;

-- Snapshot de las promos que aplican a una línea: a lo sumo una de cada tipo,
-- la de mayor beneficio para ESTA línea (empate: created_at, id).
create or replace function public.line_promotions(
  p_restaurant_id uuid,
  p_product_id uuid,
  p_category_id uuid,
  p_variant_price numeric,
  p_quantity integer,
  p_channel text,
  p_local_date date
)
returns jsonb
language sql
stable
set search_path to ''
as $$
  with c as (
    select p.*,
      case
        when p.type = 'discount' then
          case p.value_type
            when 'percent' then round(p_variant_price * p.value / 100, 2)
            else least(p.value, p_variant_price)
          end
        else ((p_quantity / p.receive_qty) * (p.receive_qty - p.buy_qty))::numeric
      end as benefit
    from public.promotions p
    where p.restaurant_id = p_restaurant_id
      and p.status = 'active'
      and public.promotion_runs_on(p.weekdays, p.starts_on, p.ends_on, p_local_date)
      and public.promotion_channel_ok(p.service_options, p_channel)
      and (
        (p.applies_to = 'products' and p_product_id = any (p.target_ids))
        or (p.applies_to = 'categories' and p_category_id is not null and p_category_id = any (p.target_ids))
      )
  ), best as (
    select distinct on (type) *
    from c
    where benefit > 0
    order by type, benefit desc, created_at, id
  )
  select jsonb_agg(jsonb_build_object(
           'id', id, 'name', name, 'type', type, 'value_type', value_type, 'value', value,
           'receive_qty', receive_qty, 'buy_qty', buy_qty)
         order by type)
  from best;
$$;

-- Descuento total de una línea a partir del snapshot (determinista, sin tablas).
create or replace function public.promo_line_discount(
  p_variant_price numeric, p_quantity integer, p_promos jsonb
)
returns numeric
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_p         jsonb;
  v_unit_disc numeric(10,2) := 0;
  v_free      integer := 0;
  v_recv      integer;
  v_buy       integer;
begin
  if p_promos is null or jsonb_typeof(p_promos) <> 'array'
     or p_variant_price is null or p_variant_price <= 0
     or p_quantity is null or p_quantity < 1 then
    return 0;
  end if;

  for v_p in select * from jsonb_array_elements(p_promos) loop
    if v_p ->> 'type' = 'discount' then
      v_unit_disc := greatest(v_unit_disc,
        case v_p ->> 'value_type'
          when 'percent' then round(p_variant_price * (v_p ->> 'value')::numeric / 100, 2)
          when 'fixed' then least((v_p ->> 'value')::numeric, p_variant_price)
          else 0
        end);
    elsif v_p ->> 'type' = 'buy_x_get_y' then
      v_recv := (v_p ->> 'receive_qty')::integer;
      v_buy  := (v_p ->> 'buy_qty')::integer;
      if v_recv >= 2 and v_buy >= 1 and v_buy < v_recv then
        v_free := greatest(v_free, (p_quantity / v_recv) * (v_recv - v_buy));
      end if;
    end if;
  end loop;

  v_unit_disc := least(v_unit_disc, p_variant_price);

  return least(
    round(v_unit_disc * p_quantity + v_free * (p_variant_price - v_unit_disc), 2),
    p_variant_price * p_quantity);
end;
$$;

-- Canal de precio de una sesión ya abierta (add_items_to_bill).
create or replace function public.session_price_channel(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when ts.table_kind <> 'COUNTER' then 'pos.tables'
    else 'pos.' || coalesce((
      select o.service_type
      from public.orders o
      where o.table_session_id = ts.id
        and o.service_type in ('dine_in_no_table', 'takeaway', 'delivery')
      order by o.created_at
      limit 1), 'takeaway')
  end
  from public.table_sessions ts
  where ts.id = p_session_id;
$$;

revoke all on function public.restaurant_local_date(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.promotion_runs_on(integer[], date, date, date) from public, anon, authenticated;
revoke all on function public.promotion_channel_ok(jsonb, text) from public, anon, authenticated;
revoke all on function public.price_channel_valid(text) from public, anon, authenticated;
revoke all on function public.line_promotions(uuid, uuid, uuid, numeric, integer, text, date) from public, anon, authenticated;
revoke all on function public.promo_line_discount(numeric, integer, jsonb) from public, anon, authenticated;
revoke all on function public.session_price_channel(uuid) from public, anon, authenticated;
grant execute on function public.restaurant_local_date(uuid, timestamptz) to service_role;
grant execute on function public.promotion_runs_on(integer[], date, date, date) to service_role;
grant execute on function public.promotion_channel_ok(jsonb, text) to service_role;
grant execute on function public.price_channel_valid(text) to service_role;
grant execute on function public.line_promotions(uuid, uuid, uuid, numeric, integer, text, date) to service_role;
grant execute on function public.promo_line_discount(numeric, integer, jsonb) to service_role;
grant execute on function public.session_price_channel(uuid) to service_role;

-- ======================= a) RPC de administración ===========================
create or replace function public.can_manage_menu(p_restaurant_id uuid)
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
      and (rm.role in ('OWNER', 'ADMIN') or rm.roles && array['ADMIN', 'MENU_MANAGER']::text[])
  );
$$;

revoke all on function public.can_manage_menu(uuid) from public, anon;
grant execute on function public.can_manage_menu(uuid) to authenticated, service_role;

-- p_data: {name, type, value_type?, value?, receive_qty?, buy_qty?, applies_to,
--          target_ids[], weekdays[]? | starts_on?+ends_on?, service_options?, status?}
-- Crea (p_promotion_id null) o reemplaza todos los campos (p_promotion_id).
create or replace function public.save_promotion(
  p_restaurant_id uuid,
  p_data jsonb,
  p_promotion_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name     text;
  v_type     text;
  v_vtype    text;
  v_value    numeric(10,2);
  v_recv     integer;
  v_buy      integer;
  v_applies  text;
  v_targets  uuid[];
  v_days     integer[];
  v_start    date;
  v_end      date;
  v_status   text;
  v_so       jsonb := '{"pos":{"tables":true,"dine_in_no_table":true,"takeaway":true,"delivery":true},"digital_menu":{"tables":true,"pickup":true,"delivery":true}}'::jsonb;
  v_grp      text;
  v_key      text;
  v_val      jsonb;
  v_found    integer;
  v_today    date;
  v_old      public.promotions%rowtype;
  v_row      public.promotions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_restaurant_id is null or not public.can_manage_menu(p_restaurant_id) then
    raise exception 'No autorizado para gestionar promociones' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Datos de la promoción inválidos';
  end if;

  if p_promotion_id is not null then
    select * into v_old from public.promotions
    where id = p_promotion_id and restaurant_id = p_restaurant_id
    for update;
    if not found then
      raise exception 'Promoción no encontrada';
    end if;
  end if;

  v_name := nullif(btrim(coalesce(p_data ->> 'name', '')), '');
  if v_name is null or length(v_name) > 80 then
    raise exception 'Escribe un nombre de hasta 80 caracteres' using hint = 'field=name';
  end if;

  v_type := p_data ->> 'type';
  if v_type is null or v_type not in ('discount', 'buy_x_get_y') then
    raise exception 'Elige el tipo de promoción' using hint = 'field=type';
  end if;

  if v_type = 'discount' then
    v_vtype := p_data ->> 'value_type';
    if v_vtype is null or v_vtype not in ('percent', 'fixed') then
      raise exception 'Elige porcentaje o monto fijo' using hint = 'field=value_type';
    end if;
    begin
      v_value := (p_data ->> 'value')::numeric;
    exception when others then
      raise exception 'El valor del descuento no es válido' using hint = 'field=value';
    end;
    if v_value is null or v_value <= 0 or v_value > 99999.99
       or (v_vtype = 'percent' and v_value > 100) then
      raise exception 'El valor del descuento no es válido' using hint = 'field=value';
    end if;
  else
    begin
      v_recv := (p_data ->> 'receive_qty')::integer;
      v_buy  := (p_data ->> 'buy_qty')::integer;
    exception when others then
      raise exception 'Cantidades inválidas' using hint = 'field=receive_qty';
    end;
    if v_recv is null or v_recv < 2 or v_recv > 99 then
      raise exception 'La cantidad a recibir debe estar entre 2 y 99' using hint = 'field=receive_qty';
    end if;
    if v_buy is null or v_buy < 1 or v_buy >= v_recv then
      raise exception 'La cantidad a pagar debe ser menor que la que se recibe' using hint = 'field=buy_qty';
    end if;
  end if;

  v_applies := p_data ->> 'applies_to';
  if v_applies is null or v_applies not in ('products', 'categories') then
    raise exception 'Elige si aplica a productos o categorías' using hint = 'field=applies_to';
  end if;

  if jsonb_typeof(p_data -> 'target_ids') is distinct from 'array' then
    raise exception 'Elige al menos un producto o categoría' using hint = 'field=target_ids';
  end if;
  begin
    select array_agg(distinct (t #>> '{}')::uuid) into v_targets
    from jsonb_array_elements(p_data -> 'target_ids') t;
  exception when others then
    raise exception 'Selección inválida' using hint = 'field=target_ids';
  end;
  if v_targets is null or cardinality(v_targets) = 0 or array_position(v_targets, null) is not null then
    raise exception 'Elige al menos un producto o categoría' using hint = 'field=target_ids';
  end if;
  if cardinality(v_targets) > 500 then
    raise exception 'Demasiados elementos (máximo 500)' using hint = 'field=target_ids';
  end if;

  if v_applies = 'products' then
    select count(*) into v_found from public.products
    where id = any (v_targets) and restaurant_id = p_restaurant_id;
  else
    select count(*) into v_found from public.categories
    where id = any (v_targets) and restaurant_id = p_restaurant_id;
  end if;
  if v_found <> cardinality(v_targets) then
    raise exception 'Uno de los elementos elegidos no existe' using hint = 'field=target_ids';
  end if;

  -- Activación: exactamente una forma.
  if (p_data ? 'weekdays' and jsonb_typeof(p_data -> 'weekdays') = 'array')
     = (coalesce(p_data ->> 'starts_on', p_data ->> 'ends_on') is not null) then
    raise exception 'Elige días de la semana o un rango de fechas' using hint = 'field=activation';
  end if;

  v_today := public.restaurant_local_date(p_restaurant_id);

  if jsonb_typeof(p_data -> 'weekdays') = 'array' then
    begin
      select array_agg(distinct (d #>> '{}')::integer order by (d #>> '{}')::integer) into v_days
      from jsonb_array_elements(p_data -> 'weekdays') d;
    exception when others then
      raise exception 'Días inválidos' using hint = 'field=weekdays';
    end;
    if v_days is null or cardinality(v_days) = 0 then
      raise exception 'Elige al menos un día' using hint = 'field=weekdays';
    end if;
    if not (v_days <@ array[0, 1, 2, 3, 4, 5, 6]) then
      raise exception 'Días inválidos' using hint = 'field=weekdays';
    end if;
  else
    if v_type = 'buy_x_get_y' then
      raise exception 'Compra X lleva Y solo se activa por días de la semana' using hint = 'field=weekdays';
    end if;
    begin
      v_start := (p_data ->> 'starts_on')::date;
      v_end   := (p_data ->> 'ends_on')::date;
    exception when others then
      raise exception 'Fechas inválidas' using hint = 'field=starts_on';
    end;
    if v_start is null or v_end is null then
      raise exception 'Elige la fecha de inicio y la de fin' using hint = 'field=starts_on';
    end if;
    if v_end < v_start then
      raise exception 'La fecha de fin no puede ser anterior a la de inicio' using hint = 'field=ends_on';
    end if;
    -- Días pasados deshabilitados: una promo nueva o con fechas cambiadas no
    -- puede terminar antes de hoy (hora local).
    if v_end < v_today and (v_old.id is null or v_old.ends_on is distinct from v_end) then
      raise exception 'La fecha de fin ya pasó' using hint = 'field=ends_on';
    end if;
  end if;

  -- Canales: se parte de todo true y solo se aceptan booleanos conocidos.
  if p_data ? 'service_options' and jsonb_typeof(p_data -> 'service_options') <> 'null' then
    if jsonb_typeof(p_data -> 'service_options') <> 'object' then
      raise exception 'Canales inválidos' using hint = 'field=service_options';
    end if;
    for v_grp, v_val in select * from jsonb_each(p_data -> 'service_options') loop
      if v_grp not in ('pos', 'digital_menu') or jsonb_typeof(v_val) <> 'object' then
        raise exception 'Canal no permitido: %', v_grp using hint = 'field=service_options';
      end if;
      for v_key in select jsonb_object_keys(v_val) loop
        if not (v_so -> v_grp ? v_key) or jsonb_typeof(v_val -> v_key) <> 'boolean' then
          raise exception 'Canal no permitido: %.%', v_grp, v_key using hint = 'field=service_options';
        end if;
        v_so := jsonb_set(v_so, array[v_grp, v_key], v_val -> v_key);
      end loop;
    end loop;
  end if;

  v_status := coalesce(p_data ->> 'status', 'active');
  if v_status not in ('active', 'paused') then
    raise exception 'Estado inválido' using hint = 'field=status';
  end if;

  if v_old.id is null then
    insert into public.promotions (
      restaurant_id, name, type, value_type, value, receive_qty, buy_qty, applies_to,
      target_ids, weekdays, starts_on, ends_on, service_options, status, created_by
    )
    values (
      p_restaurant_id, v_name, v_type, v_vtype, v_value, v_recv, v_buy, v_applies,
      v_targets, v_days, v_start, v_end, v_so, v_status, auth.uid()
    )
    returning * into v_row;
  else
    update public.promotions
    set name = v_name, type = v_type, value_type = v_vtype, value = v_value,
        receive_qty = v_recv, buy_qty = v_buy, applies_to = v_applies, target_ids = v_targets,
        weekdays = v_days, starts_on = v_start, ends_on = v_end, service_options = v_so,
        status = v_status, updated_at = now()
    where id = v_old.id
    returning * into v_row;
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (p_restaurant_id, auth.uid(),
          case when v_old.id is null then 'CREATE' else 'UPDATE' end::public.audit_action,
          'PROMOTION', v_row.id,
          jsonb_build_object('name', v_row.name, 'type', v_row.type, 'value_type', v_row.value_type,
            'value', v_row.value, 'receive_qty', v_row.receive_qty, 'buy_qty', v_row.buy_qty,
            'status', v_row.status));

  return to_jsonb(v_row);
end;
$$;

create or replace function public.delete_promotion(p_promotion_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row public.promotions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select * into v_row from public.promotions where id = p_promotion_id for update;
  if not found or not public.can_manage_menu(v_row.restaurant_id) then
    raise exception 'Promoción no encontrada o sin permiso';
  end if;

  -- Las líneas ya creadas conservan su snapshot (order_items.promotions).
  delete from public.promotions where id = v_row.id;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_row.restaurant_id, auth.uid(), 'DELETE', 'PROMOTION', v_row.id,
          jsonb_build_object('name', v_row.name, 'type', v_row.type));
end;
$$;

-- Etiqueta corta para la carta y el POS: "-10%", "-$1.50", "2x1".
create or replace function public.promotion_label(
  p_type text, p_value_type text, p_value numeric, p_receive integer, p_buy integer
)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when p_type = 'buy_x_get_y' then p_receive::text || 'x' || p_buy::text
    when p_value_type = 'percent' then '-' || trim_scale(p_value)::text || '%'
    else '-$' || to_char(p_value, 'FM999990.00')
  end;
$$;

-- Promos vigentes HOY (hora local) para un restaurante; con p_channel solo las
-- de ese canal. Para el selector de productos del POS/mesero.
create or replace function public.get_active_promotions(p_restaurant_id uuid, p_channel text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_today date;
begin
  if auth.uid() is null or not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_channel is not null and not public.price_channel_valid(p_channel) then
    raise exception 'Canal inválido';
  end if;
  v_today := public.restaurant_local_date(p_restaurant_id);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'type', p.type, 'value_type', p.value_type, 'value', p.value,
      'receive_qty', p.receive_qty, 'buy_qty', p.buy_qty, 'applies_to', p.applies_to,
      'target_ids', to_jsonb(p.target_ids), 'service_options', p.service_options,
      'label', public.promotion_label(p.type, p.value_type, p.value, p.receive_qty, p.buy_qty))
      order by p.created_at, p.id)
    from public.promotions p
    where p.restaurant_id = p_restaurant_id
      and p.status = 'active'
      and public.promotion_runs_on(p.weekdays, p.starts_on, p.ends_on, v_today)
      and (p_channel is null or public.promotion_channel_ok(p.service_options, p_channel))
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.save_promotion(uuid, jsonb, uuid) from public, anon;
revoke all on function public.delete_promotion(uuid) from public, anon;
revoke all on function public.promotion_label(text, text, numeric, integer, integer) from public, anon;
revoke all on function public.get_active_promotions(uuid, text) from public, anon;
grant execute on function public.save_promotion(uuid, jsonb, uuid) to authenticated, service_role;
grant execute on function public.delete_promotion(uuid) to authenticated, service_role;
grant execute on function public.promotion_label(text, text, numeric, integer, integer) to authenticated, service_role;
grant execute on function public.get_active_promotions(uuid, text) to authenticated, service_role;

-- ======================= c) build_order_lines con canal =====================
-- Cuerpo de 20261022040000_m04_modifiers_edit_reopen.sql + canal y promociones.
create or replace function public.build_order_lines(p_restaurant_id uuid, p_items jsonb, p_channel text)
returns jsonb
language plpgsql
stable
set search_path to ''
as $$
declare
  v_item       jsonb;
  v_product    public.products%rowtype;
  v_product_id uuid;
  v_variant    public.product_variants%rowtype;
  v_variant_id uuid;
  v_unit_price numeric(10,2);
  v_quantity   integer;
  v_notes      text;
  v_lines      jsonb := '[]'::jsonb;
  v_subtotal   numeric(10,2) := 0;
  v_mod        jsonb;
  v_opt_id     uuid;
  v_qty        integer;
  v_opt        record;
  v_mods       jsonb;
  v_mods_total numeric(10,2);
  v_seen       uuid[];
  v_grp        record;
  v_sum        integer;
  v_local_date date;
  v_promos     jsonb;
  v_disc       numeric(10,2);
begin
  -- M13: canal de precio. null = sin promociones (comportamiento anterior).
  if p_channel is not null then
    if not public.price_channel_valid(p_channel) then
      raise exception 'Canal de pedido inválido';
    end if;
    v_local_date := public.restaurant_local_date(p_restaurant_id);
  end if;

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
      v_variant_id := (v_item ->> 'variant_id')::uuid;  -- opcional
    exception when others then
      raise exception 'Producto inválido en el pedido';
    end;

    if v_product_id is null then
      raise exception 'Producto inválido en el pedido';
    end if;

    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'La cantidad debe estar entre 1 y 99';
    end if;

    if v_item ? 'variant_id'
       and jsonb_typeof(v_item -> 'variant_id') not in ('string', 'null') then
      raise exception 'Producto inválido en el pedido';
    end if;

    if v_item ? 'notes'
       and jsonb_typeof(v_item -> 'notes') not in ('string', 'null') then
      raise exception 'Producto inválido en el pedido';
    end if;

    if length(btrim(coalesce(v_item ->> 'notes', ''))) > 200 then
      raise exception 'La nota de un producto admite hasta 200 caracteres';
    end if;

    if v_item ? 'modifiers' then
      if jsonb_typeof(v_item -> 'modifiers') not in ('array', 'null') then
        raise exception 'Personalizaciones inválidas';
      end if;
      if jsonb_typeof(v_item -> 'modifiers') = 'array'
         and jsonb_array_length(v_item -> 'modifiers') > 30 then
        raise exception 'Demasiadas personalizaciones en un producto (máximo 30)';
      end if;
    end if;
  end loop;

  -- Segunda pasada: producto y precio del servidor.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity   := (v_item ->> 'quantity')::integer;
    v_notes      := nullif(btrim(coalesce(v_item ->> 'notes', '')), '');
    v_variant_id := (v_item ->> 'variant_id')::uuid;

    select * into v_product
    from public.products
    where id = v_product_id
      and restaurant_id = p_restaurant_id
      and active = true
      and available = true;

    if not found then
      raise exception 'Uno de los productos no está disponible';
    end if;

    -- M12: el menú digital de domicilio/recoger respeta service_options del
    -- producto. Los canales existentes no cambian de comportamiento.
    if p_channel in ('digital_menu.delivery', 'digital_menu.pickup')
       and not public.promotion_channel_ok(v_product.service_options, p_channel) then
      raise exception 'Uno de los productos no está disponible para este tipo de pedido';
    end if;

    v_variant    := null;

    -- Con variant_id: la variante debe ser de ESTE producto (que ya es del
    -- restaurante) y se cobra su precio. Sin variant_id: si el producto tiene
    -- exactamente 1 variante se usa esa; con 0 o más de 1 hay que elegir.
    if v_variant_id is not null then
      select * into v_variant
      from public.product_variants
      where id = v_variant_id
        and product_id = v_product.id;

      if not found then
        raise exception 'La variante elegida no corresponde al producto';
      end if;
    else
      if (select count(*) from public.product_variants where product_id = v_product.id) <> 1 then
        raise exception 'Elige una variante';
      end if;
      select * into v_variant
      from public.product_variants
      where product_id = v_product.id;
    end if;

    if exists (
      select 1 from public.availability a
      where a.item_type = 'variant'
        and a.item_id = v_variant.id
        and a.available = false
    ) then
      raise exception 'Uno de los productos no está disponible';
    end if;

    v_unit_price := v_variant.price;

    -- Personalizaciones (opcional). Precio y reglas salen de la base.
    v_mods       := '[]'::jsonb;
    v_mods_total := 0;
    v_seen       := '{}';

    if jsonb_typeof(v_item -> 'modifiers') = 'array' then
      for v_mod in select * from jsonb_array_elements(v_item -> 'modifiers') loop
        if jsonb_typeof(v_mod) <> 'object' then
          raise exception 'Personalizaciones inválidas';
        end if;
        begin
          v_opt_id := (v_mod ->> 'option_id')::uuid;
          v_qty    := coalesce((v_mod ->> 'qty')::integer, 1);
        exception when others then
          raise exception 'Personalizaciones inválidas';
        end;
        if v_opt_id is null or v_qty is null or v_qty < 1 or v_qty > 99 then
          raise exception 'Personalizaciones inválidas';
        end if;
        if v_opt_id = any (v_seen) then
          raise exception 'Personalización repetida: usa la cantidad de la opción';
        end if;
        v_seen := v_seen || v_opt_id;

        select o.id, o.name as option_name, o.price, g.id as group_id, g.name as group_name,
               g.allow_repeat
        into v_opt
        from public.modifier_options o
        join public.modifier_groups g on g.id = o.group_id
        join public.product_modifier_groups pmg
          on pmg.group_id = g.id and pmg.product_id = v_product.id
        where o.id = v_opt_id
          and g.restaurant_id = p_restaurant_id;

        if not found then
          raise exception 'Una personalización no corresponde al producto';
        end if;

        if exists (
          select 1 from public.availability a
          where a.item_type = 'modifier_option'
            and a.item_id = v_opt.id
            and a.available = false
        ) then
          raise exception 'Una personalización no está disponible';
        end if;

        if v_qty > 1 and not v_opt.allow_repeat then
          raise exception 'La personalización "%" no se puede repetir', v_opt.option_name;
        end if;

        if v_opt.price < 0 then
          raise exception 'Personalización inválida';
        end if;

        v_mods_total := v_mods_total + v_opt.price * v_qty;
        v_mods := v_mods || jsonb_build_array(jsonb_build_object(
          'option_id',  v_opt.id,
          'group_id',   v_opt.group_id,
          'group_name', v_opt.group_name,
          'name',       v_opt.option_name,
          'price',      v_opt.price,
          'qty',        v_qty
        ));
      end loop;

      -- min/max por cada grupo vinculado al producto (también los no elegidos).
      for v_grp in
        select g.id, g.name, g.min_select, g.max_select
        from public.product_modifier_groups pmg
        join public.modifier_groups g on g.id = pmg.group_id
        where pmg.product_id = v_product.id
          and g.restaurant_id = p_restaurant_id
      loop
        select coalesce(sum((m ->> 'qty')::integer), 0) into v_sum
        from jsonb_array_elements(v_mods) m
        where (m ->> 'group_id')::uuid = v_grp.id;

        if v_sum < v_grp.min_select then
          raise exception 'Elige al menos % en "%"', v_grp.min_select, v_grp.name;
        end if;
        if v_sum > v_grp.max_select then
          raise exception 'Elige como máximo % en "%"', v_grp.max_select, v_grp.name;
        end if;
      end loop;
    end if;

    v_unit_price := v_unit_price + v_mods_total;

    -- M13: promociones (solo con canal). Descuento sobre la variante.
    v_promos := null;
    v_disc   := 0;
    if p_channel is not null then
      v_promos := public.line_promotions(p_restaurant_id, v_product.id, v_product.category_id,
                                         v_variant.price, v_quantity, p_channel, v_local_date);
      v_disc   := public.promo_line_discount(v_variant.price, v_quantity, v_promos);
    end if;

    v_subtotal := v_subtotal + v_unit_price * v_quantity - v_disc;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',   v_product.id,
      'product_name', v_product.name,
      'quantity',     v_quantity,
      'unit_price',   v_unit_price,
      'subtotal',     v_unit_price * v_quantity - v_disc,
      'list_subtotal', v_unit_price * v_quantity,
      'promo_discount', v_disc,
      'promotions',   v_promos,
      'notes',        v_notes,
      'variant_id',   v_variant.id,
      'variant_name', nullif(v_variant.name, ''),
      'variant_price', v_variant.price,
      'modifiers',    v_mods
    ));
  end loop;

  return jsonb_build_object('subtotal', v_subtotal, 'lines', v_lines);
end;
$$;

comment on function public.build_order_lines(uuid, jsonb, text) is
  'M13: valida y valoriza con precios del servidor. unit_price = variante + Σ(opción × qty) (lista); con canal aplica promociones: subtotal = unit_price × quantity − promo_discount. Interna.';

-- La firma de 2 argumentos queda igual para cualquier llamador que no pase
-- canal: sin promociones, mismo resultado que antes (más llaves informativas).
create or replace function public.build_order_lines(p_restaurant_id uuid, p_items jsonb)
returns jsonb
language sql
stable
set search_path to ''
as $$
  select public.build_order_lines(p_restaurant_id, p_items, null::text);
$$;

comment on function public.build_order_lines(uuid, jsonb) is
  'Compatibilidad: build_order_lines(restaurante, items, null) — sin promociones. Interna.';

revoke all on function public.build_order_lines(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.build_order_lines(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.build_order_lines(uuid, jsonb, text) to service_role;
grant execute on function public.build_order_lines(uuid, jsonb) to service_role;

-- ======================= insert_order_lines (interna) ======================
create or replace function public.insert_order_lines(p_order_id uuid, p_ticket_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_l  jsonb;
  v_id uuid;
begin
  for v_l in select t.l from jsonb_array_elements(p_lines) with ordinality as t(l, n) order by t.n loop
    insert into public.order_items (
      order_id, ticket_id, product_id, product_name, quantity, unit_price, subtotal, notes,
      variant_id, variant_name, variant_price, promo_discount, promotions
    )
    values (
      p_order_id, p_ticket_id, (v_l ->> 'product_id')::uuid, v_l ->> 'product_name',
      (v_l ->> 'quantity')::integer, (v_l ->> 'unit_price')::numeric, (v_l ->> 'subtotal')::numeric,
      v_l ->> 'notes', (v_l ->> 'variant_id')::uuid, v_l ->> 'variant_name',
      (v_l ->> 'variant_price')::numeric,
      coalesce((v_l ->> 'promo_discount')::numeric, 0),
      case when jsonb_typeof(v_l -> 'promotions') = 'array' then v_l -> 'promotions' end
    )
    returning id into v_id;

    insert into public.order_item_options (
      order_item_id, option_name, value_name, price_modifier, modifier_option_id, qty
    )
    select v_id, m ->> 'group_name', m ->> 'name', (m ->> 'price')::numeric,
           (m ->> 'option_id')::uuid, (m ->> 'qty')::integer
    from jsonb_array_elements(coalesce(v_l -> 'modifiers', '[]'::jsonb)) m;
  end loop;
end;
$$;

revoke all on function public.insert_order_lines(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_order_lines(uuid, uuid, jsonb) to service_role;

-- ======================= e) llamadores: pasan su canal ======================
-- Cuerpos copiados sin cambios de la última migración del repo que define
-- cada función; la ÚNICA diferencia es el tercer argumento de
-- build_order_lines (y en edit_order_item, el recálculo del descuento).
-- CREATE OR REPLACE conserva dueño, SECURITY DEFINER y grants.

-- create_customer_order: cuerpo de 20261023140000_m11_qr_client.sql
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

  v_built := public.build_order_lines(v_session.restaurant_id, p_items, 'digital_menu.tables');  -- M13
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

-- create_staff_order: cuerpo de 20261022040000_m04_modifiers_edit_reopen.sql
create or replace function public.create_staff_order(
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
  v_built := public.build_order_lines(v_table.restaurant_id, p_items, 'pos.tables');  -- M13
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

  perform public.insert_order_lines(v_order_id, null, v_built -> 'lines');

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

-- add_ticket: cuerpo de 20261023150000_caja_cashier_orders.sql
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
  v_built := public.build_order_lines(v_table.restaurant_id, p_items, 'pos.tables');  -- M13
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

-- create_counter_order: cuerpo de 20261023150000_caja_cashier_orders.sql
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
  v_built := public.build_order_lines(v_restaurant_id, p_items, 'pos.' || p_service_type);  -- M13 (tipo ya validado)
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

-- create_counter_sale: cuerpo de 20261022120000_m07_payments.sql
create or replace function public.create_counter_sale(
  p_items jsonb,
  p_idempotency_key uuid,
  p_notes text default null,
  p_customer_label text default null,
  p_restaurant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
  v_count         integer;
  v_table         public.tables%rowtype;
  v_existing      uuid;
  v_replay        jsonb;
  v_label         text;
  v_notes         text;
  v_day           date;
  v_start         timestamptz;
  v_end           timestamptz;
  v_number        integer;
  v_session       public.table_sessions%rowtype;
  v_order_id      uuid;
  v_bill          public.bills%rowtype;
  v_item          jsonb;
  v_product_id    uuid;
  v_quantity      integer;
  v_item_notes    text;
  v_product       public.products%rowtype;
  v_subtotal      numeric(10,2) := 0;
  v_built         jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  -- Restaurante: el indicado o, si no viene, el único donde el usuario vende.
  if p_restaurant_id is null then
    select count(distinct rm.restaurant_id), min(rm.restaurant_id::text)::uuid
    into v_count, v_restaurant_id
    from public.restaurant_members rm
    where rm.user_id = auth.uid()
      and rm.status = 'ACTIVE'
      and rm.role in ('OWNER', 'ADMIN', 'WAITER');

    if v_count <> 1 then
      raise exception 'Indica el restaurante de la venta';
    end if;
  else
    v_restaurant_id := p_restaurant_id;
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para vender en mostrador';
  end if;

  -- La venta de mostrador nace con su cuenta: sin cobro no tiene sentido.
  if not coalesce((select billing_enabled from public.restaurants where id = v_restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  v_table := public.lock_counter_table(v_restaurant_id);

  -- Idempotencia (después del candado: un reintento concurrente espera y
  -- aquí ya ve la venta del primero).
  select id into v_existing
  from public.table_sessions
  where restaurant_id = v_restaurant_id
    and client_request_id = p_idempotency_key;

  if v_existing is not null then
    v_replay := public.counter_sale_json(v_existing, true);
    -- Venta cancelada (cuenta VOID): counter_sale_json no la encuentra.
    if v_replay is null then
      raise exception 'Esta venta ya fue cancelada';
    end if;
    return v_replay;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe contener productos';
  end if;

  v_label := nullif(btrim(coalesce(p_customer_label, '')), '');
  if length(v_label) > 40 then
    raise exception 'El nombre de la venta admite hasta 40 caracteres';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if length(v_notes) > 500 then
    raise exception 'Las notas admiten hasta 500 caracteres';
  end if;

  -- S2: precios, variantes y personalizaciones del servidor (build_order_lines).
  -- Máximo 50 líneas y cantidad 1-99 por línea (antes 100 y 999).
  v_built    := public.build_order_lines(v_restaurant_id, p_items, 'pos.takeaway');  -- M13
  v_subtotal := (v_built ->> 'subtotal')::numeric;

  -- "Para llevar #N": correlativo del día de negocio del restaurante.
  v_day := public.business_today(v_restaurant_id);

  select b.start_at, b.end_at into v_start, v_end
  from public.business_day_bounds(v_restaurant_id, v_day, v_day) b;

  select coalesce(max(ts.counter_number), 0) + 1 into v_number
  from public.table_sessions ts
  where ts.table_id = v_table.id
    and ts.table_kind = 'COUNTER'
    and ts.started_at >= v_start
    and ts.started_at < v_end;

  insert into public.table_sessions (
    restaurant_id, table_id, table_kind, counter_number, customer_label, client_request_id
  )
  values (
    v_restaurant_id, v_table.id, 'COUNTER', v_number, v_label, p_idempotency_key
  )
  returning * into v_session;

  -- Directo a preparación, igual que un pedido tomado por el personal.
  insert into public.orders (
    restaurant_id, table_id, table_session_id, status, subtotal, total, notes,
    accepted_by, accepted_at, preparing_at
  )
  values (
    v_restaurant_id, v_table.id, v_session.id, 'PREPARING', v_subtotal, v_subtotal, v_notes,
    auth.uid(), now(), now()
  )
  returning id into v_order_id;

  perform public.insert_order_lines(v_order_id, null, v_built -> 'lines');

  -- La cuenta se abre en el acto: la venta se cobra en el mostrador.
  insert into public.bills (restaurant_id, table_id, table_session_id, opened_by)
  values (v_restaurant_id, v_table.id, v_session.id, auth.uid())
  returning * into v_bill;

  v_bill := public.recompute_bill(v_bill.id);

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values
    (v_restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order_id,
     jsonb_build_object('counter_number', v_number)),
    (v_restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order_id, null),
    (v_restaurant_id, auth.uid(), 'OPEN_BILL', 'BILL', v_bill.id,
     jsonb_build_object(
       'bill_number', v_bill.bill_number,
       'table_session_id', v_session.id,
       'counter_number', v_number
     ));

  return public.counter_sale_json(v_session.id, false);
end;
$$;

-- add_items_to_bill: cuerpo de 20261022120000_m07_payments.sql
create or replace function public.add_items_to_bill(
  p_bill_id uuid,
  p_items jsonb,
  p_idempotency_key uuid,
  p_send_to_kitchen boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
  v_bill          public.bills%rowtype;
  v_session       public.table_sessions%rowtype;
  v_existing      public.orders%rowtype;
  v_item          jsonb;
  v_product       public.products%rowtype;
  v_product_id    uuid;
  v_quantity      integer;
  v_notes         text;
  v_lines         jsonb := '[]'::jsonb;
  v_subtotal      numeric(10,2) := 0;
  v_kitchen       boolean := coalesce(p_send_to_kitchen, false);
  v_order_id      uuid;
  v_built         jsonb;
begin
  -- 1. Sesión y clave.
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  -- 2. Restaurante (lectura sin candado), rol y cobro habilitado. Rol antes
  --    que nada más: a quien no cobra no se le dice cómo está la cuenta.
  select restaurant_id into v_restaurant_id from public.bills where id = p_bill_id;
  if v_restaurant_id is null then
    raise exception 'Cuenta no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_restaurant_id, 'ADMIN')
  ) then
    raise exception 'No autorizado para cobrar';
  end if;

  if not coalesce((select billing_enabled from public.restaurants where id = v_restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  -- 3. Forma de la carga (sin tocar productos todavía).
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Demasiados productos en una sola tanda (máximo 50 líneas)';
  end if;

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

  -- 4. Candado mesa -> cuenta (mismo orden que el trigger y open_bill).
  v_bill := public.lock_bill(p_bill_id);

  -- 5. Idempotencia, ya bajo el candado: un reintento concurrente con la
  --    misma clave espera aquí y ve el pedido del primero.
  select * into v_existing
  from public.orders
  where restaurant_id = v_restaurant_id
    and client_request_id = p_idempotency_key;

  if found then
    if v_existing.table_session_id is distinct from v_bill.table_session_id then
      raise exception 'La clave de idempotencia ya se usó en otra cuenta';
    end if;
    return public.bill_json(p_bill_id)
      || jsonb_build_object('replayed', true, 'added_order_id', v_existing.id);
  end if;

  -- 6. Estados, con el mensaje que el cajero necesita.
  if v_bill.status not in ('OPEN', 'PAID') then
    raise exception 'Esta cuenta ya se cerró: usa Venta rápida';
  end if;

  select * into v_session
  from public.table_sessions
  where id = v_bill.table_session_id;

  -- El trigger también lo rechazaría, pero con un mensaje pensado para el
  -- cliente del QR. Nunca se busca ni se crea otra sesión: el ítem se
  -- cobraría en una cuenta distinta.
  if v_session.status = 'EXPIRED' then
    raise exception 'La mesa lleva más de 4 h sin actividad: cobra lo pendiente y abre una venta nueva';
  elsif v_session.status is distinct from 'ACTIVE' then
    raise exception 'La sesión de esta mesa ya está cerrada: cobra lo pendiente y abre una venta nueva';
  end if;

  -- 7. Precios, variantes y personalizaciones del servidor (S2: build_order_lines).
  v_built    := public.build_order_lines(v_restaurant_id, p_items, public.session_price_channel(v_bill.table_session_id));  -- M13
  v_subtotal := (v_built ->> 'subtotal')::numeric;
  v_lines    := v_built -> 'lines';

  -- 8. Pedido en la sesión de la cuenta. El total queda fijo en el INSERT,
  --    antes de que el trigger recalcule la cuenta.
  if v_kitchen then
    insert into public.orders (
      restaurant_id, table_id, table_session_id, status, subtotal, total,
      accepted_by, accepted_at, preparing_at, client_request_id
    )
    values (
      v_restaurant_id, v_bill.table_id, v_bill.table_session_id, 'PREPARING',
      v_subtotal, v_subtotal, auth.uid(), now(), now(), p_idempotency_key
    )
    returning id into v_order_id;
  else
    insert into public.orders (
      restaurant_id, table_id, table_session_id, status, subtotal, total,
      accepted_by, delivered_at, client_request_id
    )
    values (
      v_restaurant_id, v_bill.table_id, v_bill.table_session_id, 'DELIVERED',
      v_subtotal, v_subtotal, auth.uid(), now(), p_idempotency_key
    )
    returning id into v_order_id;
  end if;

  -- 9. Ítems y personalizaciones (insert_order_lines; el trigger asigna la comanda).
  perform public.insert_order_lines(v_order_id, null, v_lines);

  -- 10. Recalcular explícito (idempotente): PAID vuelve a OPEN si sube el
  --     saldo y los descuentos PERCENT se ajustan a la base nueva.
  v_bill := public.recompute_bill(p_bill_id);

  -- 11. Auditoría.
  if v_kitchen then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id)
    values
      (v_restaurant_id, auth.uid(), 'ACCEPT_ORDER', 'ORDER', v_order_id),
      (v_restaurant_id, auth.uid(), 'START_PREPARING', 'ORDER', v_order_id);
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_restaurant_id, auth.uid(), 'ADD_BILL_ITEMS', 'BILL', v_bill.id,
    jsonb_build_object(
      'bill_number',     v_bill.bill_number,
      'order_id',        v_order_id,
      'items',           v_lines,
      'total',           v_subtotal,
      'send_to_kitchen', v_kitchen,
      'balance_after',   v_bill.balance
    )
  );

  return public.bill_json(p_bill_id)
    || jsonb_build_object('replayed', false, 'added_order_id', v_order_id);
end;
$$;

-- edit_order_item: cuerpo de 20261022040000_m04_modifiers_edit_reopen.sql
create or replace function public.edit_order_item(
  p_order_item_id uuid,
  p_variant_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order_id   uuid;
  v_table_id   uuid;
  v_table      public.tables%rowtype;
  v_order      public.orders%rowtype;
  v_item       public.order_items%rowtype;
  v_variant    public.product_variants%rowtype;
  v_bill_id    uuid;
  v_notes      text;
  v_mods_total numeric(10,2);
  v_new_unit   numeric(10,2);
  v_new_sub    numeric(10,2);
  v_delta      numeric(10,2);
  v_new_vid    uuid;
  v_new_vname  text;
  v_new_vprice numeric(10,2);
  v_changed    boolean := false;
  v_new_disc   numeric(10,2);
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

  -- Orden de candados: mesa -> pedido -> línea (igual que cancel_order_item).
  select * into v_table from public.tables where id = v_table_id for update;
  select * into v_order from public.orders where id = v_order_id for update;

  if not (
    public.user_has_restaurant_role(v_order.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_order.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para editar productos';
  end if;

  if p_variant_id is null and p_notes is null then
    raise exception 'No hay cambios que guardar';
  end if;
  if length(btrim(coalesce(p_notes, ''))) > 200 then
    raise exception 'La nota de un producto admite hasta 200 caracteres';
  end if;

  select * into v_item from public.order_items where id = p_order_item_id for update;
  if v_item.cancelled then
    raise exception 'El producto está cancelado';
  end if;
  if v_order.cancelled or v_order.status in ('REJECTED', 'CANCELLED') then
    raise exception 'El pedido está cancelado';
  end if;

  select id into v_bill_id from public.bills
  where table_session_id = v_order.table_session_id and status in ('OPEN', 'PAID', 'CLOSED');
  if exists (select 1 from public.bills where id = v_bill_id and status in ('PAID', 'CLOSED')) then
    raise exception 'La cuenta ya fue cobrada: no se puede editar productos';
  end if;

  v_new_unit   := v_item.unit_price;
  v_new_vid    := v_item.variant_id;
  v_new_vname  := v_item.variant_name;
  v_new_vprice := v_item.variant_price;

  if p_variant_id is not null and p_variant_id is distinct from v_item.variant_id then
    select * into v_variant
    from public.product_variants
    where id = p_variant_id and product_id = v_item.product_id;
    if not found then
      raise exception 'La variante elegida no corresponde al producto';
    end if;
    if exists (select 1 from public.availability a
               where a.item_type = 'variant' and a.item_id = v_variant.id and a.available = false) then
      raise exception 'La variante no está disponible';
    end if;

    -- Se conservan las personalizaciones ya elegidas (snapshot de precio).
    select coalesce(sum(price_modifier * qty), 0) into v_mods_total
    from public.order_item_options where order_item_id = v_item.id;

    v_new_unit   := v_variant.price + v_mods_total;
    v_new_vid    := v_variant.id;
    v_new_vname  := nullif(v_variant.name, '');
    v_new_vprice := v_variant.price;
    v_changed    := true;
  end if;

  if p_notes is not null then
    v_notes := nullif(btrim(p_notes), '');
    if v_notes is distinct from v_item.notes then
      v_changed := true;
    end if;
  else
    v_notes := v_item.notes;
  end if;

  if not v_changed then
    return jsonb_build_object('order_id', v_order.id, 'order_item_id', v_item.id,
      'unit_price', v_item.unit_price, 'subtotal', v_item.subtotal, 'changed', false);
  end if;

  -- M13: el descuento se recalcula con el snapshot de la línea (las reglas
  -- que aplicaron al crearla), sobre el precio de la variante nueva.
  v_new_disc := public.promo_line_discount(v_new_vprice, v_item.quantity, v_item.promotions);
  v_new_sub := v_new_unit * v_item.quantity - v_new_disc;
  v_delta   := v_new_sub - v_item.subtotal;

  update public.order_items
  set variant_id = v_new_vid, variant_name = v_new_vname, variant_price = v_new_vprice,
      unit_price = v_new_unit, subtotal = v_new_sub, notes = v_notes,
      promo_discount = v_new_disc
  where id = v_item.id;

  if v_delta <> 0 then
    update public.orders
    set subtotal = subtotal + v_delta, total = total + v_delta
    where id = v_order.id;
  end if;

  if v_bill_id is not null then
    perform public.lock_bill(v_bill_id);
    perform public.recompute_bill(v_bill_id);
  end if;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (v_order.restaurant_id, auth.uid(), 'UPDATE', 'ORDER_ITEM', v_item.id,
          jsonb_build_object('action', 'EDIT_ORDER_ITEM', 'order_id', v_order.id,
            'ticket_id', v_item.ticket_id, 'product_name', v_item.product_name,
            'old_variant_id', v_item.variant_id, 'new_variant_id', v_new_vid,
            'old_unit_price', v_item.unit_price, 'new_unit_price', v_new_unit,
            'old_notes', v_item.notes, 'new_notes', v_notes));

  if v_new_sub < v_item.subtotal then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values (v_order.restaurant_id, auth.uid(), 'UPDATE', 'ORDER_ITEM', v_item.id,
            jsonb_build_object('action', 'PRICE_REDUCED', 'security_event', true,
              'order_id', v_order.id, 'product_name', v_item.product_name,
              'old_amount', v_item.subtotal, 'new_amount', v_new_sub, 'amount', v_item.subtotal - v_new_sub));
  end if;

  return jsonb_build_object('order_id', v_order.id, 'order_item_id', v_item.id,
    'unit_price', v_new_unit, 'subtotal', v_new_sub, 'changed', true);
end;
$$;

-- ======================= f) bill_json =======================================
-- bill_json: cuerpo de 20261023160000_bill_item_images.sql
CREATE OR REPLACE FUNCTION public.bill_json(p_bill_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_bill        public.bills%rowtype;
  v_table       public.tables%rowtype;
  v_session     public.table_sessions%rowtype;
  v_share       numeric(10,2);
  v_next_share  numeric(10,2);
  v_active      integer;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then
    raise exception 'Cuenta no encontrada';
  end if;

  select * into v_table from public.tables where id = v_bill.table_id;
  select * into v_session from public.table_sessions where id = v_bill.table_session_id;

  select count(*) into v_active
  from public.orders
  where table_session_id = v_bill.table_session_id
    and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY');

  -- Partes iguales: cada parte = total/partes truncado al centavo; la
  -- última absorbe el residuo. Regla sin contar pagos: si después de pagar
  -- una parte quedaría menos de otra parte, la que toca es todo el saldo.
  -- 3 x 10.00 -> 3.33, 3.33, 3.34.
  if v_bill.split_mode = 'EQUAL' and v_bill.balance > 0 then
    v_share := trunc(v_bill.total / v_bill.split_parts, 2);
    if v_share <= 0 or v_bill.balance < 2 * v_share then
      v_next_share := v_bill.balance;
    else
      v_next_share := v_share;
    end if;
  end if;

  return jsonb_build_object(
    'id',               v_bill.id,
    'bill_number',      v_bill.bill_number,
    'restaurant_id',    v_bill.restaurant_id,
    'table_id',         v_bill.table_id,
    'table_number',     v_table.number,
    'table_name',       v_table.name,
    -- C3
    'table_kind',       v_table.kind,
    'counter_number',   v_session.counter_number,
    'customer_label',   v_session.customer_label,
    'place_label',      public.session_place_label(v_bill.table_session_id),  -- S3-F0
    'table_session_id', v_bill.table_session_id,
    'session_status',   v_session.status,
    'status',           v_bill.status,
    'subtotal',         v_bill.subtotal,
    'discount_total',   v_bill.discount_total,
    -- M13: descuento de promociones ya incluido en subtotal (líneas vivas de
    -- pedidos cobrables). Productos a precio de lista = subtotal + promo_discount_total.
    'promo_discount_total', coalesce((
      select sum(oi.promo_discount)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.table_session_id = v_bill.table_session_id
        and o.status not in ('REJECTED', 'CANCELLED')
        and not oi.cancelled
    ), 0),
    'total',            v_bill.total,
    'paid_total',       v_bill.paid_total,
    'tip_total',        v_bill.tip_total,
    'balance',          v_bill.balance,
    'split_mode',       v_bill.split_mode,
    'split_parts',      v_bill.split_parts,
    'next_equal_share', v_next_share,
    'active_orders',    v_active,
    'can_close',        (v_bill.status = 'PAID' and v_active = 0),
    'opened_by',        v_bill.opened_by,
    'opened_at',        v_bill.opened_at,
    'paid_at',          v_bill.paid_at,
    'closed_by',        v_bill.closed_by,
    'closed_at',        v_bill.closed_at,
    'voided_at',        v_bill.voided_at,
    'void_reason',      v_bill.void_reason,
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',           o.id,
          'order_number', o.order_number,
          'status',       o.status,
          'total',        o.total,
          'created_at',   o.created_at,
          'billable',     o.status not in ('REJECTED', 'CANCELLED'),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id',           oi.id,
                'product_id',   oi.product_id,
                'product_name', oi.product_name,
                'variant_name', oi.variant_name,  -- S3-F0
                'options', coalesce((  -- S3-F0
                  select jsonb_agg(
                    jsonb_build_object(
                      'name',           oo.option_name,
                      'value_name',     oo.value_name,
                      'qty',            oo.qty,
                      'price_modifier', oo.price_modifier
                    )
                    order by oo.created_at, oo.id
                  )
                  from public.order_item_options oo
                  where oo.order_item_id = oi.id
                ), '[]'::jsonb),
                'quantity',     oi.quantity,
                'unit_price',   oi.unit_price,
                'subtotal',     oi.subtotal,
                -- M13: precio de lista de la línea y promociones aplicadas.
                'list_subtotal',  oi.unit_price * oi.quantity,
                'promo_discount', oi.promo_discount,
                'promotions',     oi.promotions,
                'notes',        oi.notes,
                -- Expand (Caja v2): foto del producto y si la línea se canceló.
                'image_url',    (select pr.image_url from public.products pr where pr.id = oi.product_id),
                'cancelled',    oi.cancelled
              )
              order by oi.created_at, oi.id
            )
            from public.order_items oi
            where oi.order_id = o.id
          ), '[]'::jsonb)
        )
        order by o.created_at, o.order_number
      )
      from public.orders o
      where o.table_session_id = v_bill.table_session_id
    ), '[]'::jsonb),
    'discounts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',            d.id,
          'order_item_id', d.order_item_id,
          'kind',          d.kind,
          'value',         d.value,
          'amount',        d.amount,
          'reason',        d.reason,
          'applied_by',    d.applied_by,
          'applied_at',    d.applied_at
        )
        order by d.applied_at
      )
      from public.bill_discounts d
      where d.bill_id = v_bill.id
        and d.removed_at is null
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',              p.id,
          'method',          p.method,
          'amount',          p.amount,
          'tip_amount',      p.tip_amount,
          'tendered_amount', p.tendered_amount,
          'change_amount',   p.change_amount,
          'reference',       p.reference,
          'card_type',       p.card_type,
          'status',          p.status,
          'received_by',     p.received_by,
          'received_at',     p.received_at,
          'voided_at',       p.voided_at,
          'void_reason',     p.void_reason,
          'cash_session_id', p.cash_session_id
        )
        order by p.received_at
      )
      from public.payments p
      where p.bill_id = v_bill.id
    ), '[]'::jsonb),
    'items_paid_qty', coalesce((
      select jsonb_object_agg(x.order_item_id, x.qty)
      from (
        select pi.order_item_id, sum(pi.quantity) as qty
        from public.payment_items pi
        join public.payments p on p.id = pi.payment_id
        where p.bill_id = v_bill.id
          and p.status = 'COMPLETED'
        group by pi.order_item_id
      ) x
    ), '{}'::jsonb)
  );
end;
$function$;
