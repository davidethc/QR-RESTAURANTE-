# M06 · POS de mostrador y tipos de pedido

## Estado en Monky

Ya existe la venta rápida de mostrador: `createCounterSale`/`cancelCounterSale` (`src/lib/actions/counter.ts`) junto con las RPC `create_counter_sale`, `cancel_counter_sale` y `lock_counter_table`, que reservan una fila de `tables` con `kind = COUNTER` para representar la venta sin mesa asignada. `orders.table_id` es obligatorio hoy (toda venta, incluida la de mostrador, cuelga de una fila de `tables`), y no existen todavía campos de tipo de pedido, proveedor de domicilio ni dirección en `orders`. Falta: los tres tipos explícitos "Para comer aquí (sin mesa)", "Para llevar" y "Domicilio" (propio o de aplicaciones externas) con sus campos propios, "Cobrar después", edición del pedido tras crearlo y "Copiar pedido"/"Contactar cliente" para el repartidor.

## 1. Objetivo y alcance

**Entra:** pantalla de Panel de pedidos (POS), modal "Agrega un pedido" con selector de tipo, selector de productos (compartido con M04), paso de cobro con "Cobrar después", detalle del pedido con edición y acciones para domicilio (copiar datos, copiar pedido, contactar cliente).

**No entra:** el cobro en sí (montos, métodos, cambio). El menú digital de domicilio/recoger creado por el propio cliente, que comparte el mismo modelo de `orders` pero lo origina el cliente. Zonas y mesas (M03/M04).

## 2. Dependencias

M01, M02, M04 (reutiliza el selector de productos y la estructura de detalle de pedido).

## 3. Datos

Reutiliza `orders`/`order_items` de M04. Campos que se usan aquí:

- `service_type`: `dine_in_no_table` | `takeaway` | `delivery` | `pickup`.
- `delivery_provider` (`own`|`external_platform_1`|`external_platform_2`|`external_platform_3`) y `external_order_id`.
- `customer_name`, `customer_phone` (con código de país), `delivery_address` (jsonb: colonia/barrio, calle, número, entre calles, referencias, geo opcional).
- `general_comment`.
- `shipping_cost` (nulo = "Por cotizar").
- `preferred_payment_method` + `pays_with_amount` (uso principal en el menú digital, pero el campo vive en `orders`).
- `created_by` (miembro del staff) o `digital_menu`.

**A agregar:**

| Campo | Tabla | Notas |
|---|---|---|
| `delivery_provider`, `external_order_id` | `orders` | Nuevos |
| `customer_phone`, `delivery_address jsonb` | `orders` | Nuevos |
| `preferred_payment_method`, `pays_with_amount` | `orders` | Se muestran si vienen precargados desde el menú digital |

## 4. Estados y transiciones

Reutiliza el estado de pago (Pendiente/Parcial/Pagado/Anulado) definido en M04 §4; aplica igual a pedidos de mostrador. No hay estado "mesa" en este módulo.

## 5. Reglas de negocio y cálculos

- El tipo de pedido determina qué campos aparecen (tabla en §7.2).
- Las opciones de servicio apagadas en Configuración aparecen "Deshabilitado" en el selector de tipo.
- Sin tipo elegido, "Continuar" no avanza y muestra el error junto al campo.
- "Cobrar después" guarda el pedido con pago pendiente; el botón cambia de "Cobrar $X" a "Guardar sin cobrar".
- Reglas de precio de línea y totales: iguales a M04 §5.

## 6. Permisos por rol

Dueño, Administrador y Cajero tienen acceso al Panel de pedidos (POS). Mesero es redirigido a Mesas, Cocinero al KDS.

## 7. Pantallas

### 7.1 `/orders` — Panel de pedidos

