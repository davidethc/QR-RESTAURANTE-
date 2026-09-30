# M07 · Cobro

## Estado en Monky

**Existe — ajustes menores.** El cobro ya está en producción en Monky. Confirmado leyendo el esquema y las acciones reales:

- `bills` ya tiene `bill_number`, `split_mode` (`NONE`\|`EQUAL`\|`ITEMS`), `split_parts`, `discount_total`, `paid_total`, `balance`, `customer_name`/`customer_email`/`customer_tax_id` (opcionales), `invoice_id` (punto de extensión para facturación futura).
- `payments` ya tiene `method` (`CASH`\|`CARD`\|`TRANSFER`\|`OTHER`), `status` (`COMPLETED`\|`VOIDED`), `idempotency_key`, `tip_amount`, `reference`, `card_type`, y **ya existen** `tendered_amount` y `change_amount` — la cantidad recibida y el cambio en efectivo no son campos nuevos, ya están modelados.
- Cada pago se asocia a `cash_session_id` (la sesión de caja abierta), no a la caja directamente; la caja se resuelve a través de la sesión.
- Las RPCs `open_bill`, `get_bill`, `get_session_bill`, `recompute_bill`, `apply_bill_discount`, `remove_bill_discount`, `set_bill_split`, `record_payment`, `close_bill`, `void_bill`, `void_payment`, `lock_bill` y `list_open_bills` ya existen y están en uso.

Gaps reales confirmados (no hay `payments.number` visible por pedido, ni ningún campo de método/monto preferido de pago en `orders` ni en `bills`):

