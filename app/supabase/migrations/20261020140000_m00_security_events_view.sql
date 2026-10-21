-- ---------------------------------------------------------------------------
-- M00-T02 · Historial de seguridad: vista public.security_events.
--
-- Subconjunto curado de audit_logs para la pantalla §7.2 de
-- docs/pos-spec/M00-base.md. Es una vista, no una tabla nueva: no duplica
-- datos ni cambia quién escribe en audit_logs (solo las RPCs SECURITY DEFINER).
--
-- Expand puro: no toca audit_logs, ni su RLS, ni sus grants. La app actual
-- no usa esta vista.
--
-- Acceso (solo OWNER/ADMIN del restaurante del evento), en dos capas:
--   1. security_invoker = true: la consulta corre con los permisos de quien
--      lee, así que aplica la RLS de audit_logs (audit_logs_select_admin,
--      hoy ya limitada a OWNER/ADMIN).
--   2. Filtro propio en la vista con el helper SECURITY DEFINER
--      user_has_restaurant_role (el mismo que usa esa política). Si la RLS de
--      audit_logs se abre más adelante (M00 §3 contempla que un miembro lea su
--      propio historial), la vista sigue sin mostrar nada a roles operativos.
--      Usa solo restaurant_members.role (el modelo de roles combinables de
--      M00-T01 aún no está aplicado; al hacer el contract de role, actualizar
--      este filtro).
--   Si la RLS de audit_logs se abre al propio historial de cada miembro,
--   agregar security_barrier = true a esta vista en esa misma migración,
--   para que ningún predicado del cliente se evalúe antes del filtro de rol.
--
-- La vista expone metadata completo a OWNER/ADMIN: nunca se escriben
-- secretos en audit_logs.metadata (PIN, hashes, tokens de mesa o de sesión,
-- credenciales). Cualquier RPC nueva que audite debe respetarlo.
--
--   Consecuencia: sin auth.uid() (service_role, postgres) la vista devuelve 0
--   filas. Para tareas internas se lee audit_logs directamente.
--
-- Mapeo acción -> event_type:
--   REJECT_ORDER                                  -> order_cancelled
--   UPDATE sobre ORDER con metadata.action =
--     'CANCEL_ORDER' (RPC cancel_order, cancela
--     PENDING/ACCEPTED/PREPARING)                 -> order_cancelled
--   VOID_BILL                                     -> bill_voided
--   VOID_PAYMENT (anulación de un pago)           -> refund
--   CASH_MOVEMENT con metadata.type = 'OUT'       -> cash_withdrawal
--   CASH_MOVEMENT con metadata.type = 'IN'        -> cash_deposit
--   CASH_MOVEMENT sin tipo reconocible            -> cash_movement
--   CLOSE_CASH_SESSION con cash_difference <> 0   -> cash_cut_difference
--   CLOSE_CASH_SESSION cuadrado o sin diferencia  -> cash_cut
--   APPLY_DISCOUNT                                -> discount
--   REMOVE_DISCOUNT                               -> discount_removed
--   FORCE_CLOSE_SESSION                           -> session_force_closed
-- No se descartan movimientos de entrada ni cortes cuadrados: la vista
-- clasifica y la pantalla filtra por event_type.
--
-- Columnas derivadas del detalle (metadata jsonb, tal como lo escriben las
-- RPCs actuales). Solo se convierten a numeric si el valor jsonb es un
-- número, para que un detalle mal formado no rompa la consulta:
--   amount               VOID_PAYMENT, CASH_MOVEMENT, APPLY_DISCOUNT,
--                        REMOVE_DISCOUNT: metadata.amount; VOID_BILL:
--                        metadata.total (total de la cuenta anulada)
--   cash_movement_type   CASH_MOVEMENT: metadata.type (IN | OUT)
--   cash_movement_reason CASH_MOVEMENT: metadata.reason
--   cash_difference      CLOSE_CASH_SESSION: metadata.cash_difference
--                        (contado - esperado, solo efectivo). La diferencia
--                        por otros métodos y el "tipo de diferencia" de §7.2
--                        quedan pendientes de M00-T08.
--   reason               metadata.reason, salvo en CASH_MOVEMENT (ahí es el
--                        motivo del enum y va en cash_movement_reason)
--
-- Pendiente de M00-T08 (sin audit_action propio; no se agregan valores al
-- enum aquí):
--   - cancelar un producto de un pedido (no se audita hoy);
--   - bajar el precio de un producto (no se audita hoy);
--   - cancelar un pedido ya aceptado: hoy se registra como UPDATE con
--     metadata.action = 'CANCEL_ORDER' (incluido arriba); falta un valor
--     propio del enum;
--   - reembolso real de dinero: hoy solo existe VOID_PAYMENT (anular un
--     pago), que se expone como 'refund'.
-- ---------------------------------------------------------------------------

