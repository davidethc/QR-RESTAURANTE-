-- ---------------------------------------------------------------------------
-- Índice para la FK compuesta table_sessions_table_kind_fkey
-- (table_id, table_kind) -> tables(id, kind) ON DELETE CASCADE.
--
-- Sin un índice que empiece por (table_id, table_kind), borrar una mesa o
-- cambiar su clave recorre table_sessions entera para validar la FK
-- (advisor unindexed_foreign_keys). table_sessions es chica hoy, así que
-- se crea sin CONCURRENTLY dentro de la migración.
-- ---------------------------------------------------------------------------

create index if not exists idx_table_sessions_table_kind
  on public.table_sessions (table_id, table_kind);
