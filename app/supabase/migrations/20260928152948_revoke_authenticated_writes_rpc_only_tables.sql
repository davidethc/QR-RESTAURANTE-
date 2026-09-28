-- ---------------------------------------------------------------------------
-- Permisos (5/6) · authenticated solo escribe directo donde la app lo hace.
--
-- grep en app/src de .from("x").insert|update|upsert|delete (2026-09-28):
--   categories   insert, update, delete   (lib/actions/menu.ts)
--   products     insert, update, delete   (lib/actions/menu.ts)
--   restaurants  update                   (lib/actions/restaurant.ts)
--   tables       insert                   (lib/actions/tables.ts)
-- Esas cuatro tablas NO se tocan en DML: siguen protegidas por RLS.
--
-- Todas las demás se escriben solo por RPCs SECURITY DEFINER; se les quita
-- INSERT/UPDATE/DELETE a authenticated (varias ya no los tenían: bills,
-- payments, cash_*, bill_discounts, payment_items; el revoke es no-op ahí).
-- product_options / product_option_values tienen políticas RLS de escritura
-- para admin, pero la app hoy no las usa: si se construye esa pantalla,
-- devolver el grant en su migración.
--
-- Además, a authenticated se le quita TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
-- en TODAS las tablas: la app nunca los usa y TRUNCATE se salta RLS.
--
-- SELECT no cambia (lo gobierna RLS). EXECUTE de los helpers de RLS
-- (user_has_restaurant_role, user_belongs_to_restaurant) no se toca.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on
  public.audit_logs,
  public.bill_discounts,
  public.bills,
  public.cash_movements,
  public.cash_registers,
  public.cash_session_counts,
  public.cash_sessions,
  public.order_item_options,
  public.order_items,
  public.orders,
  public.payment_items,
  public.payments,
  public.product_option_values,
  public.product_options,
  public.profiles,
  public.restaurant_members,
  public.table_sessions,
  public.waiter_calls
from authenticated;

revoke truncate, references, trigger, maintain
  on all tables in schema public
  from authenticated;
