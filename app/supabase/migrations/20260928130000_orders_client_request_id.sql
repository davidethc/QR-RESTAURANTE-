-- ---------------------------------------------------------------------------
-- Caja · agregar producto durante el cobro (1/3).
--
-- orders.client_request_id: clave de idempotencia de add_items_to_bill. La
-- genera el navegador al abrir el selector y la reutiliza en los reintentos:
-- el mismo "Agregar" enviado dos veces no crea dos pedidos.
--
-- Índice único parcial: solo los pedidos creados desde la caja la llevan; el
-- resto (cliente, mesero, mostrador) queda en NULL y no ocupa el índice.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists client_request_id uuid;

comment on column public.orders.client_request_id is
  'Clave de idempotencia de add_items_to_bill (generada por el cliente). NULL en los demás pedidos.';

create unique index if not exists orders_client_request_id_uq
  on public.orders (restaurant_id, client_request_id)
  where client_request_id is not null;
