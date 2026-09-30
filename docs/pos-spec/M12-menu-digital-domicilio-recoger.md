# M12 · Menú digital: domicilio y para recoger

## Estado en Monky

**Nuevo.** Confirmado leyendo el esquema real: Monky no tiene carta pública para domicilio/recoger (solo la carta de cliente por QR de mesa, M11), ni tablas de configuración de menú digital, envío o métodos de pago por canal. También se confirma que `restaurants` es hoy una sola entidad por negocio (no existe todavía una tabla `branches` separada) — el multi-sucursal es prioridad futura (ver roadmap del proyecto), así que este módulo se construye sobre `restaurants` y deja el punto de extensión para cuando exista `branches`.

`orders` (la comanda de cocina) no tiene ningún campo de cliente, dirección, teléfono, método de pago preferido ni confirmación — todos esos datos deben vivir en columnas nuevas, no se reutiliza nada existente para eso. `restaurants` ya tiene `slug`, `timezone`, `opening_hours` y `phone`, que sí se reutilizan para el dominio público y los horarios.

Hay que construir el dominio público, el checkout, el envío por WhatsApp, la activación/pausa del menú digital, y las secciones de configuración asociadas (métodos de pago, tiempos, horarios, envíos, WhatsApp).

## 1. Objetivo y alcance

**Entra:** carta pública en un dominio o ruta propia, selector A domicilio / Para recoger, checkout con datos del cliente, envío del pedido por WhatsApp (mensaje prellenado), creación del pedido en el panel como "Nuevo", asistente de activación, pausa temporal, página de enlace único para cuando existan varias sucursales, configuración de métodos de pago/tiempos/horarios/envíos/WhatsApp.

**NO entra:** promociones (M13, se muestran aquí pero se definen allá), disponibilidad (M02), mesa por QR (M11, es un flujo separado dentro del mismo dominio de menú digital).

## 2. Dependencias

M01 (catálogo), M02 (disponibilidad), M06 (mismo modelo de `orders`, con un tipo de servicio nuevo `delivery`\|`pickup`), M13 (promociones, para mostrarlas en la carta).

## 3. Datos

**A crear:**

| Entidad | Campos | Notas |
|---|---|---|
| `restaurants` (columnas nuevas) | `digital_menu_status` (`inactive`\|`active`\|`paused`), `paused_until` (timestamp, null = indefinido/"Hoy"), `whatsapp_number`, `whatsapp_monthly_volume` (enum de rangos) | Reutiliza `slug` ya existente para el dominio público |
| `delivery_settings` | `restaurant_id`, `shipping_cost_type` (`quote`\|`distance`, MVP solo `quote`), `free_shipping_enabled`, `free_shipping_min_amount`, `min_purchase_enabled`, `min_purchase_amount`, `delivery_time_min`, `delivery_time_max`, `pickup_time` | — |
| `payment_method_settings` | `restaurant_id`, `channel` (`delivery`\|`pickup`), `cash_enabled`, `card_enabled`, `transfer_enabled`, `bank_holder`, `bank_name`, `bank_account`, `bank_card_number` | Solo mostrar "Datos bancarios" si `transfer_enabled` |
| `orders` (columnas nuevas) | `service_type` (`table`\|`delivery`\|`pickup`), `customer_name`, `customer_phone`, `delivery_address`, `preferred_payment_method`, `pays_with_amount`, `confirmed_at` (timestamp nullable) | Ninguno de estos campos existe hoy en `orders`; `confirmed_at` evita pedidos "fantasma" que nunca se confirman (ver §10) |

**Índices:** `orders(restaurant_id, confirmed_at)` para el contador de "N pedidos sin revisar".

## 4. Estados y transiciones

**Menú digital:**

```
INACTIVO ──Activar (asistente)──▶ ACTIVO ⇄ PAUSADO (15/30/45 min, 1h, 2h, Hoy o Personalizada; o Reactivar a mano)
```

Fuera de horario, el cliente ve un aviso de próxima apertura con día y hora.

**Pedido en línea:**

