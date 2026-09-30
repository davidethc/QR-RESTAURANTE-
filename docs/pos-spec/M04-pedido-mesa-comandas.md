# M04 · Pedido de mesa y comandas por ronda

## Estado en Monky

Ya existen `table_sessions` (una sesión activa por mesa, con `status` `ACTIVE`|`CLOSED`|`EXPIRED`, `customer_label`, `counter_number`), `orders` (`status` `PENDING`|`ACCEPTED`|`PREPARING`|`READY`|`DELIVERED`|`REJECTED`|`CANCELLED`, con `accepted_at`/`preparing_at`/`ready_at`/`delivered_at`, `rejection_reason`, `order_number` como identidad global autogenerada) y `order_items` (`product_name`, `quantity`, `unit_price`, `subtotal`, `notes`, con nombre y precio copiados al pedido en el momento de crearlo, sin referenciar en vivo el catálogo). El RPC `create_staff_order` y `get_session_orders` muestran que **cada ronda ya se modela como una fila nueva de `orders` ligada a la misma `table_sessions.id`**, no como un agrupador ("comanda") dentro de un único pedido — es decir, la idea de "comandas por ronda" de este módulo ya existe en la práctica, solo que expresada como varios `orders` por sesión en vez de un objeto `ticket` aparte.

Falta, y este módulo agrega:

- Un **folio visible y consistente por sucursal**: `orders.order_number` es una identidad autogenerada global de toda la base, no un consecutivo por restaurante ni un código corto legible.
- Un **código corto alfanumérico** para identificar el pedido en pantalla/impresión.
- "Separar uno" y edición de línea ya enviada (hoy `order_items` no tiene bandera de cancelado por línea ni distingue "antes de enviar" de "ya enviada").
- Transferir pedido entre mesas.
- Motivo obligatorio al cancelar un pedido desde el panel de mesas.

La decisión de si estas rondas se siguen modelando como varias filas de `orders` por sesión (extendiendo lo existente) o si conviene introducir una tabla `tickets` que agrupe varias líneas dentro de un mismo `orders` es una decisión de diseño para `db-architect`; a continuación se documenta la opción de tabla `tickets` tal como la plantea este módulo, pero se debe evaluar primero si basta con enriquecer el modelo ya vigente de "varios `orders` por `table_sessions`".

## 1. Objetivo y alcance

**Entra:** abrir/cerrar/reabrir mesa, agregar productos en rondas (comandas), editar o cancelar productos de una comanda ya enviada, transferir pedido a otra mesa libre, cancelar pedido con motivo, folio y código corto del pedido.

**No entra:** cobro (fuera de este conjunto de módulos). Disponibilidad (M02). Pedido del cliente vía QR de mesa, que crea comandas sobre esta misma estructura.

## 2. Dependencias

M01 (catálogo con variantes y modificadores), M02 (disponibilidad), M03 (zonas y mesas).

## 3. Datos

**Ya existe:** `orders`/`order_items` con notas, `table_sessions`, `qr_token` de mesa.

**A extender/crear:**

| Entidad | Campos | Notas |
|---|---|---|
| `orders` | agregar `folio int` (consecutivo por sucursal, no se reinicia), `short_code char(5)` (alfanumérico en mayúsculas), `service_type` (`table`\|`dine_in_no_table`\|`takeaway`\|`delivery`\|`pickup`, ver M06), `status_review` (`new`\|`reviewed`), `cancelled bool`, `cancel_reason text`, `cancelled_by uuid` | El folio también debe consumirse en pedidos de mesa vacíos (abiertos sin productos aún) |
| `tickets` (propuesta — "Comanda") | `order_id`, `number int` (1..N dentro del pedido), `created_at`, `created_by` (miembro del staff o `digital_menu`), `kitchen_status` (`pending`\|`completed`), `completed_at`, `is_new bool` | Agrupa los `order_items` de una misma ronda; evaluar contra el modelo actual de "varios `orders` por sesión" antes de construir |
| `order_items` | agregar `ticket_id` (si se adopta `tickets`), `name_snapshot`, `unit_price_snapshot`, `cancelled bool` | Cancelar un producto no borra la línea, la marca |

