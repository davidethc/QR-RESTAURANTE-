-- ---------------------------------------------------------------------------
-- Módulo 1 · M7 · Cuentas, descuentos, pagos e ítems pagados.
--
-- Depende de M5 (enums bill_status, bill_split_mode, discount_kind,
-- payment_method, payment_status) y M6 (cash_sessions).
--
-- Invariantes que la base garantiza por sí misma (CHECK):
--   total   = subtotal - discount_total
--   balance = total - paid_total,  balance >= 0
--   PAID / CLOSED  => balance = 0
--   CASH  => tendered >= amount + tip  y  change = tendered - amount - tip
-- Una cuenta viva (no VOID) por sesión de mesa: índice único parcial.
-- Doble cobro: unique(restaurant_id, idempotency_key) en payments.
--
-- Los campos customer_* e invoice_id quedan nulos: son el punto de
-- extensión para la facturación electrónica SRI (fuera de alcance).
-- ---------------------------------------------------------------------------

create table public.bills (
  id               uuid primary key default gen_random_uuid(),
  bill_number      bigint generated always as identity,
  restaurant_id    uuid not null references public.restaurants(id) on delete restrict,
  table_id         uuid not null references public.tables(id) on delete restrict,
  table_session_id uuid not null references public.table_sessions(id) on delete restrict,
  status           public.bill_status not null default 'OPEN',

  subtotal         numeric(10,2) not null default 0 check (subtotal >= 0),
  discount_total   numeric(10,2) not null default 0 check (discount_total >= 0),
  total            numeric(10,2) not null default 0 check (total >= 0),
  paid_total       numeric(10,2) not null default 0 check (paid_total >= 0),
  tip_total        numeric(10,2) not null default 0 check (tip_total >= 0),
  balance          numeric(10,2) not null default 0,

  split_mode       public.bill_split_mode not null default 'NONE',
  split_parts      smallint not null default 1 check (split_parts between 1 and 50),

  opened_by        uuid references public.profiles(id) on delete set null,
  opened_at        timestamptz not null default now(),
  paid_at          timestamptz,
  closed_by        uuid references public.profiles(id) on delete set null,
  closed_at        timestamptz,
  voided_by        uuid references public.profiles(id) on delete set null,
  voided_at        timestamptz,
  void_reason      text,

  -- Extensión SRI (siempre nulos por ahora).
  customer_id      uuid,
  customer_tax_id  text,
  customer_name    text,
  customer_email   text,
  invoice_id       uuid,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint bills_bill_number_key unique (bill_number),
  constraint bills_total_matches   check (total = subtotal - discount_total),
  constraint bills_balance_matches check (balance = total - paid_total),
  constraint bills_balance_nonneg  check (balance >= 0),
  constraint bills_settled_check   check (status not in ('PAID', 'CLOSED') or balance = 0),
  constraint bills_closed_check    check (status <> 'CLOSED' or closed_at is not null),
  constraint bills_void_check      check (
    status <> 'VOID' or (voided_at is not null and length(btrim(coalesce(void_reason, ''))) >= 3)
  ),
  constraint bills_split_check     check (
    (split_mode = 'EQUAL' and split_parts >= 2)
    or (split_mode <> 'EQUAL' and split_parts = 1)
  )
);

create unique index bills_one_live_per_session
  on public.bills (table_session_id) where status <> 'VOID';
create index bills_restaurant_status_idx on public.bills (restaurant_id, status);
create index bills_restaurant_closed_idx on public.bills (restaurant_id, closed_at) where status = 'CLOSED';
create index bills_table_idx on public.bills (table_id);
create index bills_opened_by_idx on public.bills (opened_by);
create index bills_closed_by_idx on public.bills (closed_by);
create index bills_voided_by_idx on public.bills (voided_by);

create trigger bills_set_updated_at
before update on public.bills
for each row execute function public.set_updated_at();


create table public.bill_discounts (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete restrict,
  bill_id        uuid not null references public.bills(id) on delete restrict,
  -- null = descuento sobre toda la cuenta.
  order_item_id  uuid references public.order_items(id) on delete restrict,
  kind           public.discount_kind not null,
  value          numeric(10,2) not null check (value > 0),
  -- Monto efectivo en dinero; lo mantiene recompute_bill.
  amount         numeric(10,2) not null default 0 check (amount >= 0),
  reason         text not null check (length(btrim(reason)) between 3 and 200),
  applied_by     uuid references public.profiles(id) on delete set null,
  applied_at     timestamptz not null default now(),
  removed_by     uuid references public.profiles(id) on delete set null,
  removed_at     timestamptz,
  removed_reason text,
  constraint bill_discounts_percent_check check (kind <> 'PERCENT' or value <= 100)
);

