-- ---------------------------------------------------------------------------
-- Permisos (6/6) · Turnos de caja: solo OWNER/ADMIN los leen.
--
-- Desde 20260927205852_only_admin_handles_money el mesero ya no maneja
-- dinero. cash_sessions seguía legible por WAITER (cash_sessions_select_staff).
-- cash_movements y cash_session_counts ya eran solo OWNER/ADMIN.
--
-- Verificado en app/src: las lecturas de cash_sessions (lib/queries/cash.ts)
-- solo se usan en /today (redirige a WAITER y KITCHEN antes de leer) y en
-- /cash (exige canHandleMoney = OWNER/ADMIN). La suscripción Realtime a
-- cash_sessions solo existe en /cash. Ninguna pantalla del mesero la usa.
-- ---------------------------------------------------------------------------

drop policy if exists cash_sessions_select_staff on public.cash_sessions;
drop policy if exists cash_sessions_select_admin on public.cash_sessions;

create policy cash_sessions_select_admin
  on public.cash_sessions
  for select
  to authenticated
  using (
    public.user_has_restaurant_role(restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(restaurant_id, 'ADMIN')
  );
