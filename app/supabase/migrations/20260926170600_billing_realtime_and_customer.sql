-- ---------------------------------------------------------------------------
-- Módulo 1 · M12 · Realtime de cobro, vista del cliente y estado de mesas.
--
-- Depende de M3 (table_effective_status, table_session_last_activity,
-- get_tables_status en vivo) y M7.
-- IMPORTANTE: table_effective_status y get_tables_status se redefinen
-- COMPLETAS partiendo de la versión de M3 (20260926160200). Si M3 cambia,
-- hay que re-sincronizar estas copias.
-- La forma actual del JSON no cambia; solo se agregan bill_id, bill_status
-- y bill_balance (null si la sesión ACTIVE no tiene cuenta viva).
--
-- Cierra el PENDIENTE que dejó M3: una cuenta OPEN con saldo de una sesión
-- ACTIVE mantiene la mesa OCUPADA aunque pase la ventana de 4 h.
-- ---------------------------------------------------------------------------

alter table public.bills replica identity full;
alter table public.cash_sessions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bills'
  ) then
    alter publication supabase_realtime add table public.bills;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cash_sessions'
  ) then
    alter publication supabase_realtime add table public.cash_sessions;
  end if;
end;
$$;


-- Copia de table_effective_status de M3 (billing_enabled +
-- table_session_last_activity) más una rama: con cobro activo, una cuenta
-- OPEN con saldo de una sesión ACTIVE mantiene la mesa OCUPADA sin ventana
-- de tiempo (la gente se fue sin pagar: hay que cobrar o forzar el cierre).
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

  if v_billing and exists (
    select 1
    from public.table_sessions ts
    where ts.table_id = p_table_id
      and ts.status = 'ACTIVE'
      and public.table_session_last_activity(ts.id) >= now() - interval '4 hours'
      and exists (
        select 1 from public.orders o
        where o.table_session_id = ts.id
          and o.status not in ('REJECTED', 'CANCELLED')
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

revoke all on function public.table_effective_status(uuid) from public, anon, authenticated;
grant execute on function public.table_effective_status(uuid) to service_role;


-- El estado guardado de la mesa sigue a la cuenta (p. ej. VOID o cierre).
create trigger bills_refresh_table_status
after insert or update of status, balance on public.bills
for each row execute function public.trg_refresh_table_status();


-- Copia de get_tables_status de M3 + bill_id, bill_status, bill_balance
-- (bill_balance null para quien no sea OWNER/ADMIN/WAITER, p. ej. KITCHEN).
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
          -- Total de la sesión ACTIVE actual (ver migración 045).
          select coalesce(sum(o.total), 0)
          from public.orders o
          join public.table_sessions ts on ts.id = o.table_session_id
          where o.table_id = t.id
            and ts.status = 'ACTIVE'
            and public.table_session_last_activity(ts.id) >= now() - interval '4 hours'
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
  where t.restaurant_id = p_restaurant_id;

  return v_result;
end;
$$;

revoke all on function public.get_tables_status(uuid) from public;
revoke execute on function public.get_tables_status(uuid) from anon;
grant execute on function public.get_tables_status(uuid) to authenticated, service_role;


-- Vista del cliente (anon, con su session_token). Solo montos agregados:
-- nada de quién cobró, métodos ni referencias. Visible hasta 12 h después
-- del cierre para mostrar "Pagado, ¡gracias!". Devuelve null si no hay
-- cuenta, si el restaurante no usa cobro o si pasó la ventana.
create or replace function public.get_session_bill(p_session_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_session public.table_sessions%rowtype;
  v_bill    public.bills%rowtype;
begin
  select * into v_session
  from public.table_sessions
  where session_token = p_session_token;

  if not found then
    raise exception 'Sesión de mesa inválida';
  end if;

  if not coalesce((select billing_enabled from public.restaurants where id = v_session.restaurant_id), false) then
    return null;
  end if;

  select * into v_bill
  from public.bills
  where table_session_id = v_session.id
    and status <> 'VOID'
  order by opened_at desc
  limit 1;

  if not found then
    return null;
  end if;

  if v_bill.status = 'CLOSED' and v_bill.closed_at < now() - interval '12 hours' then
    return null;
  end if;

  return jsonb_build_object(
    'bill_number',    v_bill.bill_number,
    'status',         v_bill.status,
    'subtotal',       v_bill.subtotal,
    'discount_total', v_bill.discount_total,
    'total',          v_bill.total,
    'paid_total',     v_bill.paid_total,
    'tip_total',      v_bill.tip_total,
    'balance',        v_bill.balance,
    'split_mode',     v_bill.split_mode,
    'split_parts',    v_bill.split_parts,
    'paid_at',        v_bill.paid_at,
    'closed_at',      v_bill.closed_at
  );
end;
$$;

revoke all on function public.get_session_bill(uuid) from public;
grant execute on function public.get_session_bill(uuid) to anon, authenticated, service_role;
