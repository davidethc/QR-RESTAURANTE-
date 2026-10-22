-- ---------------------------------------------------------------------------
-- M08 · Caja y cortes · EXPAND (dinero: requiere revisión de security-reviewer).
-- Depende de 20260926201651 (RPCs de caja), 20260927205852 (solo OWNER/ADMIN),
-- 20261020120000 (restaurant_members.roles / cash_register_ids) y
-- 20261022120000 (record_payment / record_payments M07).
--
-- Qué agrega (nada existente se borra; firmas existentes intactas):
--   a) Rol CASHIER en caja. OWNER/ADMIN operan todas las cajas; un miembro con
--      roles @> {CASHIER} opera SOLO las de su cash_register_ids. Helpers
--      can_handle_cash / is_cash_admin / cashier_default_session. Se extiende
--      el control de rol de: record_payment, record_payments, open_cash_session,
--      close_cash_session (vía cash_cut), add_cash_movement y
--      get_cash_session_summary. NO se tocan void_payment*, descuentos,
--      void_bill ni close_bill: siguen solo OWNER/ADMIN.
--   b) Numeración consecutiva por restaurante (no por caja): cash_sessions.
--      cut_number (se asigna al guardar el corte) y cash_movements.number
--      (trigger al insertar). Contador en cash_counters (fila bloqueada por
--      INSERT .. ON CONFLICT; sin huecos, serializa por restaurante).
--   c) cash_cut(): corte a ciegas completo. Lo esperado NO sale en la
--      respuesta de un CASHIER hasta que el corte está guardado. Calcula
--      resultado EXACT/SHORT/OVER, diferencia por método (cash_session_counts),
--      fondo que queda (cash_float_left) y efectivo a retirar
--      (cash_to_withdraw = contado - fondo). BLOQUEA si hay pedidos sin cobrar
--      salvo p_skip_pending_orders = true; entonces guarda skipped_pending_orders
--      y la lista de folios y deja un evento en audit_logs.
--      close_cash_session(uuid, jsonb, text) se mantiene como envoltorio que
--      NO bloquea (omite pendientes, y lo deja registrado): no rompe el flujo
--      de caja actual hasta que la UI use cash_cut.
--   d) Lecturas seguras para CASHIER (cash_* tienen RLS solo OWNER/ADMIN):
--      get_cash_cut_precheck, get_last_cash_float, list_cash_cuts,
--      list_cash_movements.
--
-- Decisiones de seguridad:
--   * add_cash_movement: para CASHIER NO se valida el retiro contra el
--     efectivo esperado (sería un oráculo que rompe el corte a ciegas);
--     el mensaje de error tampoco revela el monto. El retiro queda como
--     CASH_MOVEMENT (security_events: cash_withdrawal) para todos.
--   * audit CLOSE_CASH_SESSION.metadata.cash_difference pasa a ser la
--     diferencia TOTAL de lo contado (todos los métodos), para que
--     security_events (vista M00, sin cambios) marque cash_cut_difference
--     también cuando solo falla tarjeta/transferencia. La del efectivo va en
--     metadata.cash_only_difference. Los pendientes omitidos se auditan como
--     UPDATE/CASH_SESSION con metadata.action = 'SKIP_PENDING_ORDERS'; la
--     vista aún no lo clasifica (seguimiento: añadir cash_cut_skipped).
--   * Los pedidos "sin cobrar" no tienen caja propia (bills/orders no guardan
--     register_id): el bloqueo es por restaurante. Excluye pedidos vacíos.
--
-- Rollback: reaplicar 20261022120000 (record_payment/record_payments),
-- 20260927205852 (open/close), 20260926201651 (add_cash_movement, summary);
-- drop de cash_cut, helpers y lecturas; las columnas nuevas son inofensivas.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ======================= a) esquema =========================================
alter table public.cash_sessions
  add column if not exists cut_number integer,
  add column if not exists cash_float_left numeric(10,2),
  add column if not exists cash_to_withdraw numeric(10,2),
  add column if not exists result text,
  add column if not exists skipped_pending_orders boolean not null default false,
  add column if not exists skipped_order_folios integer[] not null default '{}';

alter table public.cash_sessions
  drop constraint if exists cash_sessions_result_valid,
  drop constraint if exists cash_sessions_float_valid,
  drop constraint if exists cash_sessions_cut_number_positive;
alter table public.cash_sessions
  add constraint cash_sessions_result_valid check (result is null or result in ('EXACT', 'SHORT', 'OVER')),
  add constraint cash_sessions_float_valid check (
    (cash_float_left is null or cash_float_left >= 0)
    and (cash_to_withdraw is null or cash_to_withdraw >= 0)),
  add constraint cash_sessions_cut_number_positive check (cut_number is null or cut_number >= 1);

alter table public.cash_movements
  add column if not exists number integer;
alter table public.cash_movements
  drop constraint if exists cash_movements_number_positive;
alter table public.cash_movements
  add constraint cash_movements_number_positive check (number is null or number >= 1);

comment on column public.cash_sessions.cut_number is 'M08: número consecutivo del corte (por restaurante). Se asigna al cerrar el turno.';
comment on column public.cash_sessions.cash_float_left is 'M08: fondo de caja que queda para el siguiente turno (declarado en el corte).';
comment on column public.cash_sessions.cash_to_withdraw is 'M08: efectivo a retirar = efectivo contado - fondo que queda.';
comment on column public.cash_sessions.result is 'M08: EXACT | SHORT (faltante) | OVER (sobrante) sobre lo contado.';
comment on column public.cash_sessions.skipped_pending_orders is 'M08: el corte se guardó omitiendo pedidos sin cobrar.';
comment on column public.cash_sessions.skipped_order_folios is 'M08: folios de los pedidos sin cobrar que se omitieron.';
comment on column public.cash_movements.number is 'M08: número consecutivo del movimiento (por restaurante).';

-- Contador interno (solo funciones SECURITY DEFINER).
create table if not exists public.cash_counters (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  last_cut integer not null default 0 check (last_cut >= 0),
  last_movement integer not null default 0 check (last_movement >= 0)
);
alter table public.cash_counters enable row level security;
revoke all on table public.cash_counters from public, anon, authenticated;
grant all on table public.cash_counters to service_role;

