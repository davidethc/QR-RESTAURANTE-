---
title: "Diseño: Cobro y Caja, Reportes, Inventario y Costos"
type: "synthesis"
created: "2026-09-26"
updated: "2026-09-26"
sources: ["app/supabase/migrations/", "wiki/syntheses/estado-del-sistema-2026-09-26.md"]
tags: ["diseno", "base-de-datos", "cobro", "caja", "reportes", "inventario", "contabilidad"]
aliases: ["diseno-cobro-reportes-inventario"]
---

# Diseño: Cobro y Caja, Reportes, Inventario y Costos

Diseño a nivel de base de datos y RPC de los tres módulos que convierten Monky en un sistema de gestión, de la carta al estado de resultados. Es la **fuente de verdad** para los agentes que lo implementan. La facturación electrónica SRI queda fuera, pero sus puntos de extensión se dejan marcados.

## Decisiones tomadas (2026-09-26)
- **Quién cobra**: solo OWNER y ADMIN (desde 2026-09-27, migración `only_admin_handles_money`). Los descuentos y movimientos de caja son exclusivos del admin y dueño.
- **Cajas**: una por restaurante. El modelo soporta varias, pero se crea "Caja principal".
- **Cierre de caja**: ciego para el mesero; admin y dueño ven el monto esperado.
- **Stock**: se descuenta al pasar el pedido a **DELIVERED**.
- **Día comercial**: corta a las **04:00** (`business_day_cutoff`).
- **IVA**: se asume incluido en los precios. Se confirma antes del módulo SRI.
- **Pruebas en producción** dentro del restaurante aislado `monky-qa`, con la bandera `billing_enabled` para no afectar a Omm Siri.

## Hallazgos que obligan a cambiar lo actual
- `refresh_table_status` deja la mesa en AVAILABLE cuando todo está entregado aunque no se haya pagado. Debe seguir OCCUPIED mientras la sesión tenga pedidos facturables.
- Las sesiones expiran por inactividad de 4 h. Una cuenta de una sesión EXPIRED debe seguir siendo cobrable.
- `notify_table_session_change()` se reutiliza tal cual como trigger sobre `bills`.
- `close_table_session` tiene `search_path 'public'` sin `pg_temp`. Hay que alinearla al reescribirla.
- `get_dashboard_summary` y `get_tables_status` agrupan por día en UTC. Hay que corregirlo con los helpers de hora local.

## Patrón obligatorio para toda RPC nueva
1. `language plpgsql security definer set search_path to 'public','pg_temp'`
2. `if auth.uid() is null then raise exception 'No autenticado'`
3. Chequeo de rol con `user_has_restaurant_role(..)` en OR (OWNER y ADMIN siempre están incluidos)
4. Bloqueos `select … for update` antes de mutar
5. Insertar en `audit_logs`
6. `revoke all on function … from public; revoke execute … from anon; grant execute … to authenticated, service_role;`

Solo las RPCs de cliente, que reciben `p_session_token`, se conceden a `anon`.

Además:
- Las tablas nuevas tienen RLS con **SELECT únicamente**. Todas las escrituras van por RPC.
- Dinero en `numeric(10,2)`, cantidades en `numeric(14,3)`, costos unitarios en `numeric(12,4)`. Nunca `float`.
- Un valor nuevo de `audit_action` va en **su propia migración**, porque `ALTER TYPE … ADD VALUE` no puede usarse en la misma transacción.

---

## Fase 0 de base de datos
- **M1 `restaurant_local_time_helpers`**
  - `restaurants.business_day_cutoff time default '04:00'` y un trigger que valida `timezone` contra `pg_timezone_names`.
  - Funciones `STABLE`:
    - `restaurant_tz(uuid)`
    - `business_date(uuid, timestamptz)`: `((ts at time zone tz) - cutoff)::date`
    - `business_day_bounds(uuid, date, date)`: rango semiabierto `[start_at, end_at)` en `timestamptz`
    - `business_today(uuid)`
