# M11 · Cliente por QR de mesa

## Estado en Monky

**Adaptar.** Confirmado leyendo el esquema real:

- `tables.qr_token` ya existe: un token aleatorio y no adivinable (mucho más seguro que un identificador numérico secuencial) — no se toca, se mantiene.
- `waiter_calls.type` ya existe con enum `WAITER`\|`BILL` — "Llamar a mesero" y "Pedir la cuenta" ya están modelados como eventos distintos (ver M09).
- `table_sessions.customer_label` ya existe: es el campo natural para guardar el "Nombre para la mesa" que el cliente escribe al abrir, no hace falta agregarlo a `orders`.
- `orders` (la comanda de cocina) **no tiene** ningún campo de nombre de cliente ni de origen (`created_by`/`source`); si se necesita distinguir una comanda creada desde el menú digital de una creada por el mesero, ese campo es nuevo y debe agregarse a `orders`, no asumirse existente.

Falta: pedir "Nombre para la mesa" al abrir (usando `table_sessions.customer_label`), "Llamar a mesero", "Ver cuenta"/"Cerrar cuenta" desde el propio cliente, y una configuración explícita de si el pedido del cliente pasa directo a cocina o requiere aprobación del mesero.

## 1. Objetivo y alcance

**Entra:** abrir mesa desde el QR con nombre, ver la carta y pedir (crea comandas sobre el pedido de M04), llamar al mesero, ver cuenta y cerrar cuenta (solicitar el cobro), límites explícitos del cliente (no elige método de pago, no deja propina, no divide cuenta, no paga en línea).

**NO entra:** el cobro (lo hace el mesero, M07), el menú digital de domicilio/recoger (M12, dominio distinto), la disponibilidad (M02, ya resuelta ahí).

## 2. Dependencias

M04 (pedido de mesa, comandas), M09 (avisos al mesero en tiempo real), M03 (mesa y zona).

## 3. Datos

Reutiliza `orders`/`order_items` de M04 para las comandas del cliente. La mesa ya tiene `qr_token` en Monky y la sesión de mesa ya tiene `customer_label`.

**A agregar:**

| Campo | Tabla | Notas |
|---|---|---|
| Marca de origen de la comanda (ej. `orders.source` o similar) | `orders` | Nuevo; permite distinguir comandas creadas desde el menú digital de las creadas por personal |
| Configuración de aprobación previa | `restaurants` (configuración a nivel de restaurante) | Si el pedido del cliente pasa directo a cocina o requiere aprobación del mesero — decisión de producto explícita, no un comportamiento fijo |

## 4. Estados y transiciones

Ver M04 para el estado de mesa (Disponible/Activa/Cuenta). Desde el lado del cliente:

```
Escanea QR ──Nombre para la mesa + Abrir mesa──▶ Mesa ACTIVA (o se une a una ya activa si otro comensal la abrió)
ACTIVA ──Confirmar N productos──▶ nueva comanda (directa a cocina o pendiente de aprobación, según configuración)
ACTIVA ──Llamar a mesero──▶ aviso al mesero (M09), sin cambio de estado de mesa
ACTIVA ──Cerrar cuenta──▶ ACTIVA + "solicitando cuenta" (el cliente ya no puede agregar productos)
```

## 5. Reglas de negocio y cálculos

- El cliente no elige método de pago, no deja propina, no divide la cuenta y no paga en línea — el cobro siempre lo hace el mesero (M07).
- Token de mesa: aleatorio, largo, no adivinable (ya resuelto en Monky con `qr_token`).
- Monky permite configurar explícitamente si el pedido del cliente pasa directo a cocina o requiere que el mesero lo apruebe primero, como una opción de configuración del restaurante, no un comportamiento fijo.
- Límite de llamadas al mesero (anti-spam): cooldown configurable entre llamadas de la misma mesa (sugerido: 1–2 minutos), a definir con el equipo de producto.
- Precio de línea y personalización: iguales a M01/M04.

## 6. Permisos por rol

No aplica rol de sistema: el cliente entra sin cuenta, solo con el `qr_token` de la URL.

## 7. Pantallas

### 7.1 Abrir mesa

Pantalla de "Nueva mesa" que pide el nombre para identificar la mesa (con un ejemplo genérico de nombre) y un botón para abrirla, mostrando el número de mesa y la zona. Luego lleva a la carta con la sesión de mesa activa.

### 7.2 Carta con mesa abierta

- Encabezado con el nombre indicado por el cliente, más accesos a "Ver cuenta" y "Llamar a mesero".
- Pedir: barra de confirmación con el número de productos seleccionados → modal de confirmación explicando que al confirmar se agregan a la cuenta de la mesa (con cantidades editables) → confirmación final indicando que los productos ya están en preparación.
- Llamar a mesero: modal explicando que el mesero recibirá una alerta para acercarse a la mesa → confirmación de que se llamó exitosamente.

### 7.3 Ver cuenta

Historial por ronda con hora y líneas de producto, más el total a pagar. Botón "Cerrar cuenta" que avisa que la cuenta ya fue solicitada y que la mesa se cerrará una vez realizado el pago (bloquea nuevos pedidos desde ese momento).

## 8. Procesos paso a paso

**Servicio en mesa pedido por el cliente (QR):**