```
CREADO (por el cliente, "Nuevo") ──cliente envía el WhatsApp / confirma en el sistema──▶ CONFIRMADO
CREADO ──vence sin confirmar (ventana de tiempo configurable)──▶ EXPIRADO (no se procesa, no cuenta en reportes)
```

Monky confirma el pedido dentro del sistema, sin depender únicamente de que el cliente envíe el mensaje de WhatsApp.

## 5. Reglas de negocio y cálculos

- Envío gratis si el subtotal alcanza un mínimo configurado, mostrando cuánto falta para alcanzarlo.
- Compra mínima configurable para habilitar el envío a domicilio, con un aviso claro si no se alcanza.
- Tiempos mostrados: domicilio mínimo–máximo (25–45 min por defecto) y recoger (15 min por defecto), contados desde que el cliente hace su pedido.
- Tipo de costo de envío por defecto: "Por cotizar" (el restaurante lo agrega manualmente al pedido, ver M06/M07).
- Total mostrado al cliente mientras el envío no está definido: monto de productos más "+ envío".
- Métodos de pago del menú digital por defecto: solo Efectivo activo (tarjeta y transferencia apagadas).
- En efectivo, el checkout pide la cantidad con la que pagará el cliente → se guarda en `orders.pays_with_amount` y precarga el cobro (M07).
- En transferencia, se muestran los datos bancarios con botones para copiar cada dato.
- Al llegar al panel, el pedido se crea como "Nuevo" con "Pago pendiente" y el costo de envío pendiente de definir; el personal lo abre (pasa a "Revisado"), revisa datos y método preferido, agrega el costo de envío (recalcula el total), prepara (la comanda ya está en el KDS marcada como originada en el menú digital) y cobra cuando llega el dinero, con el método preferido precargado.
- El pedido debe confirmarse dentro del sistema, con estados visibles para el cliente (creado, confirmado, en preparación...) y vencimiento de los no confirmados tras un tiempo configurable.

## 6. Permisos por rol

Configuración del menú digital: Dueño, Administrador, Gestor de Sucursal. Ver pedidos entrantes: Dueño, Administrador, Cajero (Panel de pedidos, M06).

## 7. Pantallas

### 7.1 Carta pública

- Encabezado: logo, nombre del negocio, alias de sucursal (si aplica); accesos a horario y compartir; selector A domicilio | Para recoger; datos del modo elegido (tiempo de envío y costo, o tiempo de recolección).
- Banner de promociones cuando existan (M13).
- Catálogo: categorías con buscador; tarjeta de producto con nombre, descripción, precio (con precio tachado y etiqueta de descuento si aplica) y botón para agregar.
- Ficha del producto: nombre, descripción, descuento si aplica, opciones obligatorias, personalizaciones con límite de selección, comentarios, selector de cantidad, botón para agregar con el subtotal calculado.
- Barra inferior: invitación a agregar productos, luego acceso al pedido con el conteo de productos.
- Carrito: líneas editables (con precio tachado si hay descuento, borrar, cantidad), comentarios generales, botón para continuar.
- Estados de la carta:
  - Pausada: aviso de que las operaciones están pausadas temporalmente, indicando cuándo se reactiva, y que solo se puede ver el menú.
  - Fuera de horario: aviso de la próxima apertura, indicando que solo se puede ver el menú.

### 7.2 Datos del cliente

- Nombre, número telefónico.
- Solo domicilio: compartir ubicación (GPS, recomendado para un envío más rápido) y dirección (colonia, calle, número, entre calles opcional, referencias opcional).
- Método de pago (los activos del canal): efectivo pide la cantidad con la que pagará; transferencia muestra los datos bancarios con botón para copiar cada uno.
- Resumen: productos, costo de envío ("Por cotizar"), total con el envío pendiente de sumar.
- Mensajes de envío gratis y compra mínima cuando corresponda.
- Validación: bloqueo si no se eligió un método de pago.
- Aviso legal de aceptación de términos y condiciones al enviar el pedido por WhatsApp.

### 7.3 Página de enlace único multi-sucursal

Página tipo "link in bio": logo, nombre del negocio, texto invitando a pedir o consultar precios, menús, horarios y ubicaciones; una tarjeta por sucursal con su alias, dirección, y acceso a "Hacer pedido" o aviso de que el menú digital no está disponible.

