-- ---------------------------------------------------------------------------
-- Módulo 2 · M13 · Costo por ítem e índices de reportes.
--
-- order_items.unit_cost: snapshot del costo unitario al momento de la venta.
-- Queda nulo hasta que el módulo 3 (trigger orders_consume_stock) lo llene.
--
-- Índices que usan las RPCs report_*:
--   * orders DELIVERED por delivered_at  -> ventas por producto/categoría,
--     respaldo delivered_orders_total, ventas por mesero.
--   * orders por accepted_at con ready_at -> tiempos de preparación.
-- Ya existen en producción (no se duplican):
--   * bills_restaurant_closed_idx (restaurant_id, closed_at) where CLOSED
--   * payments_restaurant_received_idx (restaurant_id, received_at)
--   * bill_discounts_restaurant_applied_idx (restaurant_id, applied_at)
--
-- Las tablas son chicas hoy; se crean sin CONCURRENTLY porque la migración
-- corre dentro de una transacción.
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists unit_cost numeric(12,4)
  check (unit_cost is null or unit_cost >= 0);

comment on column public.order_items.unit_cost is
  'Costo unitario (snapshot) al entregar el pedido. Lo llena el módulo de inventario; nulo si no hay receta.';

-- El costo es dato de OWNER/ADMIN. La política order_items_select_staff deja
-- leer a todo el staff (WAITER, KITCHEN), así que se quita SELECT a nivel de
-- tabla y se concede por columna sin unit_cost. Los reportes lo leen vía RPC
-- SECURITY DEFINER. Si se añade una columna a order_items, hay que
-- concederla aquí también.
revoke select on public.order_items from anon, authenticated;
grant select (id, order_id, product_id, product_name, quantity, unit_price, subtotal, notes, created_at)
  on public.order_items to authenticated;

create index if not exists orders_restaurant_delivered_idx
  on public.orders (restaurant_id, delivered_at)
  where status = 'DELIVERED';

create index if not exists orders_restaurant_accepted_ready_idx
  on public.orders (restaurant_id, accepted_at)
  where ready_at is not null;