- **M2 `fix_dashboard_timezone`**: `get_dashboard_summary` y `get_tables_status` pasan a usar `business_day_bounds`.
- **M3 `table_status_occupied_while_session_active`**: la mesa queda OCCUPIED si tiene pedidos activos **o** una sesión ACTIVE con pedidos no rechazados. Se agrega un trigger sobre `table_sessions(status)`.
- **Bandera** `restaurants.billing_enabled boolean default false`, en M5. Con false, todo funciona como hoy.

## Módulo 1: Cobro y Caja

### Enums (M4 enum de auditoría aparte, M5 enums y ajustes)
- `payment_method`: CASH, CARD, TRANSFER, OTHER
- `bill_status`: OPEN, PAID, CLOSED, VOID
  - PAID = saldo 0 con la sesión abierta; vuelve a OPEN si entra un pedido.
- `payment_status`: COMPLETED, VOIDED
- `discount_kind`: PERCENT, FIXED
- `bill_split_mode`: NONE, EQUAL, ITEMS
- `cash_session_status`: OPEN, CLOSED
- `cash_movement_type`: IN, OUT
- `cash_movement_reason`: FLOAT_TOPUP, TIPS_PAYOUT, SUPPLIER_PAYMENT, EXPENSE, REFUND, WITHDRAWAL, OTHER
- `restaurants.max_waiter_discount_pct numeric(5,2) default 0`
- Valores nuevos de `audit_action`: OPEN_BILL, APPLY_DISCOUNT, REMOVE_DISCOUNT, SET_BILL_SPLIT, RECORD_PAYMENT, VOID_PAYMENT, CLOSE_BILL, VOID_BILL, FORCE_CLOSE_SESSION, OPEN_CASH_SESSION, CLOSE_CASH_SESSION, CASH_MOVEMENT

### Tablas
- **M6 `cash_registers`**
  - `(id, restaurant_id, name, active, unique(restaurant_id, name))`
  - Seed "Caja principal" y un trigger que la crea en cada restaurante nuevo.
- **M6 `cash_sessions`**
  - Columnas: `register_id`, `status`, `opened_by`, `opened_at`, `opening_float ≥ 0`, `closed_by`, `closed_at`, `expected_cash`, `counted_cash`, `cash_difference`, `notes`.
  - **Índice único `(register_id) where status='OPEN'`**.
- **M6 `cash_movements`**
  - Columnas: `cash_session_id`, `type`, `reason`, `amount > 0`, `description`, `expense_id`, `purchase_id` (FK en el módulo 3), `idempotency_key`, `created_by`.
  - `unique(restaurant_id, idempotency_key)`
- **M6 `cash_session_counts`**
  - `(cash_session_id, method)` como PK; columnas `expected`, `counted`, `difference`.
- **M7 `bills`**: una por sesión.
  - Columnas:
    - `bill_number identity`, `table_id`, `table_session_id`, `status`
    - Montos: `subtotal`, `discount_total`, `total`, `paid_total`, `tip_total`, `balance`
    - División: `split_mode`, `split_parts 1..50`
    - Trazabilidad: `opened_*`, `paid_at`, `closed_*`, `voided_*`, `void_reason`
    - **SRI**: `customer_id`, `customer_tax_id`, `customer_name`, `customer_email` e `invoice_id`, todos nulos
  - Checks: `total = subtotal - discount_total`, `balance = total - paid_total`, `balance ≥ 0`, y PAID o CLOSED implica `balance = 0`.
  - **Índice único `(table_session_id) where status <> 'VOID'`**.
- **M7 `bill_discounts`**
  - Columnas: `bill_id`, `order_item_id` (null = descuento de toda la cuenta), `kind`, `value`, `amount` (calculado), `reason` (3 o más caracteres), `applied_*`, `removed_*` (borrado lógico).
- **M7 `payments`**
  - Columnas:
    - `bill_id`, **`cash_session_id` not null**, `method`
    - `amount > 0`, `tip_amount ≥ 0`
    - `tendered_amount` y `change_amount`, solo para CASH
    - `reference`, `card_type`, `status`, `received_by`
    - **`idempotency_key`** con `unique(restaurant_id, idempotency_key)`
    - `voided_*`, `invoice_id`
  - Check para CASH: `tendered ≥ amount + tip` y `change = tendered - amount - tip`.
