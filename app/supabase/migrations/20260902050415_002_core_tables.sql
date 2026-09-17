
-- === RESTAURANTS ===
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  phone TEXT,
  address TEXT,
  status public.restaurant_status NOT NULL DEFAULT 'active',
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  opening_hours JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.restaurants IS 'Restaurantes registrados en la plataforma';
COMMENT ON COLUMN public.restaurants.slug IS 'URL amigable: /r/la-casa-del-sabor';
COMMENT ON COLUMN public.restaurants.opening_hours IS 'Horarios por día: {"mon": {"open": "11:00", "close": "22:00"}, ...}';

-- === PROFILES ===
-- Separado de auth.users (Supabase Auth maneja contraseñas)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Perfil público del usuario, vinculado a auth.users';

-- === RESTAURANT_MEMBERS ===
-- Relación usuario <-> restaurante con rol
CREATE TABLE public.restaurant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.member_role NOT NULL DEFAULT 'WAITER',
  status public.member_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, user_id)
);

COMMENT ON TABLE public.restaurant_members IS 'Miembros del staff de cada restaurante con su rol';
