-- ---------------------------------------------------------------------------
-- Permisos (3/6) · Los objetos NUEVOS de public ya no nacen abiertos.
--
-- Hasta hoy, por los default privileges de Supabase, cada tabla, función o
-- secuencia nueva creada por postgres en public nacía con TODO para anon y
-- authenticated (INSERT/UPDATE/DELETE/TRUNCATE en tablas, EXECUTE en
-- funciones). Un olvido de REVOKE en una migración exponía el objeto.
--
-- Ahora cada migración tiene que otorgar explícitamente lo que necesita.
-- Verificado: todas las funciones y tablas vigentes ya tienen ACL explícita
-- (pg_proc.proacl / pg_class.relacl no nulos), y el patrón de las
-- migraciones recientes es "revoke all ... from public, anon; grant ... to
-- authenticated, service_role". Esto NO cambia ningún objeto existente, y
-- CREATE OR REPLACE conserva los grants de la función que reemplaza.
--
-- EXECUTE a PUBLIC en funciones: es un default global de Postgres (no por
-- schema) y anon/authenticated lo heredan de PUBLIC; revocarlo solo "in
-- schema public" no tiene efecto. Por eso se revoca a nivel global para las
-- funciones que cree postgres.
--
-- REGLA para migraciones futuras (lección de 025_fix_helper_grants_for_rls):
-- un helper que use una política RLS se evalúa como el usuario que consulta;
-- necesita "grant execute ... to authenticated" (y anon si aplica)
-- explícito o la política falla con permission denied.
--
-- supabase_admin: postgres no puede cambiar sus default privileges
-- (probado: 42501 permission denied to change default privileges). Las
-- migraciones del proyecto corren como postgres, así que no aplica en la
-- práctica; queda documentado.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

alter default privileges for role postgres
  revoke execute on functions from public;