| Gap | Dónde vive hoy | Ajuste propuesto |
|---|---|---|
| Número de transacción visible dentro del pedido (#1, #2…) | No existe | Agregar columna o calcularlo por `row_number()` sobre `payments` ordenado por `created_at`, particionado por `bill_id` |
| Precarga de "método preferido" y monto con el que pagará el cliente (viene de M12) | No existe en `orders` ni en `bills` | Agregar en `bills`, que es la entidad de dinero (`bills.customer_name` ya vive ahí); no agregar a `orders`, que es la comanda de cocina |
| Selector de método "Varios métodos" repartiendo entre efectivo/tarjeta/transferencia | No existe en la RPC actual de cobro | Extender `record_payment` o agregar una RPC de cobro combinado |

Como es un módulo de dinero en producción, **ninguna tarea de este documento reescribe la lógica core de cobro**; toda tarea de base de datos pasa por `db-architect` con revisión de `security-reviewer` antes de aplicarse (ver tabla de tareas).

## 1. Objetivo y alcance

**Entra:** cobro total o parcial de un pedido (mesa o mostrador), métodos Efectivo/Tarjeta/Transferencia y "Varios métodos", cálculo de cambio, número de transacción visible por pedido, anulación de pago, estados de pago del pedido.

**NO entra:** división de cuenta entre varios comensales (ya existe en Monky vía `set_bill_split` y se mantiene sin cambios), caja y cortes (M08), promociones/descuentos (M13 — este módulo solo aplica el descuento ya calculado).

## 2. Dependencias

M04 (pedido de mesa), M06 (pedido de mostrador), M08 (caja, para asociar el cobro a una sesión).

## 3. Datos

**Ya existe:** `bills`, `payments` (con `tendered_amount`, `change_amount`, `tip_amount`, `idempotency_key`, `cash_session_id`), `bill_discounts`, `set_bill_split`.

**A ajustar:**

| Cambio | Notas |
|---|---|
| Número de transacción visible en el ticket | Puede resolverse en la capa de lectura (sin columna nueva) o con una columna calculada |
| `bills.preferred_payment_method`, `bills.pays_with_amount` | Nuevas columnas para precargar el cobro cuando el pedido viene del menú digital (M12) |
| `payments.method = OTHER` | Confirmar si se mantiene visible en el selector o se reserva para casos internos futuros |

**Índices:** `payments(bill_id)`, `payments(cash_session_id, created_at)` (usado por el corte de caja, M08).

## 4. Estados y transiciones

```
            cobro parcial              cobro del resto
PENDIENTE ───────────────▶ PARCIAL ──────────────────▶ PAGADO
    │  cobro total                                      │
    └───────────────────────────────────────────────────┘
PAGADO ──(se agregan productos o sube el envío)──▶ PARCIAL, con aviso explícito de confirmación
cualquiera ──(cancelar pedido con motivo)──▶ ANULADO (el folio se muestra "Cancelado")
```

- Etiquetas: "Pago pendiente" (amarillo), "Pago parcial", "Pagado" (gris), "Anulado".
- Total pendiente de cotizar se muestra como "Envío + $22.50".
- Un pedido anulado no debe poder cobrarse: Monky oculta el botón de cobro en cualquier pedido con estado `ANULADO`, en las tres superficies donde aparece (POS de mostrador, panel de mesas, detalle del pedido).

## 5. Reglas de negocio y cálculos

```
Productos        = Σ precios de lista (sin descuento)
Descuento        = Σ descuentos de las promos (M13)
Costo de envío   = shipping_cost (o "Por cotizar")
Total            = Productos − Descuento + Envío
Monto cobrado    = Σ pagos no anulados
Monto restante   = Total − Monto cobrado
Cambio           = Cantidad recibida − Monto a cobrar   (recalculado mientras se escribe)
```

- "Varios métodos de pago": tres campos a la vez (recibido en efectivo, cobrado en tarjeta, cobrado en transferencia); Monky valida al enviar que la suma cubra el monto total, con un mensaje que indica cuánto falta si no alcanza.
- Si el cliente indicó en el menú digital con cuánto pagará (M12), el paso de cobro precarga el método marcado como "Método preferido" y ese monto, editable por quien cobra.
- Al anular un pago, Monky registra el evento en `audit_logs`; si el reembolso se hace con un método distinto al del pago original, se registra un evento de seguridad dedicado (ver M00).
- Editar el pedido (agregar productos o subir el costo de envío) después de estar Pagado pasa a "Parcial" **con una confirmación explícita** que indica el nuevo monto pendiente, antes de aplicar el cambio — Monky nunca hace esta transición en silencio.

## 6. Permisos por rol

Cajero (su pantalla completa) y Mesero (cobra desde el panel de mesas) pueden cobrar. Cocinero no tiene acceso. Dueño/Administrador ven y pueden cobrar en ambos paneles.

## 7. Pantallas

### 7.1 Paso de cobro (modal)

| Elemento | Detalle |
|---|---|
| Cabecera | Monto a cobrar del pedido |
| "Cobrar después" | Guarda el pedido con pago pendiente, sin registrar ningún pago |
| Sesión de caja | Selector con las cajas abiertas asignadas al miembro actual; la selección queda realmente aplicada al pago, no solo mostrada en pantalla |
| Método de pago | Efectivo (con cantidad recibida y cambio calculado en vivo) · Tarjeta · Transferencia bancaria · Varios métodos de pago (reparte entre los tres) |
| Indicador | Marca visual junto al método que el cliente ya había elegido en línea |
| Botones | Cancelar / Confirmar cobro |

### 7.2 Detalle del pedido — bloque de pagos

- Estado (Pagado / Pago parcial / Pago pendiente / Anulado) y la caja donde se procesó.
- Historial de transacciones con hora y método, incluyendo el cambio entregado cuando aplica.
- En pedidos originados en el menú digital, se muestra el método y monto que el cliente indicó al pedir.
- Botón para cobrar el saldo restante, desactivado si ya está pagado y oculto si el pedido está anulado.

## 8. Procesos paso a paso

**Cobro en mesa:** Cerrar mesa → Cobrar mesa → elegir método (Efectivo con cantidad recibida/cambio, Tarjeta, Transferencia, o Varios métodos repartiendo el monto) → Confirmar cobro → la mesa queda disponible.

**Cobro en mostrador:** cobrar de inmediato con un método, o "Cobrar después" → el pedido se guarda con pago pendiente y el botón cambia a "Guardar sin cobrar".

## 9. Textos de la interfaz

Redactar textos propios de Monky con el mismo propósito, en español neutro y tono cálido y breve. Ejemplos de referencia (a redactar, no copiar literal):

- Encabezado del modal de cobro indicando el monto total a cobrar.
- Aviso de que el pedido quedará con pago pendiente al elegir "Cobrar después".
- Etiqueta de cambio calculado junto al monto recibido.
- Línea de historial de pago con método, monto y hora.
- Indicador de método preferido cuando el pedido viene del menú digital.

## 10. Casos límite y requisitos

| # | Situación | Requisito de Monky |
|---|---|---|
| 1 | Se sube el costo de envío de un pedido ya pagado | Monky pide confirmación explícita mostrando cuánto queda pendiente antes de pasar a "Parcial" |
| 2 | Selección de caja y método en el modal de cobro | El estado mostrado en pantalla siempre coincide con lo realmente seleccionado; confirmar registra el pago en el primer intento |
| 3 | Pedido anulado | El botón de cobro no existe ni se puede activar por ningún camino en ningún pedido anulado |
| 4 | Reembolso con un método distinto al del pago original | Se registra un evento de seguridad auditable con el detalle del cambio de método |

## 11. Criterios de aceptación

- Dado un cobro en efectivo con "Cantidad recibida" menor al total, cuando se escribe, entonces el cambio se recalcula en vivo y puede mostrarse negativo hasta completar el monto (bloquear "Cobrar" mientras sea negativo).
- Dado "Varios métodos de pago", cuando la suma de los tres campos no cubre el total, entonces "Cobrar" se bloquea con el mensaje de cuánto falta.
- Dado un pedido anulado, cuando se abre su detalle, entonces no existe ningún control que permita cobrarlo.
- Dado un pedido Pagado al que se le sube el costo de envío, cuando se guarda, entonces aparece una confirmación explícita antes de pasar a "Parcial".
- Dado un pago anulado con un método distinto al original, cuando ocurre, entonces se registra el evento de seguridad correspondiente.

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M07-T01 | Auditoría del esquema actual de `bills`/`payments` contra los campos requeridos (número de transacción, método/monto preferido) | BD | db-architect | S | — | Informe de gaps + migración si falta algo |
| M07-T02 | Migración: `bills.preferred_payment_method`, `bills.pays_with_amount` | BD | db-architect | S | M07-T01 | Migración aplicada, revisada por security-reviewer |
| M07-T03 | RPC/extensión de `record_payment` para "Varios métodos", validación de suma y cálculo de cambio | BD | db-architect | L | M07-T02 | Rechaza si la suma no cubre el total; idempotente ante doble clic |
| M07-T04 | Server action: precargar "Método preferido" y monto desde `bills.preferred_payment_method`/`pays_with_amount` | Backend | money-backend | S | M07-T03 | Verificado con pedido creado desde M12 |
| M07-T05 | Confirmación explícita al subir el total de un pedido ya Pagado | Backend | money-backend | S | M07-T03 | Requisito #1 cerrado |
| M07-T06 | Ocultar/deshabilitar cobro en pedidos anulados en toda la UI (POS, mesas, detalle) | Frontend | ui-caja | S | M07-T03 | Requisito #3 cerrado, verificado en los 3 lugares |
| M07-T07 | UI paso de cobro (Efectivo con cambio en vivo, Tarjeta, Transferencia, Varios métodos) | Frontend | ui-caja | L | M07-T03 | Reproduce §7.1 con textos propios de Monky |
| M07-T08 | UI bloque de pagos en detalle del pedido (historial de transacciones) | Frontend | ui-caja | M | M07-T03 | Reproduce §7.2 |
| M07-T09 | Instrumentar evento de seguridad de reembolso con método distinto | Backend | money-backend | S | M07-T03, M00-T02 | Evento se registra en `audit_logs` |
| M07-T10 | Tests de dinero: cambio, varios métodos, idempotencia, pedido anulado no cobrable | QA | test-writer | L | M07-T03..T06 | Suite SQL con BEGIN/ROLLBACK + Vitest |
| M07-T11 | QA en vivo: cobro efectivo/tarjeta/transferencia/varios métodos en `monky-qa` | QA | qa-e2e | M | M07-T07, M07-T08 | Registrado en `app/TESTING.md` |
| M07-T12 | Revisión de seguridad: doble cobro, RLS de `payments`, montos negativos | QA | security-reviewer | M | M07-T02..T06 | Informe sin hallazgos críticos |

Basado en el relevamiento interno de funcionalidades del POS.
