-- Índices en columnas FK sin cobertura, detectados por el advisor de
-- rendimiento de Supabase (lint unindexed_foreign_keys) sobre el proyecto
-- real (fvzxfbzujvkkvniyphps). Aditivo: solo crea índices, no toca datos.
--
-- ⚠️ NOTA DE DESINCRONIZACIÓN: las migraciones en esta carpeta (6 archivos,
-- fechadas 2026-09-17) NO reflejan el historial real del proyecto Supabase
-- conectado, que tiene 60 migraciones aplicadas (desde 20260902050403 hasta
-- 20260916195027) con columnas y funciones que no existen aquí — por
-- ejemplo `products.paired_drink_id`, `products.featured`,
-- `orders.rejection_reason`, y todas las funciones RPC que usa la app
-- (get_public_menu, get_admin_menu, get_staff_orders, etc.) no están
-- definidas en ningún archivo de esta carpeta. Este archivo solo cubre los
-- índices para columnas que SÍ existen en el schema local de referencia;
-- `idx_products_paired_drink` se aplicó directamente en el proyecto remoto
-- pero no se declara aquí porque la columna `paired_drink_id` no existe en
-- `create_tables.sql` de este repo. Recomendación: regenerar esta carpeta
-- con `supabase db pull` para que quede alineada con el proyecto real.

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

create index if not exists idx_waiter_calls_handled_by
  on public.waiter_calls (handled_by);
