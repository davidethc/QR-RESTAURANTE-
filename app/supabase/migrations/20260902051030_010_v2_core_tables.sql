
-- Profiles
create table public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Restaurants
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

-- Restaurant Members
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
