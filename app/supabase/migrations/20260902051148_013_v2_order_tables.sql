
-- Orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  restaurant_id uuid not null
    references public.restaurants(id)
    on delete restrict,
  table_id uuid not null
    references public.tables(id)
    on delete restrict,
  table_session_id uuid
    references public.table_sessions(id)
    on delete set null,
  status public.order_status not null default 'PENDING',
  subtotal numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  notes text,
  accepted_by uuid
    references public.profiles(id)
    on delete set null,
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_subtotal_non_negative check (subtotal >= 0),
  constraint orders_total_non_negative check (total >= 0)
);

-- Order Items
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null
    references public.orders(id)
    on delete cascade,
  product_id uuid
    references public.products(id)
    on delete set null,
  product_name text not null,
  quantity integer not null,
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_non_negative check (unit_price >= 0),
  constraint order_items_subtotal_non_negative check (subtotal >= 0)
);

-- Order Item Options
create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null
    references public.order_items(id)
    on delete cascade,
  option_name text not null,
  value_name text not null,
  price_modifier numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Waiter Calls
create table public.waiter_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,
  table_id uuid not null
    references public.tables(id)
    on delete restrict,
  table_session_id uuid
    references public.table_sessions(id)
    on delete set null,
  type public.waiter_call_type not null,
  status public.waiter_call_status not null default 'PENDING',
  handled_by uuid
    references public.profiles(id)
    on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Audit Logs
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid
    references public.restaurants(id)
    on delete cascade,
  user_id uuid
    references public.profiles(id)
    on delete set null,
  action public.audit_action not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