create index bill_discounts_bill_active_idx on public.bill_discounts (bill_id) where removed_at is null;
create index bill_discounts_restaurant_applied_idx on public.bill_discounts (restaurant_id, applied_at);
create index bill_discounts_order_item_idx on public.bill_discounts (order_item_id);
create index bill_discounts_applied_by_idx on public.bill_discounts (applied_by);
create index bill_discounts_removed_by_idx on public.bill_discounts (removed_by);


create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete restrict,
  bill_id         uuid not null references public.bills(id) on delete restrict,
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  method          public.payment_method not null,
  amount          numeric(10,2) not null check (amount > 0),
  tip_amount      numeric(10,2) not null default 0 check (tip_amount >= 0),
  tendered_amount numeric(10,2),
  change_amount   numeric(10,2),
  reference       text check (reference is null or length(reference) <= 100),
  card_type       text check (card_type is null or length(card_type) <= 40),
  status          public.payment_status not null default 'COMPLETED',
  received_by     uuid references public.profiles(id) on delete set null,
  received_at     timestamptz not null default now(),
  idempotency_key uuid not null,
  voided_by       uuid references public.profiles(id) on delete set null,
  voided_at       timestamptz,
  void_reason     text,
  -- Extensión SRI.
  invoice_id      uuid,
  created_at      timestamptz not null default now(),

  constraint payments_idempotency_key unique (restaurant_id, idempotency_key),
  constraint payments_cash_check check (
    (method = 'CASH'
      and tendered_amount is not null
      and tendered_amount >= amount + tip_amount
      and change_amount = tendered_amount - amount - tip_amount)
    or (method <> 'CASH' and tendered_amount is null and change_amount is null)
  ),
  constraint payments_void_check check (
    status <> 'VOIDED' or (voided_at is not null and length(btrim(coalesce(void_reason, ''))) >= 3)
  )
);

create index payments_bill_idx on public.payments (bill_id);
create index payments_cash_session_idx on public.payments (cash_session_id);
create index payments_restaurant_received_idx on public.payments (restaurant_id, received_at);
create index payments_received_by_idx on public.payments (received_by);
create index payments_voided_by_idx on public.payments (voided_by);


create table public.payment_items (
  payment_id    uuid not null references public.payments(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  primary key (payment_id, order_item_id)
);

-- "La suma pagada de un ítem nunca supera su quantity" lo valida
-- record_payment bajo el candado de la cuenta (necesita mirar pagos
-- COMPLETED de varias filas; no se expresa como CHECK).
create index payment_items_order_item_idx on public.payment_items (order_item_id);
create index payment_items_restaurant_idx on public.payment_items (restaurant_id);


alter table public.bills          enable row level security;
alter table public.bill_discounts enable row level security;
alter table public.payments       enable row level security;
alter table public.payment_items  enable row level security;

create policy bills_select_staff on public.bills
for select to authenticated
using (
  public.user_has_restaurant_role(restaurant_id, 'OWNER')
  or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  or public.user_has_restaurant_role(restaurant_id, 'WAITER')
);

create policy bill_discounts_select_staff on public.bill_discounts
for select to authenticated
using (
  public.user_has_restaurant_role(restaurant_id, 'OWNER')
  or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  or public.user_has_restaurant_role(restaurant_id, 'WAITER')
);

create policy payments_select_staff on public.payments
for select to authenticated
using (
  public.user_has_restaurant_role(restaurant_id, 'OWNER')
  or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  or public.user_has_restaurant_role(restaurant_id, 'WAITER')
);

create policy payment_items_select_staff on public.payment_items
for select to authenticated
using (
  public.user_has_restaurant_role(restaurant_id, 'OWNER')
  or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  or public.user_has_restaurant_role(restaurant_id, 'WAITER')
);

revoke all on table public.bills, public.bill_discounts,
  public.payments, public.payment_items from anon, authenticated;
grant select on table public.bills, public.bill_discounts,
  public.payments, public.payment_items to authenticated;
