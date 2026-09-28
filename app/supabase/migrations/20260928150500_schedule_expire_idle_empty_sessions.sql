-- ---------------------------------------------------------------------------
-- Robustez de sesiones (6/6) · Job de pg_cron cada 30 min.
--
-- pg_cron está disponible en el proyecto (list_extensions: 1.6.4) pero no
-- estaba instalada. Se instala en pg_catalog, como lo hace el panel de
-- Supabase. cron.schedule con nombre es idempotente: si el job ya existe,
-- lo actualiza en vez de duplicarlo.
--
-- El job corre como postgres y solo llama a
-- expire_idle_empty_table_sessions() (sesiones sin ningún pedido).
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'expire-idle-empty-table-sessions',
  '*/30 * * * *',
  $$select public.expire_idle_empty_table_sessions()$$
);