- Pestañas: Panel de pedidos | Panel de mesas | Comandas digitales.
- Estado vacío: mensaje invitando a crear pedidos desde el POS o recibirlos del menú digital, con botones Compartir menú y + Nuevo pedido.
- Cabecera: + Nuevo pedido · menú "…" → Pausar menú digital. Si está pausado: barra "Menú digital pausado hasta las H:MM · Reactivar".
- Barra: filtro de fecha · "N pedidos sin revisar".
- Tabla: pedido (número, "Nuevo" o "Cancelado"), nombre, tipo (En el local / Para llevar / Domicilio / Para recoger), fecha, estado de pago, total ("Envío + $X" si falta cotizar), paginación.

### 7.2 Modal "Agrega un pedido" / "Editar pedido #N"

Formulario a la izquierda, vista previa del ticket a la derecha.

| Campo | Tipo | Cuándo aparece | Reglas |
|---|---|---|---|
| Tipo de pedido | select | siempre | Para comer aquí ("consumir en el local, sin una mesa asignada") / Para llevar ("productos envueltos") / Domicilio ("servicio propio o de terceros"). Opciones apagadas salen "Deshabilitado" |
| Nombre de cliente | texto | comer aquí y para llevar (opcional) | — |
| Servicio de entrega | select | domicilio | Domicilio propio / plataforma externa 1 / plataforma externa 2 / plataforma externa 3 |
| ID de pedido de la plataforma | texto | plataformas externas | — |
| Datos de cliente: nombre, teléfono, colonia, calle, número ("casa, depto, edificio"), entre calles, referencias | texto | domicilio propio | — |
| Costo de envío | monto | domicilio propio | vacío = "Por cotizar" |
| Productos | botón "Agregar productos…" / "Editar productos…" | siempre | Al editar un pedido existente, se edita por comanda |
| Comentario adicional | casilla + texto | siempre | — |

- Botones: Cancelar / Continuar (o "Guardar cambios" al editar).

### 7.3 Paso de cobro

| Elemento | Detalle |
|---|---|
| Cabecera | "Cobrar al cliente: $X" |
| Cobrar después | casilla: "el pedido se guardará con pago pendiente"; el botón pasa a "Guardar sin cobrar" |
| Caja | selector con las cajas asignadas al miembro, realmente seleccionada al abrir el paso |
| Método de pago | Efectivo / Tarjeta / Transferencia / Múltiples métodos; con método preferido del cliente, se etiqueta "Método preferido" |
| Botones | Cancelar / Cobrar $X |

### 7.4 Detalle del pedido (mostrador)

Misma estructura que M04 §7.3, más para domicilio:

- "Mostrar datos de envío" (desplegable): calle, número, colonia, referencias, con botón Copiar.
- Menú "…" → Copiar pedido (texto de §9).
- Menú "…" → Contactar cliente (abre WhatsApp; desactivado sin teléfono).

## 8. Procesos paso a paso

**Comer aquí sin mesa:**
1. Cajero: Panel de pedidos → Nuevo pedido → Tipo "Para comer aquí" → nombre de cliente (opcional) → Productos → comentario opcional → Continuar.
2. Cobro: cobrar ahora, o "Cobrar después" ("el pedido se guardará con pago pendiente") → botón "Guardar sin cobrar".
3. Se crea el pedido y la Comanda #1, que va al KDS.
4. Más productos después: abrir el pedido → "Agregar productos" → Comanda #2. Si ya estaba pagado, el sistema marca "pago parcial" con "Cobrar restante".
5. "Imprimir pedido" genera un ticket con cada transacción.

**Para llevar:** igual que el flujo anterior con Tipo "Para llevar" ("productos envueltos"); solo pide el nombre; se identifica en ticket, KDS y reportes.

**Domicilio tomado por el personal:**
1. Nuevo pedido → Tipo "Domicilio" → Servicio de entrega:
   - Domicilio propio → datos completos + costo de envío.
   - Plataforma externa → solo "ID de pedido de la plataforma".
2. Productos → Continuar → cobro ahora o después.
3. Para el repartidor: "Mostrar datos de envío" → Copiar; o menú "…" → Copiar pedido; o "…" → Contactar cliente (WhatsApp, solo si hay teléfono).