### 7.4 Configuración del menú digital (asistente y pestañas admin)

- Sin activar: invitación a automatizar los pedidos con el menú digital, explicando que el negocio recibe los pedidos en el panel y por WhatsApp.
- **Asistente de activación**, con vista previa del resultado:
  1. Número de WhatsApp para recibir pedidos y volumen mensual aproximado de pedidos a domicilio (sin contar plataformas de reparto externas) → Continuar.
  2. Enlace de menú digital generado a partir del slug del restaurante → Activar menú digital.
- Pestaña Domicilio/Para recoger: enlace de menú (copiar, ver/descargar QR, ver menú); guía de cómo compartirlo (mensaje automático de WhatsApp Business, con opción de copiarlo); enlace multi-sucursal (copiar, ver sucursales).
- Pestaña Mesas: comparte el mismo módulo de configuración de menú digital, pero el flujo operativo está documentado en M11/M03.

### 7.5 Secciones de configuración asociadas

- **Métodos de pago**: Domicilio y Para recoger: Efectivo / Tarjeta / Transferencia; con Transferencia aparecen los datos bancarios (titular, banco, cuenta, tarjeta).
- **Tiempos de entrega**: domicilio mínimo/máximo (minutos), para recoger (minutos), contados desde que el cliente hace su pedido.
- **Horarios**: aviso de que el horario permanece abierto las 24 horas hasta que se agregue un turno (comparte modelo con M01).
- **WhatsApp vinculado**: número de solo lectura con opción de cambiarlo; explicación de que ahí llegan los pedidos del menú digital.
- **Costos de envío** (M15, referenciado aquí): tipo, envío gratis, compra mínima.

## 8. Procesos paso a paso

**Pedido en línea: domicilio o recoger:**

1. Cliente: abre la carta pública → elige A domicilio o Para recoger; agrega productos → accede al carrito → Continuar.
2. Datos: nombre, teléfono; ubicación y dirección (solo domicilio); método de pago; resumen con envío "Por cotizar" y total pendiente de sumar el envío.
3. Enviar pedido por WhatsApp: se crea el pedido en el panel como "Nuevo" con "Pago pendiente" y el envío pendiente de definir; el navegador abre WhatsApp con el mensaje prellenado dirigido al número del negocio; el cliente debe enviarlo.
4. Restaurante: ve el contador de pedidos sin revisar → abre el pedido (deja de ser "Nuevo") → revisa datos y método preferido → agrega el costo de envío (recalcula el total) → prepara (comanda ya en el KDS marcada como originada en el menú digital) → cuando llega el dinero, cobra con el método preferido precargado.
5. Monky confirma el pedido dentro del sistema (no depende del envío real de WhatsApp) y vence los no confirmados tras un tiempo configurable.

**Pausas:**

- Pausar menú digital (sin pedidos en línea; mesas y POS siguen funcionando): duración de 15/30/45 min, 1h, 2h, Hoy o personalizada (desde y hasta). Barra visible indicando hasta cuándo está pausado, con opción de reactivar.

## 9. Textos de la interfaz

Redactar textos propios de Monky con el mismo propósito, en español neutro y tono cálido y breve. Ejemplos de referencia (a redactar, no copiar literal):

- Explicación de qué hace el menú digital al activarlo.
- Indicadores de tiempo de envío/recolección en el encabezado de la carta.
- Aviso de que falta elegir un método de pago.
- Aviso legal de aceptación de términos al enviar por WhatsApp.
- Mensaje de cuánto falta para envío gratis.
- Mensaje de compra mínima no alcanzada.
- Aviso de pausa temporal indicando cuándo se reactiva.
- Aviso de fuera de horario indicando la próxima apertura.
- Mensaje de WhatsApp del pedido: estructura propia de Monky con número de pedido, datos del cliente, dirección (solo domicilio), resumen de productos y total, método de pago elegido, y el detalle de los productos pedidos con sus variantes. Usar datos de ejemplo genéricos (no reutilizar nombres ni teléfonos reales) al documentar la plantilla.
- Mensaje automático de WhatsApp Business invitando al cliente a usar el enlace del menú, explicando que agiliza la preparación del pedido.

