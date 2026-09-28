-- ---------------------------------------------------------------------------
-- Fase 0 · M3b · Índices parciales para el estado de mesa en vivo.
--
-- table_effective_status() y get_tables_status() (M3) preguntan, por mesa,
-- si hay pedidos activos (PENDING..READY) y llamadas abiertas
-- (PENDING/ACCEPTED). Esas filas son una fracción mínima del histórico; un
-- índice parcial las cubre sin crecer con los pedidos ya entregados.
--
-- Sin CONCURRENTLY: apply_migration corre en transacción y la tabla es
-- pequeña, así que el bloqueo es instantáneo.
--
-- Defensa en profundidad (aprobada por security-reviewer): anon no tiene
-- ninguna política de UPDATE sobre restaurants, pero conservaba el privilegio
-- de tabla. Se revoca para que una política futura mal escrita no lo abra.
-- ---------------------------------------------------------------------------

create index if not exists idx_orders_table_active
  on public.orders (table_id)
  where status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY');

create index if not exists idx_waiter_calls_table_open
  on public.waiter_calls (table_id, type)
  where status in ('PENDING', 'ACCEPTED');

revoke update on public.restaurants from anon;
