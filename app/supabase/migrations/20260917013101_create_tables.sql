-- Profiles table (extends auth.users)
create table public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Restaurants table
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  cover_image_url text,
  phone text,
  address text,
  status public.restaurant_status not null default 'ACTIVE',
  timezone text not null default 'America/Guayaquil',
  opening_hours jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Restaurant members
create table public.restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

-- Tables (restaurant tables/seats)
create table public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,
  number integer not null,
  name text,
  status public.table_status not null default 'AVAILABLE',
  qr_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tables_number_positive check (number > 0),
  unique (restaurant_id, number)
);

-- Table sessions (anonymous client sessions)
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,
  table_id uuid not null
    references public.tables(id)
    on delete cascade,
  session_token uuid not null default gen_random_uuid() unique,
  status public.table_session_status not null default 'ACTIVE',
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz
);

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,
  name text not null,
  description text,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,
  category_id uuid
    references public.categories(id)
    on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null,
  image_url text,
  active boolean not null default true,
  available boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_price_non_negative check (price >= 0)
);

-- Product options (for sizes, extras, etc.)
create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products(id)
    on delete cascade,
  name text not null,
  type text not null,
  required boolean not null default false,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Product option values
create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  product_option_id uuid not null
    references public.product_options(id)
    on delete cascade,
  name text not null,
  price_modifier numeric(10,2) not null default 0,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Order items (snapshot of products at order time)
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

-- Order item options (snapshot of chosen options)
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

-- Waiter calls (requests for waiter/bill)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit logs
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
