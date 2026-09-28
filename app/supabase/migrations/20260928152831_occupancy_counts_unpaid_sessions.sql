-- ---------------------------------------------------------------------------
-- Robustez de sesiones (3/6) · La mesa con consumo sin cobrar sigue ocupada.
--
-- Con 20260928150100 una sesión con consumo sin cobrar ya no vence, pero la
-- vista de mesas y el dashboard la seguían mostrando libre pasadas 4 h:
--   · table_effective_status: la regla OCCUPIED por sesión con consumo tenía
--     una ventana de 4 h. Ahora la ventana no aplica si hay consumo sin
--     cobrar. (La regla M12, cuenta OPEN con saldo, se mantiene igual.)
--   · get_tables_status.active_total: misma ventana, mismo arreglo.
-- get_dashboard_summary.occupied_tables usa table_effective_status, así que
-- queda cubierto sin tocarlo aquí.
--
-- Resto del cuerpo idéntico a la versión vigente en producción.
-- ---------------------------------------------------------------------------

create or replace function public.table_effective_status(p_table_id uuid)
returns public.table_status
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_current public.table_status;
  v_billing boolean;
begin
  select t.status, r.billing_enabled
  into v_current, v_billing
  from public.tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.id = p_table_id;

  if not found then
    return null;
  end if;

  if v_current = 'INACTIVE' then
    return 'INACTIVE';
  end if;

  if exists (
    select 1 from public.waiter_calls
    where table_id = p_table_id
      and type = 'BILL'
      and status in ('PENDING', 'ACCEPTED')
  ) then
    return 'BILL_REQUESTED';
  end if;

  if exists (
    select 1 from public.waiter_calls
    where table_id = p_table_id
      and type = 'WAITER'
      and status in ('PENDING', 'ACCEPTED')
  ) then
    return 'ATTENTION';
  end if;

  if exists (
    select 1 from public.orders
    where table_id = p_table_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
  ) then
    return 'OCCUPIED';
  end if;

  -- Sesión ACTIVE con consumo: ocupada si tuvo actividad en las últimas 4 h
  -- o si tiene consumo sin cobrar (esa no vence nunca).
  if v_billing and exists (
    select 1
    from public.table_sessions ts
    where ts.table_id = p_table_id
      and ts.status = 'ACTIVE'
      and exists (
        select 1 from public.orders o
        where o.table_session_id = ts.id
          and o.status not in ('REJECTED', 'CANCELLED')
      )
      and (
        public.table_session_last_activity(ts.id) >= now() - interval '4 hours'
        or public.table_session_has_unpaid_consumption(ts.id)
      )
  ) then
    return 'OCCUPIED';
  end if;

  -- M12: saldo pendiente en una sesión ACTIVE (sin ventana de tiempo).
  if v_billing and exists (
    select 1
    from public.bills b
    join public.table_sessions ts on ts.id = b.table_session_id
    where b.table_id = p_table_id
      and b.status = 'OPEN'
      and b.balance > 0
      and ts.status = 'ACTIVE'
  ) then
    return 'OCCUPIED';
  end if;

  return 'AVAILABLE';
end;
$$;

create or replace function public.get_tables_status(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_result jsonb;
  v_sees_money boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.user_belongs_to_restaurant(p_restaurant_id) then
    raise exception 'No autorizado';
  end if;

  -- KITCHEN también pertenece al restaurante, pero no ve dinero del cobro.
  v_sees_money := public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
               or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
               or public.user_has_restaurant_role(p_restaurant_id, 'WAITER');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',            t.id,
        'number',        t.number,
        'name',          t.name,
        -- Estado calculado en vivo: si la sesión venció por tiempo, la mesa
        -- aparece libre aunque tables.status aún no se haya recalculado.
        'status',        public.table_effective_status(t.id),
        'qr_token',      t.qr_token,
        'active_orders', (
          select count(*)
          from public.orders o
          where o.table_id = t.id
            and o.status in ('PENDING','ACCEPTED','PREPARING','READY')
        ),
        'pending_calls', (
          select count(*)
          from public.waiter_calls wc
          where wc.table_id = t.id
            and wc.status in ('PENDING','ACCEPTED')
        ),
        'active_total', (
          -- Total de la sesión ACTIVE actual (ver migración 045). Sin
          -- ventana de 4 h si la sesión tiene consumo sin cobrar.
          select coalesce(sum(o.total), 0)
          from public.orders o
          join public.table_sessions ts on ts.id = o.table_session_id
          where o.table_id = t.id
            and ts.status = 'ACTIVE'
            and (
              public.table_session_last_activity(ts.id) >= now() - interval '4 hours'
              or public.table_session_has_unpaid_consumption(ts.id)
            )
            and o.status not in ('REJECTED', 'CANCELLED')
        ),
        'bill_id',      lb.id,
        'bill_status',  lb.status,
        'bill_balance', case when v_sees_money then lb.balance end
      )
      order by t.number
    ),
    '[]'::jsonb
  )
  into v_result
  from public.tables t
  left join lateral (
    select b.id, b.status, b.balance
    from public.bills b
    join public.table_sessions ts on ts.id = b.table_session_id
    where b.table_id = t.id
      and ts.status = 'ACTIVE'
      and b.status in ('OPEN', 'PAID')
    order by b.opened_at desc
    limit 1
  ) lb on true
  where t.restaurant_id = p_restaurant_id
    and t.kind = 'TABLE';  -- C2

  return v_result;
end;
$$;

revoke all on function public.table_effective_status(uuid) from public, anon, authenticated;
grant execute on function public.table_effective_status(uuid) to service_role;

revoke all on function public.get_tables_status(uuid) from public, anon;
grant execute on function public.get_tables_status(uuid) to authenticated, service_role;
