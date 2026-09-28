-- ---------------------------------------------------------------------------
-- Robustez de sesiones (1/6) · ¿La sesión tiene consumo sin cobrar?
--
-- Bug: resolve_table_qr y find_or_create_active_table_session vencían
-- (EXPIRED) sesiones con pedidos entregados y sin cobrar tras 4 h sin
-- actividad. La mesa aparecía libre, el siguiente cliente abría otra sesión y
-- el consumo anterior ya no salía en ninguna pantalla de cobro ($27,50
-- perdidos en omm-siri).
--
-- Regla (solo si restaurants.billing_enabled):
--   consumo sin cobrar = la sesión tiene al menos un pedido que no está
--   REJECTED ni CANCELLED, y no tiene ninguna cuenta PAID / CLOSED que lo
--   salde. Una cuenta VOID NO salda nada (anular la cuenta no cobra el
--   consumo): coherente con list_open_bills, que busca cuenta viva con
--   status <> 'VOID'. Una cuenta OPEN tampoco salda. Por el índice
--   bills_one_live_per_session hay a lo sumo una cuenta no-VOID por sesión.
--   Una cuenta PAID pasa a OPEN sola si llega un pedido nuevo
--   (recompute_bill), así que la regla sigue siendo correcta después.
--
-- Interna: la llaman funciones SECURITY DEFINER (dueño postgres) y
-- table_effective_status (que tampoco está expuesta). No se expone por la API.
-- ---------------------------------------------------------------------------

create or replace function public.table_session_has_unpaid_consumption(p_session_id uuid)
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((
    select r.billing_enabled
       and exists (
         select 1 from public.orders o
         where o.table_session_id = ts.id
           and o.status not in ('REJECTED', 'CANCELLED')
       )
       and not exists (
         select 1 from public.bills b
         where b.table_session_id = ts.id
           and b.status in ('PAID', 'CLOSED')
       )
    from public.table_sessions ts
    join public.restaurants r on r.id = ts.restaurant_id
    where ts.id = p_session_id
  ), false);
$$;

comment on function public.table_session_has_unpaid_consumption(uuid) is
  'true si el restaurante cobra (billing_enabled) y la sesión tiene pedidos vivos sin una cuenta que los salde. Una sesión así nunca se vence por inactividad.';

revoke all on function public.table_session_has_unpaid_consumption(uuid) from public, anon, authenticated;
grant execute on function public.table_session_has_unpaid_consumption(uuid) to service_role;