-- Backfill (sin tocar updated_at: no es una edición hecha por una persona).
alter table public.cash_sessions disable trigger cash_sessions_set_updated_at;

update public.cash_sessions s
set cut_number = x.rn
from (
  select id, row_number() over (partition by restaurant_id order by closed_at, created_at, id) as rn
  from public.cash_sessions where status = 'CLOSED'
) x
where s.id = x.id and s.cut_number is null;

update public.cash_sessions s
set result = case
      when c.diff is null or c.diff = 0 and not c.any_nonzero then 'EXACT'
      when c.diff < 0 then 'SHORT'
      when c.diff > 0 then 'OVER'
      else 'SHORT' end
from (
  select cash_session_id,
         sum(difference) as diff,
         bool_or(coalesce(difference, 0) <> 0) as any_nonzero
  from public.cash_session_counts group by cash_session_id
) c
where c.cash_session_id = s.id and s.status = 'CLOSED' and s.result is null;

alter table public.cash_sessions enable trigger cash_sessions_set_updated_at;

update public.cash_movements m
set number = x.rn
from (
  select id, row_number() over (partition by restaurant_id order by created_at, id) as rn
  from public.cash_movements
) x
where m.id = x.id and m.number is null;

insert into public.cash_counters (restaurant_id, last_cut, last_movement)
select r.id,
       coalesce((select max(cut_number) from public.cash_sessions s where s.restaurant_id = r.id), 0),
       coalesce((select max(number) from public.cash_movements m where m.restaurant_id = r.id), 0)
from public.restaurants r
on conflict (restaurant_id) do update
  set last_cut = greatest(public.cash_counters.last_cut, excluded.last_cut),
      last_movement = greatest(public.cash_counters.last_movement, excluded.last_movement);

create unique index if not exists cash_sessions_restaurant_cut_number_uq
  on public.cash_sessions (restaurant_id, cut_number) where cut_number is not null;
create unique index if not exists cash_movements_restaurant_number_uq
  on public.cash_movements (restaurant_id, number) where number is not null;
create index if not exists cash_sessions_register_closed_idx
  on public.cash_sessions (register_id, closed_at desc) where status = 'CLOSED';

-- Siguiente número (interno). Bloquea la fila del contador hasta el commit.
create or replace function public.next_cash_number(p_restaurant_id uuid, p_kind text)
returns integer
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_n integer;
begin
  if p_kind = 'cut' then
    insert into public.cash_counters as c (restaurant_id, last_cut) values (p_restaurant_id, 1)
    on conflict (restaurant_id) do update set last_cut = c.last_cut + 1
    returning c.last_cut into v_n;
  elsif p_kind = 'movement' then
    insert into public.cash_counters as c (restaurant_id, last_movement) values (p_restaurant_id, 1)
    on conflict (restaurant_id) do update set last_movement = c.last_movement + 1
    returning c.last_movement into v_n;
  else
    raise exception 'Tipo de contador desconocido';
  end if;
  return v_n;
end;
$$;
revoke all on function public.next_cash_number(uuid, text) from public, anon, authenticated;
grant execute on function public.next_cash_number(uuid, text) to service_role;

create or replace function public.cash_movements_set_number()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.number is null then
    new.number := public.next_cash_number(new.restaurant_id, 'movement');
  end if;
  return new;
end;
$$;
revoke all on function public.cash_movements_set_number() from public, anon, authenticated;

drop trigger if exists cash_movements_set_number on public.cash_movements;
create trigger cash_movements_set_number
before insert on public.cash_movements
for each row execute function public.cash_movements_set_number();

-- ======================= b) roles de caja ===================================
-- OWNER/ADMIN (por role, igual que user_has_restaurant_role).
create or replace function public.is_cash_admin(p_restaurant_id uuid)
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
      and rm.role in ('OWNER', 'ADMIN')
  );
$$;

-- OWNER/ADMIN, o CASHIER de esa caja. Sin p_register_id: cualquier CASHIER
-- con al menos una caja asignada (el control fino lo hace quien llama).
create or replace function public.can_handle_cash(p_restaurant_id uuid, p_register_id uuid default null)
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
      and (
        rm.role in ('OWNER', 'ADMIN')
        or (
          rm.roles @> array['CASHIER']::text[]
          and cardinality(rm.cash_register_ids) > 0
          and (p_register_id is null or p_register_id = any (rm.cash_register_ids))
        )
      )
  );
$$;

