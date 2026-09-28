-- ---------------------------------------------------------------------------
-- Robustez de sesiones (4/6) · "Cuentas abiertas" en /cash muestra también
-- las mesas con consumo sin cobrar que todavía no tienen cuenta.
--
-- Antes list_open_bills solo listaba filas de bills. Una mesa con pedidos
-- entregados pero sin cuenta abierta (el caso de los $27,50) no aparecía en
-- /cash: nadie la veía para cobrarla.
--
-- Ahora se agregan filas "virtuales" para las sesiones TABLE en estado ACTIVE
-- que cumplen table_session_has_unpaid_consumption y no tienen cuenta viva
-- (status <> 'VOID'). Mismo shape que una fila real, con:
--   id          = null   (todavía no hay cuenta)
--   bill_number = null
--   status      = 'OPEN' (se muestra "Por cobrar")
--   total / balance = suma de pedidos vivos de la sesión
--   has_bill    = false  (campo nuevo; las filas reales llevan true)
-- El botón "Cobrar" de la UI ya usa table_session_id -> open_bill, que es
-- idempotente y crea la cuenta; no necesita el id.
--
-- Deliberadamente NO incluye sesiones EXPIRED: en omm-siri hay 9 sesiones
-- EXPIRED históricas (anteriores al módulo de cobro) que inundarían la
-- lista. Recuperarlas es una decisión de negocio aparte.
-- ---------------------------------------------------------------------------

create or replace function public.list_open_bills(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.user_has_restaurant_role(p_restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(p_restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(p_restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select jsonb_agg(e.item order by e.opened_at)
    from (
      select
        b.opened_at,
        jsonb_build_object(
          'id',               b.id,
          'bill_number',      b.bill_number,
          'table_id',         b.table_id,
          'table_number',     t.number,
          'table_name',       t.name,
          -- C3
          'table_kind',       t.kind,
          'counter_number',   ts.counter_number,
          'customer_label',   ts.customer_label,
          'place_label',      public.place_label(t.kind, t.number, ts.counter_number, ts.customer_label),
          'table_session_id', b.table_session_id,
          'session_status',   ts.status,
          'status',           b.status,
          'total',            b.total,
          'paid_total',       b.paid_total,
          'balance',          b.balance,
          'split_mode',       b.split_mode,
          'split_parts',      b.split_parts,
          'opened_at',        b.opened_at,
          'active_orders', (
            select count(*) from public.orders o
            where o.table_session_id = b.table_session_id
              and o.status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
          ),
          'has_bill',         true
        ) as item
      from public.bills b
      join public.tables t on t.id = b.table_id
      join public.table_sessions ts on ts.id = b.table_session_id
      where b.restaurant_id = p_restaurant_id
        and b.status in ('OPEN', 'PAID')

      union all

      select
        ts.started_at,
        jsonb_build_object(
          'id',               null,
          'bill_number',      null,
          'table_id',         ts.table_id,
          'table_number',     t.number,
          'table_name',       t.name,
          'table_kind',       t.kind,
          'counter_number',   ts.counter_number,
          'customer_label',   ts.customer_label,
          'place_label',      public.place_label(t.kind, t.number, ts.counter_number, ts.customer_label),
          'table_session_id', ts.id,
          'session_status',   ts.status,
          'status',           'OPEN',
          'total',            s.total,
          'paid_total',       0,
          'balance',          s.total,
          'split_mode',       'NONE',
          'split_parts',      1,
          'opened_at',        ts.started_at,
          'active_orders',    s.active_orders,
          'has_bill',         false
        )
      from public.table_sessions ts
      join public.tables t on t.id = ts.table_id
      cross join lateral (
        select
          round(coalesce(sum(o.total) filter (where o.status not in ('REJECTED', 'CANCELLED')), 0), 2) as total,
          count(*) filter (where o.status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')) as active_orders
        from public.orders o
        where o.table_session_id = ts.id
      ) s
      where ts.restaurant_id = p_restaurant_id
        and ts.status = 'ACTIVE'
        and ts.table_kind = 'TABLE'
        and not exists (
          select 1 from public.bills b
          where b.table_session_id = ts.id
            and b.status <> 'VOID'
        )
        and public.table_session_has_unpaid_consumption(ts.id)
    ) e
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_open_bills(uuid) from public, anon;
grant execute on function public.list_open_bills(uuid) to authenticated, service_role;
