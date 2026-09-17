-- Índices en columnas FK que el advisor de rendimiento de Supabase marcó
-- como sin cobertura (unindexed_foreign_keys, 8 hallazgos, 2026-09-17).
-- Aditivo y seguro: solo agrega índices, no toca datos ni columnas.
-- No se usa CONCURRENTLY porque las tablas son pequeñas hoy (<110 filas)
-- y esta migración corre dentro de una transacción de todas formas.

create index if not exists idx_audit_logs_user
  on public.audit_logs (user_id);

create index if not exists idx_order_item_options_order_item
  on public.order_item_options (order_item_id);

create index if not exists idx_orders_accepted_by
  on public.orders (accepted_by);

create index if not exists idx_product_option_values_option
  on public.product_option_values (product_option_id);

create index if not exists idx_product_options_product
  on public.product_options (product_id);

create index if not exists idx_products_category
  on public.products (category_id);

create index if not exists idx_products_paired_drink
  on public.products (paired_drink_id);

create index if not exists idx_waiter_calls_handled_by
  on public.waiter_calls (handled_by);