-- Para un CASHIER sin p_cash_session_id: su única caja abierta (o null).
create or replace function public.cashier_default_session(p_restaurant_id uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select case when count(*) = 1 then (array_agg(cs.id))[1] end
  from public.restaurant_members rm
  join public.cash_sessions cs
    on cs.restaurant_id = rm.restaurant_id
   and cs.status = 'OPEN'
   and cs.register_id = any (rm.cash_register_ids)
  where rm.restaurant_id = p_restaurant_id
    and rm.user_id = auth.uid()
    and rm.status = 'ACTIVE'
    and rm.role not in ('OWNER', 'ADMIN')
    and rm.roles @> array['CASHIER']::text[];
$$;

revoke all on function public.is_cash_admin(uuid) from public, anon;
revoke all on function public.can_handle_cash(uuid, uuid) from public, anon;
revoke all on function public.cashier_default_session(uuid) from public, anon;
grant execute on function public.is_cash_admin(uuid), public.can_handle_cash(uuid, uuid),
  public.cashier_default_session(uuid) to authenticated, service_role;

-- ======================= c) cobro: CASHIER ==================================
-- Cuerpos copiados de 20261022120000_m07_payments.sql; solo cambia el control
-- de rol y la elección/validación de la caja.
create or replace function public.record_payment(
  p_bill_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_idempotency_key uuid,
  p_tip_amount numeric default 0,
  p_tendered_amount numeric default null::numeric,
  p_reference text default null::text,
  p_card_type text default null::text,
  p_items jsonb default null::jsonb,
  p_cash_session_id uuid default null::uuid,
  p_auto_close boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_restaurant_id uuid;
  v_bill      public.bills%rowtype;
  v_existing  public.payments%rowtype;
  v_payment   public.payments%rowtype;
  v_amount    numeric(10,2);
  v_tip       numeric(10,2);
  v_tendered  numeric(10,2);
  v_change    numeric(10,2);
  v_session   uuid;
  v_item      jsonb;
  v_item_id   uuid;
  v_qty       integer;
  v_item_qty  integer;
  v_paid_qty  integer;
  v_closed    boolean := false;
  v_number    integer;
  v_register  uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  select restaurant_id into v_restaurant_id from public.bills where id = p_bill_id;
  if v_restaurant_id is null then
    raise exception 'Cuenta no encontrada';
  end if;

  -- S3: OWNER, ADMIN o CASHIER. La caja concreta se valida más abajo.
  if not public.can_handle_cash(v_restaurant_id) then
    raise exception 'No autorizado para cobrar';
  end if;

  if not coalesce((select billing_enabled from public.restaurants where id = v_restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  -- 2. Candado de la cuenta. Todo cobro de esta cuenta pasa en fila.
  v_bill := public.lock_bill(p_bill_id);

  -- 1. Idempotencia (después del candado: un reintento concurrente con la
  --    misma clave espera y aquí ya ve el pago del primero).
  select * into v_existing
  from public.payments
  where restaurant_id = v_restaurant_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.bill_id <> p_bill_id then
      raise exception 'La clave de idempotencia ya se usó en otra cuenta';
    end if;
    return jsonb_build_object(
      'payment_id', v_existing.id,
      'change_amount', v_existing.change_amount,
      'replayed', true,
      'payment_number', v_existing.number,
      'bill', public.bill_json(p_bill_id)
    );
  end if;

  if v_bill.status = 'VOID' then
    raise exception 'La cuenta está anulada y no se puede cobrar';
  end if;

  if v_bill.status <> 'OPEN' then
    raise exception 'La cuenta no tiene saldo por cobrar (estado: %)', v_bill.status;
  end if;

  -- 3. Recalcular con lo último (pedidos/descuentos).
  v_bill := public.recompute_bill(v_bill.id);

  -- S2: un pedido cancelado no se cobra por ningún camino.
  if not exists (
    select 1 from public.orders
    where table_session_id = v_bill.table_session_id
      and status not in ('REJECTED', 'CANCELLED')
      and not cancelled
  ) then
    raise exception 'El pedido está cancelado y no se puede cobrar';
  end if;

  -- 4. Monto.
  if p_method is null then
    raise exception 'Elige la forma de pago';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  v_tip    := round(coalesce(p_tip_amount, 0), 2);

  if v_amount <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;
  if v_tip < 0 then
    raise exception 'La propina no puede ser negativa';
  end if;
  if v_amount > v_bill.balance then
    raise exception 'El monto (%) supera el saldo pendiente (%)', v_amount, v_bill.balance;
  end if;

  -- 5. Caja abierta (FOR SHARE: el cierre de caja espera a este cobro).
  v_session := public.resolve_open_cash_session(
    v_bill.restaurant_id,
    coalesce(p_cash_session_id, public.cashier_default_session(v_bill.restaurant_id))
  );

  -- S3: el CASHIER solo cobra en las cajas asignadas a él.
  if not public.can_handle_cash(
    v_bill.restaurant_id,
    (select cs.register_id from public.cash_sessions cs where cs.id = v_session)
  ) then
    raise exception 'No autorizado para cobrar en esta caja';
  end if;

  -- 6. Vuelto.
  if p_method = 'CASH' then
    v_tendered := round(coalesce(p_tendered_amount, v_amount + v_tip), 2);
    if v_tendered < v_amount + v_tip then
      raise exception 'El efectivo recibido (%) no alcanza para % más % de propina',
        v_tendered, v_amount, v_tip;
    end if;
    v_change := v_tendered - v_amount - v_tip;
  else
    v_tendered := null;
    v_change   := null;
  end if;

  -- 7. Pago e ítems. Número consecutivo por cuenta (bajo lock_bill) y caja.
  select coalesce(max(number), 0) + 1 into v_number
  from public.payments where bill_id = v_bill.id;

  select register_id into v_register from public.cash_sessions where id = v_session;

  insert into public.payments (
    restaurant_id, bill_id, cash_session_id, method, amount, tip_amount,
    tendered_amount, change_amount, reference, card_type, received_by,
    idempotency_key, number, cash_register_id
  )
  values (
    v_bill.restaurant_id, v_bill.id, v_session, p_method, v_amount, v_tip,
    v_tendered, v_change,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_card_type, '')), ''),
    auth.uid(), p_idempotency_key, v_number, v_register
  )
  returning * into v_payment;

  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    for v_item in select * from jsonb_array_elements(p_items) loop
      begin
        v_item_id := (v_item ->> 'order_item_id')::uuid;
        v_qty     := (v_item ->> 'quantity')::integer;
      exception when others then
        raise exception 'Ítem de pago inválido';
      end;

      if v_item_id is null or v_qty is null or v_qty <= 0 then
        raise exception 'Ítem de pago inválido';
      end if;

      select oi.quantity into v_item_qty
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = v_item_id
        and o.table_session_id = v_bill.table_session_id
        and o.status not in ('REJECTED', 'CANCELLED');

      if v_item_qty is null then
        raise exception 'El ítem no pertenece a esta cuenta';
      end if;

      select coalesce(sum(pi.quantity), 0) into v_paid_qty
      from public.payment_items pi
      join public.payments p on p.id = pi.payment_id
      where pi.order_item_id = v_item_id
        and p.status = 'COMPLETED';

      if v_paid_qty + v_qty > v_item_qty then
        raise exception 'Se está pagando más cantidad de la que tiene el ítem (pagado %, pedido %, máximo %)',
          v_paid_qty, v_qty, v_item_qty;
      end if;

      insert into public.payment_items (payment_id, order_item_id, restaurant_id, quantity)
      values (v_payment.id, v_item_id, v_bill.restaurant_id, v_qty)
      on conflict (payment_id, order_item_id)
      do update set quantity = public.payment_items.quantity + excluded.quantity;
    end loop;
  end if;

  -- 8. Recalcular.
  v_bill := public.recompute_bill(v_bill.id);

  -- 10. Auditar (antes del cierre para que el orden del log sea natural).
  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_bill.restaurant_id, auth.uid(), 'RECORD_PAYMENT', 'PAYMENT', v_payment.id,
    jsonb_build_object(
      'bill_id', v_bill.id, 'bill_number', v_bill.bill_number,
      'method', p_method, 'amount', v_amount, 'tip_amount', v_tip,
      'tendered_amount', v_tendered, 'change_amount', v_change,
      'cash_session_id', v_session, 'balance_after', v_bill.balance,
      'payment_number', v_number, 'cash_register_id', v_register
    )
  );

  -- 9. Saldo 0 y sin pedidos en curso: se cierra la cuenta y la mesa.
  if coalesce(p_auto_close, true)
     and v_bill.balance = 0
     and not exists (
       select 1 from public.orders
       where table_session_id = v_bill.table_session_id
         and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
     ) then
    perform public.finalize_bill(v_bill.id, auth.uid());
    v_closed := true;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'change_amount', v_change,
    'payment_number', v_number,
    'replayed', false,
    'closed', v_closed,
    'bill', public.bill_json(v_bill.id)
  );
