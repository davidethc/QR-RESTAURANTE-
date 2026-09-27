-- ---------------------------------------------------------------------------
-- Módulo 1 · M6 · Cajas, turnos de caja, movimientos y conteos.
--
-- Depende de M5 (enums cash_session_status, cash_movement_type,
-- cash_movement_reason, payment_method).
--
-- Reglas:
--   · Una caja ("Caja principal") por restaurante; el modelo admite varias.
--   · Un solo turno OPEN por caja (índice único parcial).
--   · Todas las escrituras van por RPC (M9). Las tablas solo tienen SELECT.
--   · cash_movements y cash_session_counts: solo OWNER/ADMIN (cierre ciego).
--     cash_sessions (visible al mesero) no guarda esperados, conteos ni
--     diferencias: el cierre es ciego antes Y después de cerrar.
--   · cash_session_counts: una fila por método de pago en cada cierre.
--   · restaurant_id se denormaliza en cada tabla para que RLS no necesite
--     joins y para las claves únicas de idempotencia.
--   · Registros de dinero: ON DELETE RESTRICT. Nunca se borran; se anulan.
-- ---------------------------------------------------------------------------

create table public.cash_registers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  name          text not null check (length(btrim(name)) between 1 and 60),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cash_registers_restaurant_name_key unique (restaurant_id, name)
);

create trigger cash_registers_set_updated_at
before update on public.cash_registers
for each row execute function public.set_updated_at();

insert into public.cash_registers (restaurant_id, name)
select r.id, 'Caja principal'
from public.restaurants r
on conflict (restaurant_id, name) do nothing;

create or replace function public.create_default_cash_register()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.cash_registers (restaurant_id, name)
  values (new.id, 'Caja principal')
  on conflict (restaurant_id, name) do nothing;
  return null;
end;
$$;

revoke all on function public.create_default_cash_register() from public, anon, authenticated;

create trigger restaurants_create_default_cash_register
after insert on public.restaurants
for each row execute function public.create_default_cash_register();


create table public.cash_sessions (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete restrict,
  register_id     uuid not null references public.cash_registers(id) on delete restrict,
  status          public.cash_session_status not null default 'OPEN',
  opened_by       uuid references public.profiles(id) on delete set null,
  opened_at       timestamptz not null default now(),
  opening_float   numeric(10,2) not null default 0 check (opening_float >= 0),
  closed_by       uuid references public.profiles(id) on delete set null,
  closed_at       timestamptz,
  -- Sin expected/counted/difference a propósito: cierre ciego también
  -- después de cerrar. Esos montos viven solo en cash_session_counts
  -- (RLS OWNER/ADMIN) y el total lo calcula get_cash_session_summary.
  notes           text check (notes is null or length(notes) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint cash_sessions_closed_check check (
    (status = 'OPEN' and closed_at is null and closed_by is null)
    or (status = 'CLOSED' and closed_at is not null)
  )
);

create unique index cash_sessions_one_open_per_register
  on public.cash_sessions (register_id) where status = 'OPEN';
create index cash_sessions_restaurant_opened_idx
  on public.cash_sessions (restaurant_id, opened_at desc);
create index cash_sessions_opened_by_idx on public.cash_sessions (opened_by);
create index cash_sessions_closed_by_idx on public.cash_sessions (closed_by);

create trigger cash_sessions_set_updated_at
before update on public.cash_sessions
for each row execute function public.set_updated_at();


create table public.cash_movements (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete restrict,
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  type            public.cash_movement_type not null,
  reason          public.cash_movement_reason not null,
  amount          numeric(10,2) not null check (amount > 0),
  description     text check (description is null or length(description) <= 300),
  -- FKs a expenses/purchases se agregan en el módulo 3.
  expense_id      uuid,
  purchase_id     uuid,
  idempotency_key uuid not null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint cash_movements_idempotency_key unique (restaurant_id, idempotency_key)
);

create index cash_movements_session_idx on public.cash_movements (cash_session_id);
create index cash_movements_created_by_idx on public.cash_movements (created_by);


create table public.cash_session_counts (
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  method          public.payment_method not null,
  restaurant_id   uuid not null references public.restaurants(id) on delete restrict,
  expected        numeric(10,2) not null,
  counted         numeric(10,2) check (counted is null or counted >= 0),
  difference      numeric(10,2),
  primary key (cash_session_id, method),
  constraint cash_session_counts_difference_check check (
    (counted is null and difference is null)
    or (counted is not null and difference = counted - expected)
  )
);

create index cash_session_counts_restaurant_idx on public.cash_session_counts (restaurant_id);


-- RLS: solo lectura. Las escrituras pasan por RPCs SECURITY DEFINER.
alter table public.cash_registers      enable row level security;
alter table public.cash_sessions       enable row level security;
alter table public.cash_movements      enable row level security;
alter table public.cash_session_counts enable row level security;

create policy cash_registers_select_staff on public.cash_registers
for select to authenticated
using (
  public.user_has_restaurant_role(restaurant_id, 'OWNER')
  or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  or public.user_has_restaurant_role(restaurant_id, 'WAITER')
);

create policy cash_sessions_select_staff on public.cash_sessions
for select to authenticated
using (
  public.user_has_restaurant_role(restaurant_id, 'OWNER')
  or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  or public.user_has_restaurant_role(restaurant_id, 'WAITER')
);

create policy cash_movements_select_admin on public.cash_movements
for select to authenticated
using (
  public.user_has_restaurant_role(restaurant_id, 'OWNER')
  or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
);

create policy cash_session_counts_select_admin on public.cash_session_counts
for select to authenticated
using (
  public.user_has_restaurant_role(restaurant_id, 'OWNER')
  or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
);

revoke all on table public.cash_registers, public.cash_sessions,
  public.cash_movements, public.cash_session_counts from anon, authenticated;
grant select on table public.cash_registers, public.cash_sessions,
  public.cash_movements, public.cash_session_counts to authenticated;