- **M7 `payment_items`**
  - `(payment_id, order_item_id, quantity)` para dividir por ítems.
  - La suma pagada de un ítem nunca supera su `quantity`.

### RLS
- `bills`, `bill_discounts`, `payments`, `payment_items`, `cash_registers` y `cash_sessions`: SELECT para OWNER, ADMIN y WAITER.
- `cash_movements` y `cash_session_counts`: SELECT solo para OWNER y ADMIN (cierre ciego).

### Internas (M8, sin grants)
- **`recompute_bill(bill_id)`**, con la cuenta ya bloqueada:
  - `subtotal` = Σ `orders.total` de la sesión, sin REJECTED ni CANCELLED.
  - Recalcula los PERCENT (`round(...,2)`).
  - `paid_total` y `tip_total` salen de los pagos COMPLETED.
  - Recalcula `balance` y cambia el estado entre PAID y OPEN.
  - Si el balance quedaría negativo por un pedido rechazado después de pagar, lanza **error**: primero hay que anular un pago.
- **`resolve_open_cash_session(restaurant, id?)`**: sin caja abierta lanza "Abre la caja antes de cobrar".
- **`finalize_bill(bill_id, user)`**:
  - Requiere que no haya pedidos entre PENDING y READY.
  - Pone la cuenta en CLOSED, cierra la sesión, pasa las `waiter_calls` abiertas a **ATTENDED** y llama a `refresh_table_status`.
  - Audita.
- Trigger `orders_recompute_bill` (AFTER INSERT/UPDATE OF status, total) y trigger `bills_notify_session`.

### RPCs de caja (M9)
- `open_cash_session(register_id, opening_float)`: OWNER, ADMIN, WAITER. Si choca con el índice único, "Ya hay una caja abierta".
- `add_cash_movement(session, type, reason, amount, description, idempotency_key)`: OWNER, ADMIN.
- `get_cash_session_summary(session)`: OWNER y ADMIN ven todo; el mesero, nada de esperados.
- `close_cash_session(session, counts jsonb, notes)`: OWNER, ADMIN, WAITER.
  - Esperado en efectivo = fondo + Σ(amount + tip) de pagos CASH + entradas − salidas.
  - Guarda los conteos y la diferencia y audita.

### RPCs de cobro (M10)
- `open_bill(table_session_id)`: idempotente. Acepta sesiones ACTIVE o EXPIRED.
  - Devuelve la cuenta completa: ítems por pedido, descuentos, pagos, `items_paid_qty` y `next_equal_share`. La última parte absorbe el residuo del centavo.
- `get_bill`, `set_bill_split(mode, parts)` y `list_open_bills(restaurant)`.
- `apply_bill_discount(bill, kind, value, reason, order_item?)`: el mesero solo hasta el tope configurado. No puede dejar el balance negativo.
- `remove_bill_discount`: OWNER, ADMIN.
- **`record_payment(bill, method, amount, tip, tendered, reference, items jsonb, idempotency_key, cash_session?, auto_close=true)`**:
  1. Idempotencia.
  2. `for update` de la cuenta.
  3. `recompute_bill`.
  4. `amount ≤ balance`.
  5. Resolver la caja abierta.
  6. Calcular el vuelto.
  7. Insertar el pago (y sus ítems).
  8. Recalcular.
  9. Si el balance es 0 y no hay pedidos activos, `finalize_bill`.
  10. Auditar.

  Devuelve `{payment_id, change_amount, bill}`.
- `void_payment(payment, reason)`: OWNER, ADMIN, y solo con la caja del pago abierta. Después del cierre se corrige con un `cash_movement` OUT con motivo REFUND.
- `close_bill`: para cuando se pagó antes de que salieran los pedidos.
- `void_bill`: solo sin pagos. Una cortesía es un descuento del 100% con motivo.

### Cambio de `close_table_session` (M11)
- DROP de la firma `(uuid)` y creación de `(p_table_id, p_force default false, p_reason default null)`.
- Con `billing_enabled` en false, se comporta como hoy.
- Con true y saldo pendiente, falla. Forzar el cierre es solo para OWNER o ADMIN, con motivo obligatorio y auditoría FORCE_CLOSE_SESSION.
- También marca las llamadas BILL como ATTENDED.
- **Se despliega junto con el cambio del server action.**