end;
$$;

revoke all on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) from public, anon;
grant execute on function public.record_payment(uuid, public.payment_method, numeric, uuid, numeric, numeric, text, text, jsonb, uuid, boolean) to authenticated, service_role;

create or replace function public.record_payments(
  p_bill_id uuid,
  p_amount numeric,
  p_payments jsonb,
  p_request_id uuid,
  p_tip_amount numeric default 0,
  p_items jsonb default null,
  p_cash_session_id uuid default null,
  p_auto_close boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_restaurant_id uuid;
  v_n         integer;
  v_i         integer := 0;
  v_e         jsonb;
  v_method    public.payment_method;
  v_methods   public.payment_method[] := '{}';
  v_received  numeric(10,2);
  v_due       numeric(10,2) := round(coalesce(p_amount, 0), 2);
  v_tip       numeric(10,2) := round(coalesce(p_tip_amount, 0), 2);
  v_noncash   numeric(10,2) := 0;
  v_cash_rec  numeric(10,2);
  v_cash_pos  integer;
  v_cash_part numeric(10,2);
  v_need      numeric(10,2);
  v_key       uuid;
  v_res       jsonb;
  v_last      jsonb;
  v_ids       jsonb := '[]'::jsonb;
  v_change    numeric(10,2) := 0;
  v_amount    numeric(10,2);
  v_tipi      numeric(10,2);
  v_tend      numeric(10,2);
  v_replayed  boolean := false;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_request_id is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  select restaurant_id into v_restaurant_id from public.bills where id = p_bill_id;
  if v_restaurant_id is null then
    raise exception 'Cuenta no encontrada';
  end if;
  -- S3: OWNER, ADMIN o CASHIER. La caja concreta se valida más abajo.
  if not public.can_handle_cash(v_restaurant_id) then
    raise exception 'No autorizado para cobrar';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array'
     or jsonb_array_length(p_payments) not between 1 and 3 then
    raise exception 'Indica de 1 a 3 métodos de pago';
  end if;
  if v_due <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;
  if v_tip < 0 then
    raise exception 'La propina no puede ser negativa';
  end if;

  v_n := jsonb_array_length(p_payments);

  -- Primera pasada: forma, métodos únicos, sumas.
  for v_e in select * from jsonb_array_elements(p_payments) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'Método de pago inválido';
    end if;
    begin
      v_method   := (v_e ->> 'method')::public.payment_method;
      v_received := round((v_e ->> 'received')::numeric, 2);
    exception when others then
      raise exception 'Método de pago inválido';
    end;
    if v_method is null or v_method not in ('CASH', 'CARD', 'TRANSFER') then
      raise exception 'Método de pago inválido (usa efectivo, tarjeta o transferencia)';
    end if;
    if v_method = any (v_methods) then
      raise exception 'Cada método de pago se indica una sola vez';
    end if;
    v_methods := v_methods || v_method;
    if v_received is null or v_received <= 0 then
      raise exception 'El monto recibido de cada método debe ser mayor que cero';
    end if;
    if v_method = 'CASH' then
      v_cash_rec := v_received;
      v_cash_pos := v_i;
    else
      v_noncash := v_noncash + v_received;
    end if;
  end loop;

  if v_noncash > v_due then
    raise exception 'Tarjeta y transferencia (%) superan el monto a cobrar (%)', v_noncash, v_due;
  end if;

  v_cash_part := v_due - v_noncash;  -- lo que debe cubrir el efectivo
  if v_cash_rec is null then
    if v_cash_part > 0 then
      raise exception 'Faltan % para cubrir el monto a cobrar', v_cash_part;
    end if;
  else
    if v_cash_part <= 0 then
      raise exception 'Tarjeta y transferencia ya cubren el monto: quita el efectivo';
    end if;
    -- La propina va con el primer método; si es el efectivo, también debe cubrirla.
    v_need := v_cash_part;
    if v_cash_pos = 1 then
      v_need := v_need + v_tip;
    end if;
    if v_cash_rec < v_need then
      raise exception 'Faltan % para cubrir el monto a cobrar', v_need - v_cash_rec;
    end if;
  end if;

  -- Segunda pasada: un record_payment por método (misma transacción).
  v_i := 0;
  for v_e in select * from jsonb_array_elements(p_payments) loop
    v_i := v_i + 1;
    v_method   := (v_e ->> 'method')::public.payment_method;
    v_received := round((v_e ->> 'received')::numeric, 2);
    v_key      := md5(p_request_id::text || ':' || v_method::text)::uuid;
    v_tipi     := case when v_i = 1 then v_tip else 0 end;
    if v_method = 'CASH' then
      v_amount := v_cash_part;
      v_tend   := v_received;
    else
      v_amount := v_received;
      v_tend   := null;
    end if;

    v_res := public.record_payment(
      p_bill_id, v_method, v_amount, v_key, v_tipi, v_tend,
      v_e ->> 'reference', v_e ->> 'card_type',
      case when v_i = 1 then p_items else null end,
      p_cash_session_id,
      coalesce(p_auto_close, true) and v_i = v_n
    );
    v_last := v_res;
    if (v_res ->> 'replayed')::boolean then v_replayed := true; end if;
    v_ids := v_ids || jsonb_build_array(jsonb_build_object(
      'payment_id', v_res ->> 'payment_id', 'method', v_method,
      'payment_number', (v_res ->> 'payment_number')::integer));
    v_change := v_change + coalesce((v_res ->> 'change_amount')::numeric, 0);
  end loop;

  return jsonb_build_object(
    'payments', v_ids,
    'change_amount', v_change,
    'replayed', v_replayed,
    'closed', coalesce((v_last ->> 'closed')::boolean, false),
    'bill', v_last -> 'bill'
  );
end;
$$;

revoke all on function public.record_payments(uuid, numeric, jsonb, uuid, numeric, jsonb, uuid, boolean) from public, anon;
grant execute on function public.record_payments(uuid, numeric, jsonb, uuid, numeric, jsonb, uuid, boolean) to authenticated, service_role;

-- ======================= d) caja: abrir, movimientos, resumen ===============
create or replace function public.open_cash_session(
  p_register_id uuid,
  p_opening_float numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_register public.cash_registers%rowtype;
  v_session  public.cash_sessions%rowtype;
  v_float    numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_register
  from public.cash_registers
  where id = p_register_id
  for update;

  if not found then
    raise exception 'Caja no encontrada';
  end if;

  if not public.can_handle_cash(v_register.restaurant_id, v_register.id) then
    raise exception 'No autorizado para abrir la caja';
  end if;

  if not coalesce((select billing_enabled from public.restaurants where id = v_register.restaurant_id), false) then
    raise exception 'El cobro no está habilitado en este restaurante';
  end if;

  if not v_register.active then
    raise exception 'La caja está desactivada';
  end if;

  v_float := round(coalesce(p_opening_float, 0), 2);
  if v_float < 0 then
    raise exception 'El fondo inicial no puede ser negativo';
  end if;

  begin
    insert into public.cash_sessions (restaurant_id, register_id, opened_by, opening_float)
    values (v_register.restaurant_id, v_register.id, auth.uid(), v_float)
    returning * into v_session;
  exception when unique_violation then
    raise exception 'Ya hay una caja abierta';
  end;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_register.restaurant_id, auth.uid(), 'OPEN_CASH_SESSION', 'CASH_SESSION', v_session.id,
    jsonb_build_object('register_id', v_register.id, 'opening_float', v_float)
  );

  return jsonb_build_object(
    'id',            v_session.id,
    'register_id',   v_session.register_id,
    'register_name', v_register.name,
    'status',        v_session.status,
    'opened_by',     v_session.opened_by,
    'opened_at',     v_session.opened_at,
    'opening_float', v_session.opening_float,
    -- S3: fondo que dejó el último corte de esta caja (para validar la apertura).
    'previous_float_left', (
      select p.cash_float_left from public.cash_sessions p
      where p.register_id = v_register.id and p.status = 'CLOSED' and p.cash_float_left is not null
      order by p.closed_at desc, p.id desc limit 1)
  );