## 10. Casos límite y requisitos

| # | Situación | Requisito de Monky |
|---|---|---|
| 1 | Pedido enviado por WhatsApp | Se confirma dentro del sistema y vence tras un tiempo configurable si el cliente no llega a enviarlo, evitando pedidos fantasma |
| 2 | Seguimiento del pedido para el cliente | Estados visibles mínimos: Nuevo → Confirmado → En preparación → Listo/Entregado |
| 3 | Textos de la interfaz | Se revisan antes de publicar para evitar errores de ortografía o redacción |

## 11. Criterios de aceptación

- Dado un pedido creado desde el menú digital sin confirmar, cuando pasa el tiempo de vencimiento configurado, entonces queda como Expirado y no aparece en reportes de venta.
- Dado el checkout de domicilio sin método de pago elegido, cuando se intenta continuar, entonces se bloquea con un aviso claro.
- Dado el subtotal por debajo de la compra mínima, cuando se intenta continuar en domicilio, entonces se muestra el aviso de compra mínima y se bloquea.
- Dado el menú digital pausado "Hoy", cuando un cliente entra, entonces ve el aviso de pausa y no puede agregar productos al carrito.
- Dado un pedido nuevo del menú digital, cuando el personal lo abre por primera vez, entonces pasa de "Nuevo" a revisado y el contador de pendientes baja.

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M12-T01 | Migración: `digital_menu_status` y columnas relacionadas en `restaurants`, `delivery_settings`, `payment_method_settings`, columnas nuevas en `orders` (`service_type`, `customer_name`, `customer_phone`, `delivery_address`, `preferred_payment_method`, `pays_with_amount`, `confirmed_at`) | BD | db-architect | L | M06-T01 | Migración aplicada; defaults de §5 aplicados |
| M12-T02 | RPC: crear pedido desde checkout público (delivery/pickup) con validación de compra mínima y método de pago | BD | db-architect | L | M12-T01 | Rechaza si no cumple compra mínima o falta método |
| M12-T03 | RPC: confirmar pedido dentro del sistema + job de vencimiento de no confirmados | BD | db-architect | M | M12-T02 | Job programado (pg_cron o similar) marca Expirado |
| M12-T04 | Server action: generar mensaje de WhatsApp prellenado con textos propios de Monky | Backend | general-purpose | M | M12-T02 | Texto revisado contra la plantilla propia |
| M12-T05 | UI carta pública con selector domicilio/recoger, catálogo, ficha de producto, carrito | Frontend | general-purpose | L | M12-T02, M01-T05 | Reproduce §7.1 con textos propios de Monky |
| M12-T06 | UI checkout con GPS, dirección, métodos de pago, resumen | Frontend | general-purpose | L | M12-T02 | Reproduce §7.2 |
| M12-T07 | UI página de enlace único multi-sucursal | Frontend | general-purpose | M | M12-T01 | Reproduce §7.3 |
| M12-T08 | UI asistente de activación + pestañas admin (enlace, QR, WhatsApp Business) | Frontend | general-purpose | L | M12-T01 | Reproduce §7.4 |
| M12-T09 | UI configuración: métodos de pago, tiempos de entrega, WhatsApp vinculado | Frontend | general-purpose | M | M12-T01 | Reproduce §7.5 |
| M12-T10 | UI pausar/reactivar menú digital (duración predefinida o personalizada) | Frontend | general-purpose | M | M12-T01 | Reproduce §8 con textos propios de Monky |
| M12-T11 | Estados de seguimiento visibles para el cliente | Frontend | general-purpose | M | M12-T03 | Nuevo → Confirmado → En preparación → Listo/Entregado |
| M12-T12 | Tests: compra mínima, envío gratis, vencimiento de no confirmados, pausa | QA | test-writer | L | M12-T02, M12-T03 | Suite Vitest + SQL |
| M12-T13 | QA en vivo del flujo completo en `monky-qa` | QA | qa-e2e | L | M12-T05..T10 | Registrado en `app/TESTING.md` |

Basado en el relevamiento interno de funcionalidades del POS.
