
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

-- Product Options
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

-- Product Option Values
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