end;
$$;

revoke all on function public.open_cash_session(uuid, numeric) from public, anon;
grant execute on function public.open_cash_session(uuid, numeric) to authenticated, service_role;

create or replace function public.add_cash_movement(
  p_cash_session_id uuid,
  p_type public.cash_movement_type,
  p_reason public.cash_movement_reason,
  p_amount numeric,
  p_description text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.cash_sessions%rowtype;
  v_movement public.cash_movements%rowtype;
  v_amount   numeric(10,2);
  v_cash     numeric;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id
  for update;

  if not found then
    raise exception 'Turno de caja no encontrado';
  end if;

  v_is_admin := public.is_cash_admin(v_session.restaurant_id);
  if not public.can_handle_cash(v_session.restaurant_id, v_session.register_id) then
    raise exception 'No autorizado para registrar movimientos en esta caja';
  end if;

  -- Reintento con la misma clave: devuelve el movimiento ya registrado.
  select * into v_movement
  from public.cash_movements
  where restaurant_id = v_session.restaurant_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_movement.cash_session_id <> v_session.id then
      raise exception 'La clave de idempotencia ya se usó en otro movimiento';
    end if;
    return to_jsonb(v_movement) || jsonb_build_object('replayed', true);
  end if;

  if v_session.status <> 'OPEN' then
    raise exception 'La caja ya está cerrada';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;

  if p_type is null or p_reason is null then
    raise exception 'Falta el tipo o el motivo del movimiento';
  end if;

  if p_reason = 'OTHER' and length(btrim(coalesce(p_description, ''))) < 3 then
    raise exception 'Describe el motivo del movimiento';
  end if;

  -- S3: solo se valida contra lo esperado para OWNER/ADMIN. A un CASHIER
  -- ese chequeo le serviría de oráculo del esperado (corte a ciegas): se
  -- omite, y el retiro igual queda como evento de seguridad.
  if p_type = 'OUT' and v_is_admin then
    select expected into v_cash
    from public.cash_session_expected(v_session.id)
    where method = 'CASH';

    if v_amount > coalesce(v_cash, 0) then
      raise exception 'No hay suficiente efectivo en caja (disponible: %)', coalesce(v_cash, 0);
    end if;
  end if;

  insert into public.cash_movements (
    restaurant_id, cash_session_id, type, reason, amount, description,
    idempotency_key, created_by
  )
  values (
    v_session.restaurant_id, v_session.id, p_type, p_reason, v_amount,
    nullif(btrim(coalesce(p_description, '')), ''),
    p_idempotency_key, auth.uid()
  )
  returning * into v_movement;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_session.restaurant_id, auth.uid(), 'CASH_MOVEMENT', 'CASH_MOVEMENT', v_movement.id,
    jsonb_build_object(
      'cash_session_id', v_session.id,
      'type', p_type, 'reason', p_reason, 'amount', v_amount,
      'number', v_movement.number, 'register_id', v_session.register_id
    )
  );

  return to_jsonb(v_movement) || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.add_cash_movement(uuid, public.cash_movement_type, public.cash_movement_reason, numeric, text, uuid) from public, anon;
