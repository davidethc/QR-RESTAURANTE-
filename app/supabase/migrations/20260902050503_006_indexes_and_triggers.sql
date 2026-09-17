
-- === INDEXES DE PERFORMANCE ===

-- Pedidos: búsqueda por restaurante + estado (consulta más frecuente)
CREATE INDEX idx_orders_restaurant_status ON public.orders(restaurant_id, status);

-- Pedidos: búsqueda por mesa
CREATE INDEX idx_orders_table ON public.orders(table_id);

-- Items: búsqueda por pedido
CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- Productos: búsqueda por categoría dentro de restaurante
CREATE INDEX idx_products_restaurant_category ON public.products(restaurant_id, category_id);

-- Productos: filtrar activos y disponibles (consulta del cliente)
CREATE INDEX idx_products_active_available ON public.products(restaurant_id) WHERE active = true AND available = true;

-- Categorías: orden dentro de restaurante
CREATE INDEX idx_categories_restaurant_position ON public.categories(restaurant_id, position);

-- Mesas: búsqueda por QR token (escaneo del cliente)
CREATE INDEX idx_tables_qr_token ON public.tables(qr_token);

-- Mesas: por restaurante
CREATE INDEX idx_tables_restaurant ON public.tables(restaurant_id);

-- Solicitudes: pendientes por restaurante (vista del mesero)
CREATE INDEX idx_waiter_calls_restaurant_status ON public.waiter_calls(restaurant_id, status);

-- Miembros: buscar rol de usuario en restaurante
CREATE INDEX idx_members_restaurant_user ON public.restaurant_members(restaurant_id, user_id);

-- Restaurante: búsqueda por slug (acceso público)
CREATE INDEX idx_restaurants_slug ON public.restaurants(slug);

-- === TRIGGERS: auto-actualizar updated_at ===

CREATE TRIGGER set_updated_at_restaurants
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_updated_at_restaurant_members
  BEFORE UPDATE ON public.restaurant_members
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_updated_at_tables
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_updated_at_categories
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_updated_at_orders
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);
