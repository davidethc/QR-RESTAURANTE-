-- ---------------------------------------------------------------------------
-- Módulo 1 · M11 · Liberar mesa exige cobro (con billing_enabled).
--
-- Depende de M4 (FORCE_CLOSE_SESSION), M5 (billing_enabled) y M10.
-- SE DESPLIEGA JUNTO CON EL SERVER ACTION (app/src/lib/actions/billing.ts
-- forceCloseTableSession; closeTableSession en tables.ts sigue funcionando
-- porque p_force y p_reason tienen default).
--
-- close_table_session(p_table_id, p_force default false, p_reason default null)
--   · billing_enabled = false: igual que hoy (cierra la sesión ACTIVE si no
--     hay pedidos en curso).
--   · billing_enabled = true:
--       - cuenta PAID sin pedidos en curso -> finalize_bill (cierre normal).
--       - saldo pendiente (cuenta OPEN con balance > 0, o consumo sin cuenta
--         abierta) -> error, salvo p_force por OWNER/ADMIN con motivo; se
--         audita FORCE_CLOSE_SESSION y la cuenta queda OPEN (cobrable luego
--         desde list_open_bills).
--   · En ambos modos marca ATTENDED las llamadas BILL abiertas de la mesa.
--
-- handle_waiter_call: con billing_enabled, marcar ATTENDED una llamada BILL
-- ya NO cierra la sesión (lo hace el cobro vía finalize_bill). Sin esto el
-- mesero podía liberar la mesa sin cobrar. Con la bandera en false se
-- conserva el comportamiento actual.
-- ---------------------------------------------------------------------------

drop function if exists public.close_table_session(uuid);

