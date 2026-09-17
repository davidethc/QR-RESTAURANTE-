
-- Tables
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

-- Table Sessions
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