grant execute on function public.add_cash_movement(uuid, public.cash_movement_type, public.cash_movement_reason, numeric, text, uuid) to authenticated, service_role;

create or replace function public.get_cash_session_summary(p_cash_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.cash_sessions%rowtype;
  v_is_admin boolean;
  v_base     jsonb;
  v_cashier  boolean;
  v_details  boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id;

  if not found then
    raise exception 'Turno de caja no encontrado';
  end if;

  v_is_admin := public.is_cash_admin(v_session.restaurant_id);
  -- S3: el CASHIER ve el detalle de SUS cajas, pero solo cuando el turno ya
  -- está cerrado (corte guardado): mientras está abierto sigue a ciegas.
  v_cashier := not v_is_admin
           and public.can_handle_cash(v_session.restaurant_id, v_session.register_id);

  if not (v_is_admin or v_cashier
          or public.user_has_restaurant_role(v_session.restaurant_id, 'WAITER')) then
    raise exception 'No autorizado';
  end if;

  v_details := v_is_admin or (v_cashier and v_session.status = 'CLOSED');

  v_base := jsonb_build_object(
    'id',             v_session.id,
    'register_id',    v_session.register_id,
    'register_name',  (select name from public.cash_registers where id = v_session.register_id),
    'status',         v_session.status,
    'opened_by',      v_session.opened_by,
    'opened_at',      v_session.opened_at,
    'opening_float',  v_session.opening_float,
    'closed_by',      v_session.closed_by,
    'closed_at',      v_session.closed_at,
    'payments_count', (
      select count(*) from public.payments
      where cash_session_id = v_session.id and status = 'COMPLETED'
    ),
    'can_see_expected', v_details,
    'cut_number',     v_session.cut_number,
    'cash_float_left', v_session.cash_float_left
  );

  -- Cierre ciego: el mesero no ve esperados, conteos ni diferencias.
  if not v_details then
    return v_base;
  end if;

  return v_base || jsonb_build_object(
    'notes',           v_session.notes,
    'result',          v_session.result,
    'cash_to_withdraw', v_session.cash_to_withdraw,
    'skipped_pending_orders', v_session.skipped_pending_orders,
    'skipped_order_folios',   to_jsonb(v_session.skipped_order_folios),
    -- Cerrado: lo congelado en cash_session_counts. Abierto: en vivo.
    'expected_cash',   coalesce(
                         (select c.expected from public.cash_session_counts c
                          where c.cash_session_id = v_session.id and c.method = 'CASH'),
                         (select e.expected from public.cash_session_expected(v_session.id) e where e.method = 'CASH')
                       ),
    'counted_cash',    (select c.counted from public.cash_session_counts c
                        where c.cash_session_id = v_session.id and c.method = 'CASH'),
    'cash_difference', (select c.difference from public.cash_session_counts c
                        where c.cash_session_id = v_session.id and c.method = 'CASH'),
    'expected_total',  coalesce(
                         (select sum(c.expected) from public.cash_session_counts c
                          where c.cash_session_id = v_session.id),
                         (select sum(e.expected) from public.cash_session_expected(v_session.id) e)
                       ),
    'counted_total',   (select sum(c.counted) from public.cash_session_counts c
                        where c.cash_session_id = v_session.id),
    'difference_total', (select sum(c.difference) from public.cash_session_counts c
                         where c.cash_session_id = v_session.id),
    'by_method', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'method',     e.method,
          'expected',   coalesce(c.expected, e.expected),
          'counted',    c.counted,
          'difference', c.difference,
          'payments_total', coalesce((
            select sum(p.amount) from public.payments p
            where p.cash_session_id = v_session.id and p.status = 'COMPLETED' and p.method = e.method
          ), 0),
          'tips_total', coalesce((
            select sum(p.tip_amount) from public.payments p
            where p.cash_session_id = v_session.id and p.status = 'COMPLETED' and p.method = e.method
          ), 0)
        )
        order by e.method
      )
      from public.cash_session_expected(v_session.id) e
      left join public.cash_session_counts c
        on c.cash_session_id = v_session.id and c.method = e.method
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cm.id, 'number', cm.number, 'type', cm.type, 'reason', cm.reason, 'amount', cm.amount,
          'description', cm.description, 'created_by', cm.created_by, 'created_at', cm.created_at
        )
        order by cm.created_at
      )
      from public.cash_movements cm
      where cm.cash_session_id = v_session.id
    ), '[]'::jsonb),
    'voided_payments_count', (
      select count(*) from public.payments
      where cash_session_id = v_session.id and status = 'VOIDED'
    )
  );
end;
$$;

revoke all on function public.get_cash_session_summary(uuid) from public, anon;
grant execute on function public.get_cash_session_summary(uuid) to authenticated, service_role;

-- ======================= e) pedidos sin cobrar ==============================
-- Misma regla que table_session_has_unpaid_consumption, pero por pedido y sin
-- contar pedidos vacíos (todas sus líneas canceladas o sin líneas) ni sesiones
-- ya cerradas. Interna: la usan cash_cut y get_cash_cut_precheck.
create or replace function public.cash_pending_unpaid_orders(p_restaurant_id uuid)
returns table (order_id uuid, folio integer)
language sql
stable
security definer
set search_path to ''
as $$
  select o.id, o.folio
  from public.orders o
  join public.table_sessions ts on ts.id = o.table_session_id
  join public.restaurants r on r.id = o.restaurant_id
  where o.restaurant_id = p_restaurant_id
    and r.billing_enabled
    and ts.status <> 'CLOSED'
    and o.status not in ('REJECTED', 'CANCELLED')
    and not o.cancelled
    and exists (
      select 1 from public.order_items oi
      where oi.order_id = o.id and not oi.cancelled
    )
    and not exists (
      select 1 from public.bills b
      where b.table_session_id = ts.id and b.status in ('PAID', 'CLOSED')
    )
  order by o.folio;
$$;
revoke all on function public.cash_pending_unpaid_orders(uuid) from public, anon, authenticated;
grant execute on function public.cash_pending_unpaid_orders(uuid) to service_role;

