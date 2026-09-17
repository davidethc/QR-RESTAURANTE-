
CREATE TABLE public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT,
  status public.table_status NOT NULL DEFAULT 'available',
  qr_token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, number)
);

COMMENT ON TABLE public.tables IS 'Mesas del restaurante, cada una con QR único';
COMMENT ON COLUMN public.tables.qr_token IS 'Token único para el QR — identifica restaurante + mesa';
COMMENT ON COLUMN public.tables.number IS 'Número visible de mesa (único por restaurante)';