### Realtime y cliente (M12)
- `bills` y `cash_sessions` entran a la publicación con `REPLICA IDENTITY FULL`.
- `get_session_bill(p_session_token)` se concede a anon. Devuelve estado, total, pagado y saldo, válido hasta 12 h después del cierre, para mostrar "Pagado, ¡gracias!".
- `get_tables_status` pasa a incluir `bill_status` y `bill_balance`.

## Módulo 2: Reportes
- RPCs `STABLE` con agregación en SQL. **Sin vistas materializadas**, porque no soportan RLS.
- Solo OWNER y ADMIN. Rango `(p_from date, p_to date)` de 400 días o menos, en hora local con `business_day_bounds`.
- **Definiciones**:
  - Venta neta = Σ `bills.total` de cuentas CLOSED.
  - Venta bruta = Σ subtotal.
  - Propinas = Σ `payments.tip_amount`. No son ingreso.
  - Ticket promedio = venta neta / número de cuentas.
  - Producto y categoría = `order_items` de pedidos DELIVERED, a valor bruto.
  - Para el histórico previo al cobro existe el respaldo `delivered_orders_total`.
- **M13**: `order_items.unit_cost numeric(12,4)` (snapshot, lo llena el módulo 3) e índices:
  - `orders(restaurant_id, delivered_at) where status='DELIVERED'`
  - `orders(restaurant_id, accepted_at) where ready_at is not null`
- **M14 y M15**:
  - `report_sales_summary`
  - `report_sales_by_period(day|week|month)`
  - `report_sales_by_product`
  - `report_sales_by_category`
  - `report_sales_by_staff` (`accepted_by` y `received_by`)
  - `report_payments_by_method`
  - `report_peak_hours` (isodow × hora)
  - `report_prep_times` (promedio, p50 y p90, descartando más de 3 h)
  - `report_discounts`
- **Excel**: se genera en el cliente con `exceljs` e import dinámico.

## Módulo 3: Inventario, Costos y Contabilidad
- **Unidades**:
  - `measure_unit`: g, kg, ml, l, unit. Se guarda **siempre en unidad base** (g, ml, unit).
  - `unit_base()` y `convert_to_base()`, con error si la dimensión no es compatible.
- **Enums**:
  - `stock_movement_type`: PURCHASE, PURCHASE_VOID, SALE, SALE_REVERSAL, WASTE, ADJUSTMENT, COUNT
  - `purchase_status`, `inventory_count_status`
  - Valores de auditoría nuevos, en su propia migración
- **Tablas**:
  - `suppliers` (con RUC)
  - `ingredients`: `stock_qty`, `avg_cost` (promedio ponderado), `min_stock`
  - `recipe_items`: `product_id`, `ingredient_id`, `quantity` neta, `waste_pct`. Bruto = qty / (1 − merma).
  - **`stock_movements`**: ledger inmutable con índice único `(order_item_id, ingredient_id, type) where type in (SALE, SALE_REVERSAL)`
  - `purchases` y `purchase_items`
  - `inventory_counts` y sus ítems
  - `expense_categories` (con seed) y `expenses`
  - **`daily_closings`**: `unique(restaurant_id, business_date)` con el snapshot inmutable
- **Funciones**:
  - `apply_stock_movement`: bloquea los ingredientes en orden de id.
  - `create_purchase` / `post_purchase`: recalculan el costo promedio y, opcionalmente, crean un OUT en la caja.
  - `void_purchase`
  - `upsert_recipe`
  - `get_product_costs`: costo teórico, margen y food cost %.
  - `record_waste` (KITCHEN, OWNER, ADMIN) y `adjust_stock`
  - Conteos
  - `get_low_stock` y `get_kitchen_stock` (este último sin costos)
  - `create_expense` / `void_expense`
  - `close_business_day` y `reopen_business_day` (solo OWNER)
  - `report_income_statement`: ventas netas − COGS − mermas − gastos = resultado. Las compras no son gasto: entran vía COGS.