-- ======================= f) cash_cut (corte a ciegas) =======================
-- p_counts: {"CASH": 120.50, "CARD": 45.00, ...}; CASH obligatorio.
create or replace function public.cash_cut(
  p_cash_session_id uuid,
  p_counts jsonb,
  p_cash_float_left numeric default null,
  p_notes text default null,
  p_skip_pending_orders boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session  public.cash_sessions%rowtype;
  v_key      text;
  v_counted  numeric(10,2);
  v_cash_expected numeric(10,2);
  v_cash_counted  numeric(10,2);
  v_total_diff    numeric(10,2) := 0;
  v_any_nonzero   boolean := false;
  v_result   text;
  v_float    numeric(10,2);
  v_withdraw numeric(10,2);
  v_folios   integer[];
  v_pending  integer;
  v_number   integer;
  r record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id
  for update;

  if not found then
    raise exception 'Turno de caja no encontrado';
  end if;

  if not public.can_handle_cash(v_session.restaurant_id, v_session.register_id) then
    raise exception 'No autorizado para cerrar la caja';
  end if;

  if v_session.status <> 'OPEN' then
    raise exception 'La caja ya está cerrada';
  end if;

  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    raise exception 'Conteo inválido';
  end if;

  for v_key in select jsonb_object_keys(p_counts) loop
    if v_key not in (select unnest(enum_range(null::public.payment_method))::text) then
      raise exception 'Método de pago desconocido en el conteo: %', v_key;
    end if;
    if jsonb_typeof(p_counts -> v_key) <> 'number' or (p_counts ->> v_key)::numeric < 0 then
      raise exception 'Conteo inválido para %', v_key;
    end if;
  end loop;

  if not (p_counts ? 'CASH') then
    raise exception 'Falta el conteo de efectivo';
  end if;

  v_cash_counted := round((p_counts ->> 'CASH')::numeric, 2);

  if p_cash_float_left is not null then
    v_float := round(p_cash_float_left, 2);
    if v_float < 0 then
      raise exception 'El fondo de caja no puede ser negativo';
    end if;
    if v_float > v_cash_counted then
      raise exception 'El fondo de caja no puede ser mayor que el efectivo contado';
    end if;
    v_withdraw := v_cash_counted - v_float;
  end if;

  -- Pedidos sin cobrar: bloquea salvo "omitir pagos pendientes".
  select coalesce(array_agg(p.folio order by p.folio), '{}'), count(*)
    into v_folios, v_pending
  from public.cash_pending_unpaid_orders(v_session.restaurant_id) p;

  if v_pending > 0 and not coalesce(p_skip_pending_orders, false) then
    raise exception 'Hay % pedido(s) sin cobrar (folios: %). Cóbralos u omite los pagos pendientes.',
      v_pending, array_to_string(v_folios, ', ')
      using errcode = 'P0001', hint = 'PENDING_ORDERS',
            detail = jsonb_build_object('count', v_pending, 'folios', to_jsonb(v_folios))::text;
  end if;

  for r in select * from public.cash_session_expected(v_session.id) loop
    v_counted := case
      when p_counts ? r.method::text then round((p_counts ->> r.method::text)::numeric, 2)
      else null
    end;

    if r.method = 'CASH' then
      v_cash_expected := r.expected;
    end if;
    if v_counted is not null then
      v_total_diff := v_total_diff + (v_counted - r.expected);
      if v_counted <> r.expected then
        v_any_nonzero := true;
      end if;
    end if;

    insert into public.cash_session_counts (
      cash_session_id, method, restaurant_id, expected, counted, difference
    )
    values (
      v_session.id, r.method, v_session.restaurant_id, r.expected, v_counted,
      case when v_counted is null then null else v_counted - r.expected end
    );
  end loop;

  v_result := case
    when not v_any_nonzero then 'EXACT'
    when v_total_diff > 0 then 'OVER'
    else 'SHORT'  -- faltante, o diferencias que se compensan entre métodos
  end;

  v_number := public.next_cash_number(v_session.restaurant_id, 'cut');

  update public.cash_sessions
  set status                = 'CLOSED',
      closed_by             = auth.uid(),
      closed_at             = now(),
      notes                 = nullif(btrim(coalesce(p_notes, '')), ''),
      cut_number            = v_number,
      cash_float_left       = v_float,
      cash_to_withdraw      = v_withdraw,
      result                = v_result,
      skipped_pending_orders = v_pending > 0,
      skipped_order_folios  = case when v_pending > 0 then v_folios else '{}' end
  where id = v_session.id
  returning * into v_session;

  insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_session.restaurant_id, auth.uid(), 'CLOSE_CASH_SESSION', 'CASH_SESSION', v_session.id,
    jsonb_build_object(
      'cut_number', v_number,
      'register_id', v_session.register_id,
      'result', v_result,
      'expected_cash', v_cash_expected,
      'counted_cash', v_cash_counted,
      'cash_only_difference', v_cash_counted - v_cash_expected,
      'cash_difference', v_total_diff,
      'cash_float_left', v_float,
      'cash_to_withdraw', v_withdraw,
      'skipped_pending_orders', v_pending > 0,
      'counts', p_counts
    )
  );

  if v_pending > 0 then
    insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
    values (
      v_session.restaurant_id, auth.uid(), 'UPDATE', 'CASH_SESSION', v_session.id,
      jsonb_build_object(
        'action', 'SKIP_PENDING_ORDERS',
        'cut_number', v_number,
        'pending_count', v_pending,
        'folios', to_jsonb(v_folios)
      )
    );
  end if;

  return public.get_cash_session_summary(v_session.id);
end;
$$;

revoke all on function public.cash_cut(uuid, jsonb, numeric, text, boolean) from public, anon;
grant execute on function public.cash_cut(uuid, jsonb, numeric, text, boolean) to authenticated, service_role;

