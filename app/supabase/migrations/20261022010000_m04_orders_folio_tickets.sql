-- ---------------------------------------------------------------------------
-- M04-T01 · Folio, código corto, tipo de servicio y comandas por ronda (EXPAND).
-- Fuente: docs/pos-spec/M04-pedido-mesa-comandas.md §3, §5, §10 y M00-base.md.
--
-- Compatible con la app actual: todas las columnas nuevas tienen default o
-- las rellena un trigger BEFORE INSERT, así que create_customer_order,
-- create_staff_order y create_counter_sale funcionan sin cambios.
-- orders.order_number (identidad global) se conserva intacto.
--
-- Decisiones:
--   * Se mantiene el modelo vigente "una ronda = una fila de orders" y se
--     añade tickets (comanda) como agrupador de líneas: cada pedido existente
--     recibe su comanda #1. Las RPC actuales siguen creando un order por ronda.
--   * Folio: contador por restaurante (order_counters) con fila bloqueada por
--     INSERT ... ON CONFLICT DO UPDATE. Sin huecos: si la transacción hace
--     rollback, el contador también. Serializa altas por restaurante hasta el
--     commit (aceptable al volumen de un restaurante).
--   * short_code: 5 caracteres A-Z/2-9 (sin I, O, 0, 1 por legibilidad),
--     único por restaurante; el trigger reintenta ante colisión.
--   * service_type: default 'table'; el trigger lo pasa a 'dine_in_no_table'
--     si la mesa es COUNTER. 'takeaway','delivery','pickup' los fijará M06.
--   * cancelled: backfill true para status = CANCELLED; cancel_reason queda
--     null en históricos. La obligatoriedad del motivo la impondrá la RPC de
--     cancelación (M04-T0x), no un CHECK (rompería históricos).
--   * Comandas existentes: kitchen_status 'completed' si el pedido está
--     READY/DELIVERED, si no 'pending'; is_new = false; created_by null (no se
--     conoce el autor histórico, null también significa menú digital).
--   * Trigger en order_items: si llega sin ticket_id usa la última comanda del
--     pedido o crea la #1. Abrir una ronda nueva (#2..N) es trabajo de M04-T02.
--   * order_items.cancelled y ticket_id se conceden por columna (unit_cost
--     sigue sin ser legible por authenticated). name_snapshot/unit_price_snapshot
--     de la spec ya existen como product_name/unit_price.
--   * Los pedidos de mesa vacíos (sin items) consumen folio al insertarse.
--
-- Rollback: revertir primero el código consumidor; conservar tablas/columnas
-- (la app anterior funciona con la expansión). No hacer DROP de datos; una
-- retirada física requeriría una migración CONTRACT separada.
-- ---------------------------------------------------------------------------

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Contador de folios por restaurante (interno: solo triggers/service_role).
create table public.order_counters (
  restaurant_id uuid primary key references public.restaurants (id) on delete restrict,
  last_folio integer not null default 0 check (last_folio >= 0)
);
alter table public.order_counters enable row level security;
revoke all on table public.order_counters from public, anon, authenticated;
grant all on table public.order_counters to service_role;

-- Comandas (rondas).
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  number integer not null check (number >= 1),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  kitchen_status text not null default 'pending'
    check (kitchen_status in ('pending', 'completed')),
  completed_at timestamptz,
  is_new boolean not null default true,
  constraint tickets_order_number_key unique (order_id, number),
  constraint tickets_completed_at_consistent
    check ((kitchen_status = 'completed') = (completed_at is not null))
);
create index tickets_created_by_idx on public.tickets (created_by) where created_by is not null;
create index tickets_pending_idx on public.tickets (order_id) where kitchen_status = 'pending';

alter table public.tickets enable row level security;
create policy tickets_select_staff on public.tickets
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and public.user_belongs_to_restaurant(o.restaurant_id)
    )
  );
revoke all on table public.tickets from public, anon, authenticated;
grant select on table public.tickets to authenticated;
grant all on table public.tickets to service_role;

-- Columnas nuevas (ACCESS EXCLUSIVE hasta el final: no se cuelan altas).
alter table public.orders
  add column folio integer,
  add column short_code text,
  add column service_type text not null default 'table',
  add column status_review text not null default 'reviewed',
  add column cancelled boolean not null default false,
  add column cancel_reason text,
  add column cancelled_by uuid references auth.users (id) on delete set null,
  add constraint orders_service_type_valid check (
    service_type in ('dine_in_no_table', 'takeaway', 'delivery', 'table', 'pickup')),
  add constraint orders_status_review_valid check (status_review in ('new', 'reviewed')),
  add constraint orders_folio_positive check (folio >= 1),
  add constraint orders_short_code_valid check (short_code ~ '^[A-Z0-9]{5}$');