- **Consumo de stock**: trigger `orders_consume_stock` al pasar a DELIVERED.
  - Idempotente y **a prueba de fallos**: `exception when others` registra en `audit_logs` y no bloquea la entrega.
  - Llena `order_items.unit_cost`.
  - Se complementa con `reconcile_stock_consumption(from, to)` y `reverse_order_stock(order)`.
- **RLS**: SELECT solo para OWNER y ADMIN. KITCHEN accede solo por sus RPCs. Estas tablas no entran a realtime.

## Orden de migraciones

| # | Migración | Depende de |
|---|---|---|
| 1 | `restaurant_local_time_helpers` | – |
| 2 | `fix_dashboard_timezone` | 1 |
| 3 | `table_status_occupied_while_session_active` | – |
| 4 | `audit_actions_billing` | – |
| 5 | `billing_enums_and_settings` | – |
| 6 | `cash_registers_and_sessions` | 5 |
| 7 | `bills_payments_discounts` | 5, 6 |
| 8 | `billing_internal_functions` | 7 |
| 9 | `cash_session_rpcs` | 4, 6 |
| 10 | `billing_rpcs` | 8, 9 |
| 11 | `close_table_session_requires_payment` | 10, junto con el front |
| 12 | `billing_realtime_and_customer` | 7 |
| 13 | `report_indexes_and_item_cost` | 7 |
| 14 | `report_rpcs_sales` | 1, 13 |
| 15 | `report_rpcs_operations` | 1 |
| 16 | `audit_actions_inventory` | – |
| 17 | `inventory_enums_units` | – |
| 18 | `suppliers_ingredients` | 17 |
| 19 | `recipes` | 18 |
| 20 | `stock_ledger` | 18 |
| 21 | `purchases` | 20, 6 |
| 22 | `stock_consumption_trigger` | 19, 20, 13 |
| 23 | `inventory_counts_waste_adjust` | 20 |
| 24 | `expenses` | 6 |
| 25 | `daily_closings_income_statement` | 14, 22, 24 |

Después de cada grupo: regenerar tipos y ejecutar `get_advisors` (security y performance).

## Pruebas mínimas
- Cada rol no permitido recibe error. `has_function_privilege('anon', …, 'execute')` es false en todas las RPCs de staff.
- `record_payment`:
  - Monto mayor que el balance: error.
  - Clave de idempotencia repetida: un solo pago.
  - Sin caja abierta: error.
  - Efectivo insuficiente: error.
  - El vuelto es correcto.
  - Con balance 0 y pedidos activos queda PAID sin cerrar.
  - Con balance 0 y sin pedidos activos: CLOSED, sesión cerrada, llamadas en ATTENDED y mesa AVAILABLE.
- Concurrencia: dos pagos simultáneos del balance completo; el segundo falla.
- División en partes: 3 × $10.00 da 3.33, 3.33 y 3.34. Por ítems, cantidad de más: error.
- Descuentos: el mesero por encima del tope da error; un PERCENT se recalcula al entrar un pedido.
- Pedido rechazado después de pagar: el error esperado.
- `close_table_session` en modo legado y en modo nuevo.
- Caja: una segunda caja abierta da error; el esperado es correcto.
- Zona horaria: 23:30 local y 01:00 con el corte de las 04:00.
- Stock: entregar dos veces no duplica el consumo; costo promedio tras dos compras; conversión de kg a g.
- Reportes: totales exactos contra una semilla conocida.

## Riesgos
- **Redondeo**: `round(...,2)` en cada paso.
- **Doble cobro**: se previene con `for update`, `balance ≥ 0` y la clave de idempotencia del cliente.
- **Trigger de stock en la ruta crítica**: se previene con el `exception` y la reconciliación.
- **Zona horaria**: un solo helper.
- **Cambio de firma de `close_table_session`**: se mitiga con la bandera.
- **Retención**: nunca se borra; siempre se anula con motivo. Siete años por el SRI.
- **IVA y SRI**: harán falta `prices_include_tax` y `order_items.tax_rate`, el mapeo de formas de pago del SRI y una secuencia por punto de emisión.

## Véase también
- [[Estado del Sistema — Auditoría 2026-09-26]]
- [[Modelo de Datos Definitivo]]
- [[Reglas de Negocio MVP]]