-- Envoltorio compatible: misma firma y contrato que antes. NO bloquea por
-- pedidos sin cobrar (omite y deja constancia en el turno y en audit_logs);
-- la UI nueva usa cash_cut para bloquear con la lista de folios.
create or replace function public.close_cash_session(
  p_cash_session_id uuid,
  p_counts jsonb,
  p_notes text default null
)
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.cash_cut(p_cash_session_id, p_counts, null, p_notes, true);
$$;

revoke all on function public.close_cash_session(uuid, jsonb, text) from public, anon;
grant execute on function public.close_cash_session(uuid, jsonb, text) to authenticated, service_role;

-- ======================= g) lecturas para CASHIER ===========================
-- Antes del corte: cuántos pedidos sin cobrar hay y qué métodos tuvieron
-- cobros (para deshabilitar tarjeta/transferencia). Nunca montos esperados.
create or replace function public.get_cash_cut_precheck(p_cash_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session public.cash_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_session from public.cash_sessions where id = p_cash_session_id;
  if not found or not public.can_handle_cash(v_session.restaurant_id, v_session.register_id) then
    raise exception 'Turno de caja no encontrado';
  end if;

  return jsonb_build_object(
    'pending_count', (select count(*) from public.cash_pending_unpaid_orders(v_session.restaurant_id)),
    'pending_folios', coalesce((
      select jsonb_agg(p.folio order by p.folio)
      from public.cash_pending_unpaid_orders(v_session.restaurant_id) p), '[]'::jsonb),
    'has_card_payments', exists (
      select 1 from public.payments where cash_session_id = v_session.id
        and status = 'COMPLETED' and method = 'CARD'),
    'has_transfer_payments', exists (
      select 1 from public.payments where cash_session_id = v_session.id
        and status = 'COMPLETED' and method = 'TRANSFER')
  );
end;
$$;
revoke all on function public.get_cash_cut_precheck(uuid) from public, anon;
grant execute on function public.get_cash_cut_precheck(uuid) to authenticated, service_role;

-- "Último fondo de caja" por caja activa (solo las del CASHIER).
create or replace function public.get_last_cash_float(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.can_handle_cash(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'register_id', cr.id,
      'register_name', cr.name,
      'open_session_id', (select s.id from public.cash_sessions s
                          where s.register_id = cr.id and s.status = 'OPEN'),
      'cash_float_left', l.cash_float_left,
      'cut_number', l.cut_number,
      'set_by', l.closed_by,
      'set_by_name', (select pr.full_name from public.profiles pr where pr.id = l.closed_by),
      'set_at', l.closed_at
    ) order by cr.name)
    from public.cash_registers cr
    left join lateral (
      select s.cash_float_left, s.cut_number, s.closed_by, s.closed_at
      from public.cash_sessions s
      where s.register_id = cr.id and s.status = 'CLOSED' and s.cash_float_left is not null
      order by s.closed_at desc, s.id desc limit 1
    ) l on true
    where cr.restaurant_id = p_restaurant_id
      and cr.active
      and public.can_handle_cash(p_restaurant_id, cr.id)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_last_cash_float(uuid) from public, anon;
grant execute on function public.get_last_cash_float(uuid) to authenticated, service_role;

-- Cortes guardados (los esperados solo existen una vez guardado el corte).
create or replace function public.list_cash_cuts(
  p_restaurant_id uuid,
  p_register_id uuid default null,
  p_limit integer default 50,
  p_before_cut integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.can_handle_cash(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select jsonb_agg(x.j order by x.cut desc)
    from (
      select s.cut_number as cut, jsonb_build_object(
        'id', s.id,
        'cut_number', s.cut_number,
        'register_id', s.register_id,
        'register_name', cr.name,
        'closed_at', s.closed_at,
        'closed_by', s.closed_by,
        'closed_by_name', (select pr.full_name from public.profiles pr where pr.id = s.closed_by),
        'result', s.result,
        'expected_total', (select sum(c.expected) from public.cash_session_counts c where c.cash_session_id = s.id),
        'counted_total', (select sum(c.counted) from public.cash_session_counts c where c.cash_session_id = s.id),
        'difference_total', (select sum(c.difference) from public.cash_session_counts c where c.cash_session_id = s.id),
        'cash_float_left', s.cash_float_left,
        'cash_to_withdraw', s.cash_to_withdraw,
        'skipped_pending_orders', s.skipped_pending_orders,
        'skipped_order_folios', to_jsonb(s.skipped_order_folios)
      ) as j
      from public.cash_sessions s
      join public.cash_registers cr on cr.id = s.register_id
      where s.restaurant_id = p_restaurant_id
        and s.status = 'CLOSED'
        and s.cut_number is not null
        and (p_register_id is null or s.register_id = p_register_id)
        and (p_before_cut is null or s.cut_number < p_before_cut)
        and public.can_handle_cash(p_restaurant_id, s.register_id)
      order by s.cut_number desc
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_cash_cuts(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.list_cash_cuts(uuid, uuid, integer, integer) to authenticated, service_role;

-- Entradas y retiros. Las filas son movimientos de la caja (no esperados).
create or replace function public.list_cash_movements(
  p_restaurant_id uuid,
  p_register_id uuid default null,
  p_cash_session_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.can_handle_cash(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select jsonb_agg(x.j order by x.n desc)
    from (
      select m.number as n, jsonb_build_object(
        'id', m.id,
        'number', m.number,
        'type', m.type,
        'reason', m.reason,
        'amount', m.amount,
        'description', m.description,
        'cash_session_id', m.cash_session_id,
        'cut_number', s.cut_number,
        'register_id', s.register_id,
        'register_name', cr.name,
        'created_by', m.created_by,
        'created_by_name', (select pr.full_name from public.profiles pr where pr.id = m.created_by),
        'created_at', m.created_at
      ) as j
      from public.cash_movements m
      join public.cash_sessions s on s.id = m.cash_session_id
      join public.cash_registers cr on cr.id = s.register_id
      where m.restaurant_id = p_restaurant_id
        and (p_register_id is null or s.register_id = p_register_id)
        and (p_cash_session_id is null or m.cash_session_id = p_cash_session_id)
        and public.can_handle_cash(p_restaurant_id, s.register_id)
      order by m.number desc nulls last
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_cash_movements(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.list_cash_movements(uuid, uuid, uuid, integer) to authenticated, service_role;