## 9. Textos de la interfaz

- "Crea y recibe pedidos de tus clientes. Aquí estarán los pedidos creados desde el punto de venta y los que hagan tus clientes a través del menú digital."
- "Pedido para consumir en el local, sin una mesa asignada." / "Productos envueltos." / "Servicio a domicilio propio o de terceros."
- "El pedido se guardará con pago pendiente."
- Formato del texto de "Copiar pedido" (con datos de ejemplo genéricos):

```
Nombre: Cliente de ejemplo
Celular: +000 00000000

Calle: Calle Falsa
Número: 123
Colonia: Centro
Referencias: Frente a la plaza

Productos: $22.50
Envío: $2.00
Descuento: -$2.50
Total: $24.50

Método de pago elegido: efectivo
Cliente pagará con: $30.00
```

## 10. Casos límite y requisitos

| # | Requisito |
|---|---|
| 1 | El estado de la caja y el método de pago seleccionados en pantalla siempre coinciden con el estado real que se envía al confirmar el cobro; "Cobrar" nunca queda sin efecto tras el primer toque. |
| 2 | Todos los controles del modal (botones y casillas) responden al primer toque en pantallas táctiles, sin necesidad de un segundo intento. |
| 3 | Si falta elegir el tipo de pedido, el mensaje de error aparece junto al selector correspondiente. |
| 4 | Al editar un pedido, el teléfono existente del cliente se precarga siempre. |
| 5 | El filtro de fecha del Panel de pedidos usa el mismo componente que el del dashboard de Inicio, y responde de forma consistente. |

## 11. Criterios de aceptación

- Dado el modal "Agrega un pedido" sin tipo elegido, cuando se pulsa "Continuar", entonces se bloquea y se muestra el error junto al selector de tipo.
- Dado un pedido "Domicilio propio", cuando se deja el costo de envío vacío, entonces el total muestra "Envío + $X" ("Por cotizar").
- Dado "Cobrar después", cuando se guarda, entonces el pedido queda con estado "Pago pendiente" y el botón del detalle dice "Cobrar restante".
- Dado un pedido de domicilio con teléfono, cuando se pulsa "Contactar cliente", entonces se abre WhatsApp; sin teléfono, el botón está desactivado.
- Dado "Copiar pedido", cuando se pulsa, entonces el texto copiado sigue exactamente el formato de §9.

## 12. Tareas

| ID | Tarea | Tipo | Agente | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M06-T01 | Migración: `orders.delivery_provider/external_order_id/customer_phone/delivery_address` | BD | db-architect | M | M04-T01 | Campos nulos permitidos; jsonb validado con zod en servidor |
| M06-T02 | Server action: crear/editar pedido de mostrador con validación de tipo obligatorio | Backend | general-purpose | M | M06-T01 | Devuelve error de campo específico, no genérico |
| M06-T03 | UI modal "Agrega un pedido" con selector de tipo y campos condicionales | Frontend | ui-caja | L | M06-T02 | Reproduce §7.2; error visible sin tipo |
| M06-T04 | UI paso de cobro con "Cobrar después" | Frontend | ui-caja | M | M06-T03 | Botón cambia a "Guardar sin cobrar" |
| M06-T05 | Acciones de detalle: Mostrar datos de envío, Copiar pedido, Contactar cliente | Frontend | general-purpose | M | M06-T02 | Formato de "Copiar pedido" exacto según §9 |
| M06-T06 | Filtro de fecha del panel de pedidos = mismo componente que Inicio | Frontend | reports-builder | S | — | Consistente entre ambas pantallas |
| M06-T07 | Tests: tipo obligatorio, cobrar después, copiar pedido | QA | test-writer | M | M06-T02..T05 | Vitest + Playwright |
| M06-T08 | QA en vivo del flujo §8 en `monky-qa` | QA | qa-e2e | M | M06-T03..T06 | Registrado en `app/TESTING.md` |

Basado en el relevamiento interno de funcionalidades del POS.
