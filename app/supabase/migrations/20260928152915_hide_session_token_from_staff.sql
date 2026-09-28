-- ---------------------------------------------------------------------------
-- Permisos (1/6) · session_token deja de ser legible por la API.
--
-- session_token es la credencial del cliente en la mesa (quien lo tiene
-- pide y ve la cuenta). Con SELECT de tabla, cualquier miembro del personal
-- (incluida cocina) podía leer los tokens de todas las mesas y hacerse pasar
-- por un cliente.
--
-- Un REVOKE SELECT (session_token) no alcanza: el grant de tabla cubre todas
-- las columnas. Se quita el SELECT de tabla y se devuelve SELECT por columna,
-- sin session_token.
--
-- Uso verificado en app/src (grep): el único select directo es
-- getActiveTableSessionsMap -> select("id, table_id, started_at"). Nadie usa
-- select("*") ni Realtime postgres_changes sobre table_sessions; los tokens
-- solo salen de RPCs SECURITY DEFINER (resolve_table_qr).
--
-- anon no tiene política RLS en table_sessions: se le quita el SELECT entero.
--
-- OJO para migraciones futuras: una columna nueva en table_sessions NO queda
-- legible para authenticated hasta agregarla a este grant por columna.
-- ---------------------------------------------------------------------------

revoke select on public.table_sessions from anon, authenticated;

grant select (
  id,
  restaurant_id,
  table_id,
  status,
  started_at,
  last_activity_at,
  closed_at,
  table_kind,
  counter_number,
  customer_label,
  client_request_id
) on public.table_sessions to authenticated;
