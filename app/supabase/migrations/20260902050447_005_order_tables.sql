
-- === ORDERS ===
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  status public.order_status NOT NULL DEFAULT 'PENDING',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  accepted_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (subtotal >= 0),
  CHECK (total >= 0)
);

COMMENT ON TABLE public.orders IS 'Pedidos completos del cliente';
COMMENT ON COLUMN public.orders.accepted_by IS 'Mesero que aceptó el pedido';
COMMENT ON COLUMN public.orders.preparing_at IS 'Momento en que cocina empezó a preparar';

-- === ORDER_ITEMS ===
-- Snapshot del producto al momento del pedido (nombre y precio no cambian)
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (quantity > 0),
  CHECK (unit_price >= 0),
  CHECK (subtotal >= 0)
);

COMMENT ON TABLE public.order_items IS 'Items de un pedido con snapshot de nombre/precio';
COMMENT ON COLUMN public.order_items.product_name IS 'Snapshot: nombre del producto al momento del pedido';
COMMENT ON COLUMN public.order_items.unit_price IS 'Snapshot: precio unitario al momento del pedido';
COMMENT ON COLUMN public.order_items.product_id IS 'Referencia al producto original (SET NULL si se elimina)';

-- === WAITER_CALLS ===
CREATE TABLE public.waiter_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  type public.call_type NOT NULL DEFAULT 'WAITER',
  status public.call_status NOT NULL DEFAULT 'PENDING',
  handled_by UUID REFERENCES auth.users(id),
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.waiter_calls IS 'Solicitudes de atención del cliente (independientes de pedidos)';
COMMENT ON COLUMN public.waiter_calls.type IS 'WAITER = llamar mesero, BILL = solicitar cuenta';