**Índices:** `tickets(order_id, number)` único, `orders(restaurant_id, folio)` único, `orders(short_code)`.

## 4. Estados y transiciones

**Mesa (según sesión/pedido activo):**

```
DISPONIBLE ──Abrir mesa (mesero) o QR del cliente con nombre──▶ ACTIVA
ACTIVA ──nueva comanda del cliente──▶ ACTIVA + "comanda sin revisar"
ACTIVA ──cliente pide llamar al mesero──▶ ACTIVA + "solicitando mesero"
ACTIVA ──cliente pide la cuenta──▶ ACTIVA + "solicitando cuenta" (limpia "solicitando mesero")
ACTIVA ──mesero cierra la mesa──▶ CUENTA (imprimir cuenta / cobrar mesa)
CUENTA ──"Reabrir mesa"──▶ ACTIVA
CUENTA ──"Cobrar mesa" (pago total)──▶ DISPONIBLE (pedido al historial)
ACTIVA/CUENTA ──"Transferir pedido" a mesa DISPONIBLE──▶ origen DISPONIBLE, destino ACTIVA
ACTIVA/CUENTA ──"Cancelar pedido"──▶ DISPONIBLE
```

Una mesa ya cobrada no se puede reabrir: solo se consulta e imprime desde el historial.

**Comanda:** `POR PREPARAR → COMPLETADA → (Devolver a preparación) → POR PREPARAR` (detalle en M05).

## 5. Reglas de negocio y cálculos

- **Precio de línea:** `precio_unitario = precio_variante + Σ(precio_opción × cantidad_opción)`; `subtotal_línea = precio_unitario × cantidad`.
- **Folio:** consecutivo por sucursal, no se reinicia; los pedidos de mesa vacíos también consumen folio.
- **Comanda:** numerada 1..N dentro del pedido.
- **Código corto:** 5 caracteres alfanuméricos en mayúsculas.
- **"Separar uno":** divide una línea de cantidad N en N líneas de cantidad 1, conservando la cantidad total; se prueba automáticamente que ninguna unidad se pierde en el proceso.
- **Edición en una comanda ya enviada:** cada línea permite Editar (variante o nota, no la cantidad) o Cancelar producto (genera evento de auditoría). Antes de enviar (carrito), se permite Editar, Separar uno y Remover libremente.
- **Transferir pedido:** solo a mesas disponibles de la misma zona; se mueve todo (comandas, notas, folio y pagos); el origen queda disponible.
- **Cancelar pedido:** siempre pide motivo obligatorio, tanto en mesa como en mostrador.

## 6. Permisos por rol

Dueño, Administrador y Mesero tienen acceso al Panel de mesas. Cajero y Cocinero son redirigidos (a POS y KDS respectivamente) si intentan entrar.

## 7. Pantallas

### 7.1 `/tables` — Panel de mesas

- Sin zonas configuradas: mensaje invitando a configurar zonas y mesas primero.
- Barra de contadores: mesas solicitando cuenta, solicitando mesero, con comandas sin revisar, mesas activas.
- Pestañas de zona con indicadores de color (uno para "esperando cuenta", otro para "comandas nuevas").
- Plano: mesas con su forma y tamaño; celdas vacías marcadas; mesa ocupada resaltada; indicador de comanda nueva.
- **Tocar una mesa:**
  - Disponible: mensaje breve + botón Abrir mesa.
  - Ocupada: detalle del pedido con Cerrar mesa y menú "…" → Reabrir mesa (solo en estado Cuenta) / Transferir pedido / Cancelar pedido; aviso si el cliente pidió la cuenta.
  - En cuenta: Imprimir cuenta · Cobrar mesa · total a pagar.
- **Transferir:** selector de mesa destino con la actual marcada "(Actual)"; si no hay mesas libres en la zona, se avisa explícitamente que no hay ninguna disponible.
- **Historial** (`/tables/historial`): tabla de pedidos con nombre, tipo "En mesa", fecha, estado de pago y total; detalle de solo lectura con "Imprimir cuenta".

### 7.2 Selector de productos (compartido con M06)