1. El cliente escanea el QR de la mesa → pantalla de "Nueva mesa" pidiendo el nombre para identificarla → Abrir mesa.
2. Ve la carta con su nombre en el encabezado, más "Ver cuenta" y "Llamar a mesero".
3. Pide: elige productos → confirma la cantidad → modal de confirmación con cantidades editables → confirma → mensaje de que los productos ya están en preparación.
4. En menos de 5 segundos, el mesero recibe el aviso de nueva comanda (M09), el contador sube, aparece un indicador en la mesa y la comanda sale identificada como originada por el menú digital. Según la configuración de este módulo, la cocina la recibe directo o queda pendiente de aprobación del mesero.
5. Llamar a mesero: modal → confirmar → aviso de éxito; el mesero recibe la notificación en pocos segundos (M09).
6. Pedir la cuenta: Ver cuenta → historial con hora de cada ronda, ítems y total a pagar → Cerrar cuenta → aviso de que la cuenta ya fue solicitada; el cliente ya no puede agregar productos; el mesero recibe la notificación y el contador de "solicitando mesero" vuelve a 0.
7. El mesero cobra igual que en M04/M07.
8. Límites del cliente: no elige método de pago, no deja propina, no divide la cuenta y no paga en línea.

## 9. Textos de la interfaz

Redactar textos propios de Monky con el mismo propósito, en español neutro y tono cálido y breve. Ejemplos de referencia (a redactar, no copiar literal):

- Título de la pantalla para abrir mesa, con campo de nombre y ejemplo genérico.
- Encabezado de la carta mostrando el nombre indicado por el cliente.
- Barra de confirmación con el número de productos.
- Modal de confirmación de pedido explicando que se agregará a la cuenta.
- Mensaje de éxito tras confirmar el pedido.
- Modal de llamada al mesero y su confirmación de éxito.
- Historial de cuenta con hora de apertura y total a pagar.
- Aviso de cuenta solicitada explicando que la mesa se cerrará tras el pago.

## 10. Casos límite y requisitos

| # | Situación | Requisito de Monky |
|---|---|---|
| 1 | Identificador de mesa en la URL del QR | Aleatorio y no adivinable mediante `qr_token`; no se reemplaza por un id numérico secuencial |
| 2 | Aprobación de pedidos del cliente antes de cocina | Configurable por restaurante: directo a cocina o con aprobación explícita del mesero, según decisión de producto |
| 3 | Llamadas repetidas al mesero | Cooldown anti-spam entre llamadas de una misma mesa |

## 11. Criterios de aceptación

- Dado un QR de mesa sin abrir, cuando el cliente lo escanea, entonces se le pide un nombre para identificar la mesa antes de ver la carta.
- Dado que el cliente confirma un pedido, cuando se envía, entonces se crea una comanda marcada como originada en el menú digital y el mesero recibe el aviso en menos de 5 segundos.
- Dado que el cliente pulsa "Cerrar cuenta", cuando se confirma, entonces no puede seguir agregando productos y el mesero recibe la notificación con el contador de "solicitando mesero" en 0.
- Dado el límite de llamadas al mesero, cuando se llama dos veces seguidas en menos del cooldown configurado, entonces la segunda llamada se bloquea o se agrupa visualmente.
- Dado el flujo completo, cuando se revisa la pantalla del cliente, entonces no existe ningún control de método de pago, propina o división de cuenta.

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M11-T01 | Migración: marca de origen en `orders`, configuración de aprobación previa en `restaurants` | BD | db-architect | S | M04-T01 | Migración aplicada |
| M11-T02 | RPC: abrir mesa desde QR con nombre (usa `table_sessions.customer_label`, crea o une al pedido activo de esa mesa) | BD | db-architect | M | M11-T01, M04-T02 | Si la mesa ya está activa, no duplica el pedido |
| M11-T03 | RPC: confirmar pedido del cliente (crea comanda marcada como menú digital, directo o pendiente según configuración) | BD | db-architect | M | M11-T02 | Respeta la configuración de aprobación |
| M11-T04 | RPC: llamar a mesero / cerrar cuenta con cooldown anti-spam (usa `waiter_calls.type` ya existente) | BD | db-architect | M | M11-T01 | Cooldown verificado |
| M11-T05 | UI pantalla "Abrir mesa" con nombre | Frontend | general-purpose | S | M11-T02 | Reproduce §7.1 |
| M11-T06 | UI carta con nombre del cliente, Ver cuenta, Llamar a mesero, modal de confirmación | Frontend | general-purpose | L | M11-T03, M11-T04 | Reproduce §7.2 con textos propios de Monky |
| M11-T07 | UI Ver cuenta / Cerrar cuenta | Frontend | general-purpose | M | M11-T04 | Reproduce §7.3 |
| M11-T08 | Conectar avisos al mesero vía M09 | Frontend | general-purpose | S | M09-T02, M11-T03, M11-T04 | Latencia <5s verificada |
| M11-T09 | Tests E2E: flujo completo del cliente (abrir, pedir, llamar, cerrar cuenta) | QA | test-writer | L | M11-T05..T08 | Playwright cubre el flujo completo |
| M11-T10 | QA en vivo en `monky-qa` con dispositivo real escaneando el QR | QA | qa-e2e | M | M11-T05..T08 | Registrado en `app/TESTING.md` |

Basado en el relevamiento interno de funcionalidades del POS.