create or replace function public.close_table_session(
  p_table_id uuid,
  p_force boolean default false,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_table     public.tables%rowtype;
  v_billing   boolean;
  v_is_admin  boolean;
  v_session   public.table_sessions%rowtype;
  v_bill      public.bills%rowtype;
  v_pending   numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Orden de candados del cobro: mesa -> cuenta -> sesión (ver M8,
  -- lock_bill). Es el mismo candado que usan resolve_table_qr y
  -- create_staff_order: nadie abre sesión en la mesa mientras se cierra.
  select * into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Mesa no encontrada';
  end if;

  v_is_admin := public.user_has_restaurant_role(v_table.restaurant_id, 'OWNER')
             or public.user_has_restaurant_role(v_table.restaurant_id, 'ADMIN');

  if not (v_is_admin or public.user_has_restaurant_role(v_table.restaurant_id, 'WAITER')) then
    raise exception 'No autorizado para liberar mesas';
  end if;

  if exists (
    select 1 from public.orders
    where table_id = p_table_id
      and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
  ) then
    raise exception 'La mesa tiene pedidos activos';
  end if;

  select coalesce(billing_enabled, false) into v_billing
  from public.restaurants
  where id = v_table.restaurant_id;

  if v_billing then
    for v_session in
      select * from public.table_sessions
      where table_id = p_table_id
        and status = 'ACTIVE'
    loop
      -- Cuenta antes que sesión, igual que record_payment -> finalize_bill.
      select * into v_bill
      from public.bills
      where table_session_id = v_session.id
        and status in ('OPEN', 'PAID')
      for update;

      if found then
        v_bill := public.recompute_bill(v_bill.id);
      end if;

      if v_bill.id is not null and v_bill.status = 'PAID' then
        -- Pagada: cierre normal (cierra cuenta, sesión y llamadas).
        perform public.finalize_bill(v_bill.id, auth.uid());
        continue;
      end if;

      if v_bill.id is not null then
        v_pending := v_bill.balance;
      else
        select coalesce(sum(o.total), 0) into v_pending
        from public.orders o
        where o.table_session_id = v_session.id
          and o.status not in ('REJECTED', 'CANCELLED');
      end if;

      if v_pending > 0 then
        if not coalesce(p_force, false) then
          raise exception 'La mesa tiene % pendiente de cobro. Cobra la cuenta o fuerza el cierre.', v_pending;
        end if;

        if not v_is_admin then
          raise exception 'Solo el dueño o un administrador pueden forzar el cierre de una mesa con saldo';
        end if;

        if length(btrim(coalesce(p_reason, ''))) < 3 then
          raise exception 'Escribe el motivo del cierre forzado (mínimo 3 caracteres)';
        end if;

        insert into public.audit_logs (restaurant_id, user_id, action, entity_type, entity_id, metadata)
        values (
          v_table.restaurant_id, auth.uid(), 'FORCE_CLOSE_SESSION', 'TABLE_SESSION', v_session.id,
          jsonb_build_object(
            'table_id', p_table_id,
            'bill_id', v_bill.id,
            'pending', v_pending,
            'reason', btrim(p_reason)
          )
        );
      end if;

      update public.table_sessions
      set status = 'CLOSED',
          closed_at = now()
      where id = v_session.id
        and status = 'ACTIVE';

      v_bill := null;
    end loop;
  else
    update public.table_sessions
    set status = 'CLOSED',
        closed_at = now()
    where table_id = p_table_id
      and status = 'ACTIVE';
  end if;

  update public.waiter_calls
  set status = 'ATTENDED',
      handled_by = auth.uid(),
      handled_at = now()
  where table_id = p_table_id
    and type = 'BILL'
    and status in ('PENDING', 'ACCEPTED');

  perform public.refresh_table_status(p_table_id);
end;
$$;

revoke all on function public.close_table_session(uuid, boolean, text) from public;
revoke execute on function public.close_table_session(uuid, boolean, text) from anon;
grant execute on function public.close_table_session(uuid, boolean, text) to authenticated, service_role;


create or replace function public.handle_waiter_call(
  p_call_id uuid,
  p_status public.waiter_call_status
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_call public.waiter_calls%rowtype;
  v_active_session_id uuid;
  v_billing boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_status not in ('ACCEPTED', 'ATTENDED', 'REJECTED') then
    raise exception 'Estado de solicitud inválido';
  end if;

  select * into v_call
  from public.waiter_calls
  where id = p_call_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if not (
    public.user_has_restaurant_role(v_call.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(v_call.restaurant_id, 'ADMIN')
    or public.user_has_restaurant_role(v_call.restaurant_id, 'WAITER')
  ) then
    raise exception 'No autorizado para atender solicitudes';
  end if;

  if v_call.status not in ('PENDING', 'ACCEPTED') then
    raise exception 'La solicitud ya fue cerrada (estado actual: %)', v_call.status;
  end if;

  update public.waiter_calls
  set status = p_status,
      handled_by = auth.uid(),
      handled_at = now()
  where id = p_call_id;

  insert into public.audit_logs (
    restaurant_id, user_id, action, entity_type, entity_id, metadata
  )
  values (
    v_call.restaurant_id, auth.uid(), 'HANDLE_WAITER_CALL', 'WAITER_CALL', p_call_id,
    jsonb_build_object('status', p_status)
  );

  select coalesce(billing_enabled, false) into v_billing
  from public.restaurants
  where id = v_call.restaurant_id;

  -- Modo legado (sin cobro en el sistema): atender "Pedir cuenta" = cobrado,
  -- se cierra la sesión si no quedan pedidos en curso. Con billing_enabled
  -- la sesión la cierra el cobro (finalize_bill) o close_table_session.
  if not v_billing and p_status = 'ATTENDED' and v_call.type = 'BILL' then
    select id into v_active_session_id
    from public.table_sessions
    where table_id = v_call.table_id
      and status = 'ACTIVE';

    if v_active_session_id is not null
       and not exists (
         select 1 from public.orders
         where table_session_id = v_active_session_id
           and status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
       )
    then
      update public.table_sessions
      set status = 'CLOSED',
          closed_at = now()
      where id = v_active_session_id;
    end if;
  end if;
end;
$$;

revoke all on function public.handle_waiter_call(uuid, public.waiter_call_status) from public;
revoke execute on function public.handle_waiter_call(uuid, public.waiter_call_status) from anon;
grant execute on function public.handle_waiter_call(uuid, public.waiter_call_status) to authenticated, service_role;
