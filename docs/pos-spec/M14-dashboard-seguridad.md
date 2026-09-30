# M14 · Dashboard "Hoy" y seguridad

## Estado en Monky

**Ya existe:**
- La RPC `get_dashboard_summary` y la pantalla `/today` ("Hoy"), con tarjetas de pedidos pendientes, pedidos en cocina, mesas ocupadas, vendido hoy y estado de caja.
- Las RPCs de reportes `report_sales_by_period`, `report_sales_by_product`, `report_sales_by_category`, `report_sales_by_staff`, `report_payments_by_method`, `report_discounts`, `report_peak_hours`, `report_prep_times`, `get_top_products` y `report_sales_summary`, todas con guardas de acceso (`report_guard`) y agregación en hora local (`restaurant_tz`, `business_date`, `business_day_bounds`).
- `audit_logs`, con 24 tipos de evento ya cubiertos (creación/edición/borrado, login/logout, ciclo de vida de pedidos, llamadas de mesero, cuentas, descuentos, pagos, caja). Esta base de seguridad ya cubre buena parte de lo que este módulo necesita mostrar — no es un módulo "Nuevo" desde cero.
- La pantalla `/reports`, con selector de rango de fechas y agregación por hora local, restringida a Dueño y Administrador.
- Permisos: `isManager` (Dueño/Administrador) controla quién ve "Hoy"; `canHandleMoney` (Dueño/Administrador) controla quién ve Reportes. Mesero y Cocina hoy **no tienen ninguna vista** de "Hoy" — Cocina va directo a `/kitchen` y Mesero a `/orders`.

**Se adapta:**
- Las tarjetas de "Hoy" existentes no traen todavía las tres cifras (Total / Punto de venta / Menú digital) ni el desglose por canal, opción de servicio o método de pago: eso depende de que existan canales de venta distintos (mostrador, domicilio, para llevar), que hoy no están construidos.
- El filtro de fecha de "Hoy" y de "Reportes" no es todavía un único componente reutilizado en ambas pantallas.
- No existe hoy una vista reducida de "Hoy" para roles operativos: Mesero y Cocina simplemente no entran a esa ruta. Habrá que decidir si se les da una vista limitada (solo agotados y novedades) o se mantiene la redirección actual.

**Es nuevo:**
- Las tarjetas de "Productos agotados" y "Personalizaciones agotadas" (dependen del módulo de disponibilidad).
- El desglose de ventas y pedidos por canal (Punto de venta / Menú digital) y por opción de servicio (Domicilio, Para llevar, En el local, Mesas): requiere que existan esos canales y tipos de pedido en el sistema.
- La pantalla de historial de seguridad con filtros por acción o miembro (hoy `audit_logs` existe pero no tiene una pantalla propia de consulta).

## 1. Objetivo y alcance

**Entra:** pantalla "Hoy" con indicadores del periodo elegido, filtro de fecha común (Hoy/Ayer/Últimos 7 días/Últimos 30 días/Mes anterior/6 meses anteriores + rango personalizado), vista reducida para roles operativos (sin cifras de venta), historial de seguridad con filtros.

**No entra:** la generación del historial de seguridad en sí — los eventos y dónde se disparan se definen junto con cada módulo de negocio; este módulo solo los **muestra** con filtros.

## 2. Dependencias
Roles y seguridad, Cobro, Pedidos de mesa y de mostrador, Promociones (para desglosar descuentos si aplica).

## 3. Datos

Reutiliza las RPCs de reportes ya existentes. Antes de construir cada tarjeta, verificar que la RPC cubra exactamente las columnas necesarias.

| Tarjeta | Fuente de datos |
|---|---|
| Productos agotados / Personalizaciones agotadas | Disponibilidad de productos y variantes |
| Total de ventas, Pedidos, Envíos, Propinas, Ticket promedio | Pagos y pedidos (`report_sales_by_period`, ya trae `avg_ticket`) |
| Ventas promedio por día de semana | Agregación por día de la semana en hora local |
| Ventas/Pedidos por canal | Requiere distinguir el canal del pedido (mostrador vs. menú digital) |
| Métodos de pago más usados | `report_payments_by_method` |
| Total de ventas por opción de servicio | Requiere el tipo de servicio del pedido (Domicilio, Para llevar, En el local, Mesas) |
| Productos con más/menos ventas | `report_sales_by_product` / `get_top_products` |

## 4. Estados y transiciones
No aplica.

## 5. Reglas de negocio y cálculos
- Cada indicador trae **tres cifras**: Total / Punto de venta / Menú digital.
- Solo suma **dinero cobrado**: un pedido cancelado sin pagos no cuenta en ninguna cifra.
- Ticket promedio = ventas ÷ pedidos.
- "Ventas promedio por día de semana": con un solo día seleccionado en el filtro, se muestra "Disponible solo para rangos de varios días" en vez de la gráfica.
- Todos los cálculos en hora local de la sucursal (zona horaria fija `America/Guayaquil`), con el corte comercial configurable ya vigente (campo "El día termina a las" en Configuración → Cobro y caja) — mantener ese mismo corte en todos los reportes de este módulo, incluida la pantalla "Hoy".