create or replace view public.security_events
with (security_invoker = true)
as
select
  a.id,
  a.restaurant_id,
  a.created_at,
  a.user_id as actor_user_id,
  a.action,
  case
    when a.action = 'REJECT_ORDER' then 'order_cancelled'
    when a.action = 'UPDATE'
         and a.entity_type = 'ORDER'
         and a.metadata ->> 'action' = 'CANCEL_ORDER'
      then 'order_cancelled'
    when a.action = 'VOID_BILL' then 'bill_voided'
    when a.action = 'VOID_PAYMENT' then 'refund'
    when a.action = 'CASH_MOVEMENT' then
      case a.metadata ->> 'type'
        when 'OUT' then 'cash_withdrawal'
        when 'IN' then 'cash_deposit'
        else 'cash_movement'
      end
    when a.action = 'CLOSE_CASH_SESSION' then
      case
        when jsonb_typeof(a.metadata -> 'cash_difference') <> 'number' then 'cash_cut'
        when (a.metadata ->> 'cash_difference')::numeric <> 0 then 'cash_cut_difference'
        else 'cash_cut'
      end
    when a.action = 'APPLY_DISCOUNT' then 'discount'
    when a.action = 'REMOVE_DISCOUNT' then 'discount_removed'
    when a.action = 'FORCE_CLOSE_SESSION' then 'session_force_closed'
  end as event_type,
  a.entity_type,
  a.entity_id,
  case
    when a.action = 'VOID_BILL'
         and jsonb_typeof(a.metadata -> 'total') = 'number'
      then (a.metadata ->> 'total')::numeric
    when a.action in ('VOID_PAYMENT', 'CASH_MOVEMENT', 'APPLY_DISCOUNT', 'REMOVE_DISCOUNT')
         and jsonb_typeof(a.metadata -> 'amount') = 'number'
      then (a.metadata ->> 'amount')::numeric
  end as amount,
  case when a.action = 'CASH_MOVEMENT' then a.metadata ->> 'type' end as cash_movement_type,
  case when a.action = 'CASH_MOVEMENT' then a.metadata ->> 'reason' end as cash_movement_reason,
  case
    when a.action = 'CLOSE_CASH_SESSION'
         and jsonb_typeof(a.metadata -> 'cash_difference') = 'number'
      then (a.metadata ->> 'cash_difference')::numeric
  end as cash_difference,
  case when a.action <> 'CASH_MOVEMENT' then nullif(btrim(a.metadata ->> 'reason'), '') end as reason,
  a.metadata
from public.audit_logs a
where (
    a.action in (
      'REJECT_ORDER', 'VOID_BILL', 'VOID_PAYMENT', 'CASH_MOVEMENT',
      'CLOSE_CASH_SESSION', 'APPLY_DISCOUNT', 'REMOVE_DISCOUNT', 'FORCE_CLOSE_SESSION'
    )
    or (
      a.action = 'UPDATE'
      and a.entity_type = 'ORDER'
      and a.metadata ->> 'action' = 'CANCEL_ORDER'
    )
  )
  and (
    public.user_has_restaurant_role(a.restaurant_id, 'OWNER')
    or public.user_has_restaurant_role(a.restaurant_id, 'ADMIN')
  );

comment on view public.security_events is
  'Historial de seguridad (M00 §7.2): acciones sensibles de audit_logs. Solo OWNER/ADMIN del restaurante; security_invoker aplica además la RLS de audit_logs. Solo lectura. No escribir secretos en audit_logs.metadata; si la RLS de audit_logs se abre al propio historial, agregar security_barrier.';

revoke all on public.security_events from public;
revoke all on public.security_events from anon;
revoke all on public.security_events from authenticated;
revoke all on public.security_events from service_role;
grant select on public.security_events to authenticated, service_role;
