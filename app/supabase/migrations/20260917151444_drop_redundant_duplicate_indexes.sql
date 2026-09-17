-- idx_tables_qr_token y idx_table_sessions_token son índices btree
-- redundantes: las columnas ya tienen un índice único vía UNIQUE
-- constraint (tables_qr_token_key, table_sessions_session_token_key)
-- que cubre exactamente las mismas búsquedas. Mantener ambos solo
-- duplica el costo de escritura sin beneficio de lectura.
drop index if exists public.idx_tables_qr_token;
drop index if exists public.idx_table_sessions_token;