## 6. Permisos por rol
- "Hoy": todos los roles, pero los roles operativos (Mesero, Cocina) no ven cifras de venta, solo agotados y novedades.
- Historial de seguridad: solo Dueño y Administrador.

## 7. Pantallas

### 7.1 `/today` ("Hoy")
Controles: filtro de fecha común y tooltips de ayuda.

| Tarjeta | Contenido |
|---|---|
| Productos agotados | Variantes agotadas + "Ver más" |
| Personalizaciones agotadas | Ejemplo: "Queso extra · Elige tu salsa · Agotado" |
| Total de ventas | Monto cobrado |
| Pedidos | Cantidad |
| Envíos | Monto de envíos |
| Propinas | Monto |
| Ticket promedio | Ventas ÷ pedidos |
| Ventas promedio por día de semana | Barras Lun–Dom; con un solo día: mensaje de rango insuficiente |
| Ventas por canal de venta | Punto de venta / Menú digital |
| Pedidos por canal de venta | Punto de venta / Menú digital |
| Métodos de pago más usados | Efectivo / Tarjeta / Transferencia con monto |
| Total de ventas por opción de servicio | Domicilio, Para llevar/recoger, En el local, Mesas |
| Productos con más ventas | Nombre, unidades, monto |
| Productos menos vendidos | Igual |
| Últimas novedades | Enlace a novedades del catálogo |

### 7.2 Filtro de fecha común (reutilizado en todo el panel)
Hoy · Ayer · Últimos 7 días · Últimos 30 días · Mes anterior · 6 meses anteriores + calendario de rango · Cancelar/Aplicar. Debe ser el mismo componente en "Hoy", Pedidos y Cortes de caja.

### 7.3 `/ajustes/historial-de-seguridad`
Lista de eventos de auditoría con filtro por tipo de acción y por miembro.

## 8. Procesos paso a paso
**Supervisión del dueño:**
- Revisar "Hoy" con el periodo elegido: ventas y pedidos por canal, métodos de pago, opción de servicio, más y menos vendidos, y agotados.
- Historial de seguridad: filtrar por acción o miembro para revisar cancelaciones, retiros, cortes con diferencia y rebajas de precio.

## 9. Textos de la interfaz
- "Disponible solo para rangos de varios días"
- Usar textos propios de Monky para el resto de etiquetas, con el mismo propósito que las de §7.1.

## 10. Casos límite y requisitos
| # | Requisito |
|---|---|
| 1 | El filtro de fecha debe ser el **mismo componente** en "Hoy", Pedidos, Cortes y cualquier otra pantalla con filtro de fecha, para que responda igual en todas. |
| 2 | El corte comercial configurable se respeta de forma consistente en todos los reportes de este módulo, incluido "Hoy" — nunca se calcula "Hoy" con medianoche si el corte es otro. |

## 11. Criterios de aceptación
- Dado un pedido cancelado sin pagos, cuando se calcula "Total de ventas", entonces no suma nada.
- Dado el filtro "Últimos 7 días" con un solo día de datos, cuando se ve "Ventas promedio por día de semana", entonces se muestra el mensaje de rango insuficiente en vez de una gráfica vacía.
- Dado un miembro con rol Mesero o Cocina, cuando entra a "Hoy", entonces no ve ninguna cifra de dinero ni de ventas, solo agotados y novedades.
- Dado el filtro de fecha, cuando se usa en "Hoy" y en Pedidos, entonces es el mismo componente con el mismo comportamiento.

## 12. Tareas
| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M14-T01 | Auditoría de `/today` y `/reports` contra las 14 tarjetas de §7.1 | BD | reports-builder | M | Cobro | Informe de gaps por tarjeta |
| M14-T02 | Componente único de filtro de fecha (Hoy/Ayer/7d/30d/mes anterior/6 meses/rango) reutilizado en todo el panel | Frontend | reports-builder | M | M14-T01 | Usado en Hoy, Pedidos y Cortes |
| M14-T03 | RPCs de agregación faltantes (por canal, por opción de servicio, ticket promedio, ventas por día de semana) | BD | reports-builder | L | M14-T01 | Cifras solo cuentan dinero cobrado |
| M14-T04 | UI de las 14 tarjetas con las tres cifras (Total/Punto de venta/Menú digital) | Frontend | reports-builder | L | M14-T02, M14-T03 | Reproduce §7.1 |
| M14-T05 | Vista reducida para roles operativos (sin cifras de venta) | Frontend | reports-builder | S | M14-T04 | Verificado con Mesero y Cocina |
| M14-T06 | Tests: exclusión de pedidos cancelados sin pago, mensaje de rango insuficiente | QA | test-writer | M | M14-T03, M14-T04 | Suite SQL + Vitest |
| M14-T07 | QA en vivo comparando cifras del dashboard contra pedidos reales en `monky-qa` | QA | qa-e2e | M | M14-T04 | Registrado en `app/TESTING.md` |

Basado en el relevamiento interno de funcionalidades del POS.
