-- ---------------------------------------------------------------------------
-- Venta de mostrador · C4 · Cierre automático de una cuenta pagada.
--
-- Depende de M8 (lock_bill, recompute_bill, finalize_bill).
--
-- Hoy una cuenta pagada ANTES de que salgan los pedidos queda PAID y
-- alguien tiene que tocar "Cerrar cuenta" (close_bill). En el mostrador se
-- cobra casi siempre antes de entregar, así que eso dejaría cada venta
-- colgada. Ahora, cuando un pedido pasa a un estado final (DELIVERED,
-- REJECTED, CANCELLED) y con eso la cuenta queda PAID sin pedidos en curso,
-- el mismo trigger que ya recalcula la cuenta la finaliza (CLOSED + sesión
-- CLOSED + auditoría CLOSE_BILL). Es la misma regla que record_payment
-- aplica al cobrar (p_auto_close, siempre true desde la UI): el resultado
-- no depende de qué pasó primero, el pago o la entrega. También vale para
-- mesas que pagaron por adelantado.
--
-- Candados: el pedido ya está bloqueado por quien lo actualiza
-- (mark_order_delivered: FOR UPDATE del pedido) -> lock_bill (mesa ->
-- cuenta) -> finalize_bill (sesión, llamadas). Es el orden que el trigger
-- ya usaba; finalize_bill no toma candados nuevos sobre mesas ni pedidos.
--
-- Carrera pago vs. entrega: si record_payment ve el pedido aún READY no
-- cierra; la entrega espera el candado de la mesa y, al tomarlo, ve la
-- cuenta PAID y cierra. Al revés, record_payment ya ve el pedido entregado
-- y cierra él. Nunca se pierde el cierre ni se cierra dos veces
-- (finalize_bill exige OPEN/PAID bajo el candado de la cuenta).
--
-- Sin cobro (billing_enabled = false) no hay cuentas vivas: no cambia nada.
-- ---------------------------------------------------------------------------

create or replace function public.trg_orders_recompute_bill()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bill_id uuid;
  v_bill    public.bills%rowtype;
begin
  if new.table_session_id is null then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.total is not distinct from old.total
     and new.table_session_id is not distinct from old.table_session_id then
    return null;
  end if;

  -- Pedido nuevo: candado de la mesa y la sesión tiene que seguir ACTIVE.
  -- create_customer_order lee la sesión sin candado; si en paralelo una
  -- entrega o un cobro cierra la cuenta y la sesión, este pedido quedaría en
  -- una sesión CLOSED sin cuenta viva (cocina lo prepara y nadie lo cobra).
  -- Con el candado esperamos a que ese cierre confirme y lo vemos.
  -- Orden: pedido nuevo (nadie más lo tiene) -> mesa, igual que lock_bill.
  if tg_op = 'INSERT' then
    perform 1 from public.tables where id = new.table_id for update;

    if not exists (
      select 1 from public.table_sessions
      where id = new.table_session_id
        and status = 'ACTIVE'
    ) then
      raise exception 'La mesa se acaba de cerrar: vuelve a escanear el QR para pedir'
        using errcode = 'P0001';
    end if;
  end if;

  -- Lectura sin candado: si no hay cuenta viva (restaurantes sin cobro),
  -- el trigger no bloquea nada.
  select id into v_bill_id
  from public.bills
  where table_session_id = new.table_session_id
    and status in ('OPEN', 'PAID');

  if v_bill_id is null then
    return null;
  end if;

  perform public.lock_bill(v_bill_id);
  v_bill := public.recompute_bill(v_bill_id);

  -- Pagada y sin nada más por salir: se cierra sola.
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('DELIVERED', 'REJECTED', 'CANCELLED')
     and v_bill.status = 'PAID'
     and coalesce((
       select r.billing_enabled from public.restaurants r
       where r.id = v_bill.restaurant_id
     ), false)
     and not exists (
       select 1 from public.orders o
       where o.table_session_id = v_bill.table_session_id
         and o.status in ('PENDING', 'ACCEPTED', 'PREPARING', 'READY')
     ) then
    perform public.finalize_bill(v_bill.id, auth.uid());
  end if;

  return null;
end;
$$;