- Buscador de productos y tarjetas con imagen, etiqueta de promoción, nombre y "Desde $X"; estado vacío invita a ir al catálogo.
- Ficha de producto: precios (selección de variante obligatoria), personalizaciones con controles +/− y tope según `max_select`, nota adicional, Cancelar / Agregar producto.
- Carrito: tabla con imagen, "Producto - Variante", nota entre comillas, cantidad editable, menú "…" → Editar / Separar uno / Remover. Botones Cancelar / Guardar.
- Si falta elegir la variante obligatoria, el error se muestra junto al campo exacto, no como un botón inerte.

### 7.3 Detalle del pedido (estructura reutilizada en M06)

- Encabezado: fecha y hora, folio y código corto, nombre y teléfono del cliente.
- Botones: Imprimir pedido · Cobrar restante (desactivado si ya está pagado) · menú "…": Editar pedido / Copiar pedido / Contactar cliente / Cancelar pedido (motivo obligatorio).
- Etiquetas: cantidad de productos, tipo de pedido, canal.
- Nota general destacada.
- Comandas: "Comanda #n" con indicador de nueva, hora y autor; desplegable con líneas y menú "…" → Editar productos / Imprimir comanda.
- Botón "+ Agregar productos" crea una nueva comanda.
- Totales: productos, costo de envío, total, monto cobrado, monto restante.

## 8. Procesos paso a paso

**Servicio en mesa tomado por el mesero:**

1. Mesero → Panel de mesas → toca mesa disponible → mensaje de apertura → Abrir mesa. Se crea el pedido con folio y código, sin productos todavía.
2. Agregar productos (buscador, ficha con variante/personalizaciones/nota/cantidad → Agregar producto; en el carrito Editar/Separar uno/Remover → Guardar).
3. Se crea la Comanda #1 (hora y autor) y aparece al instante en el KDS (M05).
4. Otra ronda: "Agregar productos" crea la Comanda #2, con su propia hora y autor.
5. Correcciones: en una comanda ya enviada, menú "…" → Editar productos → por línea, Editar (variante o nota) o Cancelar producto; "Imprimir comanda" para reimprimir.
6. Cambio de mesa: menú "…" → Transferir pedido → elegir mesa libre; se mueve todo.
7. Cuenta: Cerrar mesa → estado Cuenta, con el total mostrado → Imprimir cuenta (precuenta) → se entrega al cliente. Si piden algo más: "…" → Reabrir mesa.
8. Cobro: fuera de este módulo.
9. Cancelar: menú "…" → Cancelar pedido → confirmación con motivo obligatorio; la mesa queda libre.
10. El pedido queda en el historial de mesas y suma a las ventas del día y al esperado de la caja que cobró.

## 9. Textos de la interfaz

- "Mesa N disponible. Abre la mesa para empezar a agregar productos."
- "No has agregado productos aún. Ir a productos →"
- "Selecciona la mesa a la que se moverá el pedido de la mesa N."
- "No hay mesas disponibles en esta zona en este momento."
- "Esta mesa está esperando la cuenta."
- "Gestiona los pedidos de las mesas: levanta comandas y cobra cuentas directamente desde este panel."
- "El pedido será cancelado y no podrás deshacer esta acción."

## 10. Casos límite y requisitos

| # | Requisito |
|---|---|
| 1 | Abrir mesa no crea un pedido con productos hasta el primer "Guardar"; los pedidos vacíos se excluyen explícitamente de cualquier bloqueo del corte de caja. |
| 2 | Una mesa ya cobrada solo puede reabrirse o anularse con permiso elevado, motivo obligatorio y registro de auditoría. |
| 3 | Cancelar pedido siempre pide motivo, tanto en mostrador como en mesa. |
| 4 | Al editar un pedido, el teléfono existente del cliente se precarga; nunca sale vacío si ya se había capturado. |
| 5 | "Separar uno" se cubre con una prueba automática que compara la cantidad total antes y después de la operación. |
| 6 | Si falta la variante obligatoria, el mensaje de error aparece junto al campo, nunca deja el botón inerte sin explicación. |

## 11. Criterios de aceptación