alter table public.order_items
  add column ticket_id uuid references public.tickets (id) on delete restrict,
  add column cancelled boolean not null default false;

create index order_items_ticket_idx on public.order_items (ticket_id) where ticket_id is not null;
create index orders_cancelled_by_idx on public.orders (cancelled_by) where cancelled_by is not null;
create unique index orders_restaurant_folio_uq on public.orders (restaurant_id, folio);
create unique index orders_restaurant_short_code_uq on public.orders (restaurant_id, short_code);

grant select (ticket_id, cancelled) on public.order_items to authenticated;

-- Generador de código corto (único por restaurante, reintenta si choca).
create or replace function public.generate_order_short_code(p_restaurant_id uuid)
returns text
language plpgsql
volatile
set search_path to 'public', 'pg_temp'
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try integer := 0;
begin
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(c_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.orders where restaurant_id = p_restaurant_id and short_code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'No se pudo generar un código corto único';
    end if;
  end loop;
  return v_code;
end;
$$;

-- Backfill (sin registrar como edición humana; triggers de estado no se
-- disparan porque solo se actualizan columnas nuevas).
alter table public.orders disable trigger orders_set_updated_at;

with numbered as (
  select id, row_number() over (partition by restaurant_id order by created_at, order_number) as rn
  from public.orders
)
update public.orders o set folio = n.rn
from numbered n where n.id = o.id and o.folio is null;

do $$
declare r record;
begin
  for r in select id, restaurant_id from public.orders where short_code is null order by created_at loop
    update public.orders set short_code = public.generate_order_short_code(r.restaurant_id) where id = r.id;
  end loop;
end;
$$;

update public.orders o
set service_type = 'dine_in_no_table'
from public.tables t
where t.id = o.table_id and t.kind = 'COUNTER';

update public.orders set cancelled = true where status = 'CANCELLED';

alter table public.orders enable trigger orders_set_updated_at;

insert into public.order_counters (restaurant_id, last_folio)
select restaurant_id, max(folio) from public.orders group by restaurant_id
on conflict (restaurant_id) do update set last_folio = excluded.last_folio;

alter table public.orders
  alter column folio set not null,
  alter column short_code set not null;

-- Una comanda #1 por pedido existente y sus items apuntando a ella.
insert into public.tickets (order_id, number, created_at, kitchen_status, completed_at, is_new)
select o.id, 1, o.created_at,
  case when o.status in ('READY', 'DELIVERED') then 'completed' else 'pending' end,
  case when o.status in ('READY', 'DELIVERED')
    then coalesce(o.ready_at, o.delivered_at, o.created_at) end,
  false
from public.orders o
on conflict (order_id, number) do nothing;

update public.order_items i set ticket_id = t.id
from public.tickets t
where t.order_id = i.order_id and t.number = 1 and i.ticket_id is null;

-- Trigger: folio, código, tipo de servicio en pedidos nuevos.
create or replace function public.trg_orders_assign_identity()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.folio is null then
    insert into public.order_counters as c (restaurant_id, last_folio)
    values (new.restaurant_id, 1)
    on conflict (restaurant_id) do update set last_folio = c.last_folio + 1
    returning c.last_folio into new.folio;
  end if;

  if new.short_code is null then
    new.short_code := public.generate_order_short_code(new.restaurant_id);
  end if;

  if new.service_type = 'table'
     and exists (select 1 from public.tables t where t.id = new.table_id and t.kind = 'COUNTER') then
    new.service_type := 'dine_in_no_table';
  end if;

  return new;
end;
$$;

create trigger orders_assign_identity
before insert on public.orders
for each row execute function public.trg_orders_assign_identity();

-- Trigger: item sin ticket_id -> última comanda del pedido o la #1.
create or replace function public.trg_order_items_assign_ticket()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.ticket_id is null then
    select t.id into new.ticket_id
    from public.tickets t where t.order_id = new.order_id
    order by t.number desc limit 1;

    if new.ticket_id is null then
      insert into public.tickets (order_id, number, created_by)
      values (new.order_id, 1, auth.uid())
      on conflict (order_id, number) do nothing;

      select t.id into new.ticket_id
      from public.tickets t where t.order_id = new.order_id
      order by t.number desc limit 1;
    end if;
  end if;
  return new;
end;
$$;

create trigger order_items_assign_ticket
before insert on public.order_items
for each row execute function public.trg_order_items_assign_ticket();

revoke all on function public.generate_order_short_code(uuid) from public, anon, authenticated;
revoke all on function public.trg_orders_assign_identity() from public, anon, authenticated;
revoke all on function public.trg_order_items_assign_ticket() from public, anon, authenticated;
grant execute on function public.generate_order_short_code(uuid) to service_role;
