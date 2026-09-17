
-- === CATEGORIES ===
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.categories IS 'Categorías del menú: Entradas, Platos, Bebidas, Postres, etc.';
COMMENT ON COLUMN public.categories.position IS 'Orden visual en el menú (menor = primero)';

-- === PRODUCTS ===
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  available BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (price >= 0)
);

COMMENT ON TABLE public.products IS 'Productos/platos del menú';
COMMENT ON COLUMN public.products.active IS 'Pertenece a la carta (desactivar = quitar del menú)';
COMMENT ON COLUMN public.products.available IS 'Disponible para vender (false = temporalmente agotado)';
COMMENT ON COLUMN public.products.price IS 'Precio en moneda local, mínimo 0';