- Dado que se abre una mesa disponible, cuando se confirma, entonces se crea un pedido con folio y código corto, sin comandas todavía.
- Dado un pedido de mesa con una línea de cantidad 3, cuando se usa "Separar uno", entonces las líneas resultantes suman 3 unidades en total.
- Dado un pedido en estado Cuenta, cuando se toca "Reabrir mesa", entonces vuelve a Activa y se pueden agregar más productos.
- Dado un pedido ya cobrado en su totalidad, cuando se busca en el panel, entonces no aparece la opción "Reabrir mesa" ni "Cobrar".
- Dado "Cancelar pedido" desde una mesa, cuando se confirma sin escribir motivo, entonces el sistema bloquea el envío y pide el motivo.
- Dado "Transferir pedido", cuando la zona no tiene mesas libres, entonces se muestra el aviso correspondiente y no se puede continuar.

## 12. Tareas

| ID | Tarea | Tipo | Agente | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M04-T01 | Migración: `orders.folio/short_code/service_type/status_review/cancelled/cancel_reason/cancelled_by`, tabla `tickets` (si se adopta), `order_items.ticket_id/cancelled` | BD | db-architect | L | M03-T01 | Folio consecutivo por sucursal sin huecos por concurrencia (secuencia o `SELECT ... FOR UPDATE`) |
| M04-T02 | RPC: abrir mesa (crea pedido + folio + código), agregar comanda, cancelar producto, cancelar pedido con motivo | BD | db-architect | L | M04-T01 | Transaccional; el folio nunca se reinicia |
| M04-T03 | RPC: transferir pedido (mueve comandas/pagos/folio a mesa destino, origen queda disponible) | BD | db-architect | M | M04-T01, M03-T02 | Falla si el destino no está disponible o no es de la misma zona |
| M04-T04 | Server action "Separar uno" con test de conservación de cantidad | Backend | money-backend | S | M04-T01 | Cantidad total antes/después idéntica |
| M04-T05 | UI Panel de mesas (plano, contadores, estados de mesa, modal transferir) | Frontend | ui-caja | L | M04-T02, M04-T03, M03-T04 | Reproduce §7.1 |
| M04-T06 | UI selector de productos y carrito (variante obligatoria con error visible, personalizaciones +/-, Separar uno) | Frontend | ui-caja | L | M04-T04, M01-T05 | Mensaje visible junto al campo cuando falta la variante |
| M04-T07 | UI detalle de pedido / comanda (editar línea, cancelar producto, imprimir comanda) | Frontend | ui-caja | L | M04-T02 | Reproduce §7.3 |
| M04-T08 | Historial de panel de mesas (solo lectura) | Frontend | general-purpose | M | M04-T02 | Ruta `/tables/historial` |
| M04-T09 | Motivo obligatorio en cancelación desde mesa | Backend | general-purpose | S | M04-T02 | Verificado con prueba automatizada |
| M04-T10 | Tests SQL/E2E: folio consecutivo bajo concurrencia, transferencia, separar uno, cancelación con motivo | QA | test-writer | L | M04-T01..T09 | Suite completa con rollback |
| M04-T11 | QA en vivo: flujo §8 completo en `monky-qa` | QA | qa-e2e | M | M04-T05..T09 | Registrado en `app/TESTING.md` |
| M04-T12 | Flujo cuenta pedida: Cerrar mesa → estado "cuenta" (sin agregar productos) → Imprimir cuenta / Cobrar mesa / Reabrir mesa; revisar primero lo que ya existe (precuenta, "Pedir cuenta" del cliente, cierre de sesión de mesa) y completar solo lo que falte | Backend | general-purpose | M | M04-T02 | Cerrar bloquea agregar productos; Reabrir solo antes de cobrar; el pedido de cuenta del cliente por QR marca "esperando la cuenta"; el cobro total libera la mesa |
| M04-T13 | Unir mesas: juntar dos mesas ocupadas en una sola cuenta (grupos grandes), separar si no hay pagos, con auditoría | Backend | db-architect | M | M04-T03 | Comandas y pagos de ambas quedan en una cuenta coherente (una sola cuenta viva por sesión); candados en orden mesa→sesión; auditoría; solo Dueño/Administrador/Mesero |

Basado en el relevamiento interno de funcionalidades del POS.
