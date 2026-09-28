-- ---------------------------------------------------------------------------
-- Permisos (4/6) · anon no escribe en ninguna tabla de public.
--
-- El cliente de la mesa (anon) solo usa RPCs SECURITY DEFINER
-- (resolve_table_qr, create_customer_order, create_waiter_call,
-- get_session_*, get_public_menu). Ninguna tabla tiene política RLS de
-- escritura para anon, pero los grants de tabla seguían abiertos
-- (TRUNCATE incluso se salta RLS). Se quitan todos los privilegios de
-- escritura/estructura; SELECT se deja como está (sin política RLS para
-- anon, no devuelve filas).
-- ---------------------------------------------------------------------------

revoke insert, update, delete, truncate, references, trigger, maintain
  on all tables in schema public
  from anon;
