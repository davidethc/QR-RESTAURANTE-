
-- === HABILITAR RLS EN TODAS LAS TABLAS ===

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;

-- === FUNCIÓN HELPER: obtener restaurant_id del usuario actual ===

CREATE OR REPLACE FUNCTION public.get_user_restaurant_id()
RETURNS UUID AS $$
  SELECT restaurant_id FROM public.restaurant_members
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- === RESTAURANTS ===

-- Público: cualquiera puede leer restaurantes activos (para el QR)
CREATE POLICY "restaurants_public_read" ON public.restaurants
  FOR SELECT USING (status = 'active');

-- Staff: miembros pueden actualizar su restaurante
CREATE POLICY "restaurants_member_update" ON public.restaurants
  FOR UPDATE USING (
    id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND status = 'active')
  );

-- === PROFILES ===

-- Usuarios pueden leer y actualizar su propio perfil
CREATE POLICY "profiles_own_read" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_own_insert" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- === RESTAURANT_MEMBERS ===

-- Miembros pueden ver otros miembros de su restaurante
CREATE POLICY "members_same_restaurant_read" ON public.restaurant_members
  FOR SELECT USING (
    restaurant_id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND status = 'active')
  );

-- Solo OWNER/ADMIN pueden gestionar miembros
CREATE POLICY "members_admin_insert" ON public.restaurant_members
  FOR INSERT WITH CHECK (
    restaurant_id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND status = 'active')
  );

CREATE POLICY "members_admin_update" ON public.restaurant_members
  FOR UPDATE USING (
    restaurant_id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND status = 'active')
  );

-- === TABLES (mesas) ===

-- Público: leer mesas de restaurantes activos (necesario para validar QR)
CREATE POLICY "tables_public_read" ON public.tables
  FOR SELECT USING (
    restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'active')
  );

-- Staff: OWNER/ADMIN pueden gestionar mesas
CREATE POLICY "tables_admin_manage" ON public.tables
  FOR ALL USING (
    restaurant_id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND status = 'active')
  );

-- === CATEGORIES ===

-- Público: leer categorías activas
CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT USING (
    active = true AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'active')
  );

-- Staff: OWNER/ADMIN pueden gestionar categorías
CREATE POLICY "categories_admin_manage" ON public.categories
  FOR ALL USING (
    restaurant_id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND status = 'active')
  );

-- === PRODUCTS ===

-- Público: leer productos activos de restaurantes activos
CREATE POLICY "products_public_read" ON public.products
  FOR SELECT USING (
    active = true AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'active')
  );

-- Staff: OWNER/ADMIN pueden gestionar productos
CREATE POLICY "products_admin_manage" ON public.products
  FOR ALL USING (
    restaurant_id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND status = 'active')
  );

-- === ORDERS ===

-- Público: cualquiera puede CREAR pedidos (cliente anónimo desde QR)
CREATE POLICY "orders_public_insert" ON public.orders
  FOR INSERT WITH CHECK (
    restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'active')
  );

-- Público: leer pedidos por mesa (cliente ve estado de su pedido)
CREATE POLICY "orders_public_read" ON public.orders
  FOR SELECT USING (
    restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'active')
  );

-- Staff: miembros pueden actualizar pedidos de su restaurante
CREATE POLICY "orders_member_update" ON public.orders
  FOR UPDATE USING (
    restaurant_id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND status = 'active')
  );

-- === ORDER_ITEMS ===

-- Público: crear items al hacer pedido
CREATE POLICY "order_items_public_insert" ON public.order_items
  FOR INSERT WITH CHECK (
    order_id IN (SELECT id FROM public.orders)
  );

-- Público: leer items de pedidos visibles
CREATE POLICY "order_items_public_read" ON public.order_items
  FOR SELECT USING (
    order_id IN (SELECT id FROM public.orders)
  );

-- === WAITER_CALLS ===

-- Público: crear solicitudes (cliente llama mesero / pide cuenta)
CREATE POLICY "waiter_calls_public_insert" ON public.waiter_calls
  FOR INSERT WITH CHECK (
    restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'active')
  );

-- Público: leer estado de sus solicitudes
CREATE POLICY "waiter_calls_public_read" ON public.waiter_calls
  FOR SELECT USING (
    restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'active')
  );

-- Staff: miembros pueden actualizar solicitudes
CREATE POLICY "waiter_calls_member_update" ON public.waiter_calls
  FOR UPDATE USING (
    restaurant_id IN (SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid() AND status = 'active')
  );
