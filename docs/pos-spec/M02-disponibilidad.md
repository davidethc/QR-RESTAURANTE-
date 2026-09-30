# M02 · Disponibilidad (agotados)

## Estado en Monky

Hoy `products.available` ya existe como interruptor booleano, pero es **por producto entero**: `toggleProductAvailable` (en `src/lib/actions/menu.ts`) apaga o prende todo el producto de una vez, sin distinguir variantes u opciones de personalización. Este módulo mueve el interruptor a un nivel más fino, una vez que existan `product_variants` y `modifier_options` (M01 §3).

## 1. Objetivo y alcance

**Entra:** interruptor Disponible/Agotado por variante de producto y por opción de personalización, pantalla única `/disponibilidad` con pestañas Todos / No disponibles, efecto instantáneo en POS, panel de mesas, KDS (indirecto) y carta pública/QR, tarjetas de "agotados" en el dashboard de Inicio.

**No entra:** disponibilidad por horario/franja (ya la cubren los `schedules` de M01 §3 vía categorías). La ejecución completa de disponibilidad por sucursal cuando exista multi-sucursal.

## 2. Dependencias

M01 (las variantes y opciones deben existir antes de poder marcarlas disponibles/agotadas).

## 3. Datos

**Ya existe:** `products.available` (booleano, por producto completo).

**A crear:**

| Entidad | Campos | Notas |
|---|---|---|
| `availability` | `restaurant_id` (o `branch_id` cuando exista multi-sucursal), `item_type` (`variant` \| `modifier_option`), `item_id`, `available bool default true` | Una fila por variante/opción, no por producto |

**Migración:** por cada producto con `available=false`, se marcan todas sus variantes actuales como no disponibles en la nueva tabla. `products.available` se conserva mientras tanto como caché calculado (¿al menos una variante disponible?) hasta decidir si se retira.

**Índices:** único en `(restaurant_id, item_type, item_id)`; índice por `(restaurant_id, available)` para el filtro "No disponibles".

## 4. Estados y transiciones

```
DISPONIBLE ──switch──▶ AGOTADO
AGOTADO ──switch──▶ DISPONIBLE
```

Toda variante u opción nueva nace disponible.

## 5. Reglas de negocio y cálculos

- El cambio de disponibilidad se refleja al instante en POS, carta pública y QR de mesa, vía tiempo real (Supabase Realtime).
- Una variante u opción agotada no se puede elegir en ningún flujo de creación de pedido (POS, mesero, cliente por QR, menú digital).
- Un producto con todas sus variantes agotadas aparece como agotado en la tarjeta de catálogo, aunque no se haya tocado manualmente ningún interruptor a nivel de producto.
- Los ítems agotados se resumen en tarjetas del dashboard de Inicio ("Productos agotados", "Personalizaciones agotadas").
- Pueden cambiar la disponibilidad: Dueño, Administrador y los tres roles operativos de piso (Mesero, Cajero, Cocinero).

## 6. Permisos por rol

Todos los roles operativos (Mesero, Cajero, Cocinero) y administrativos tienen acceso a `/disponibilidad`; es una de las pocas pantallas visibles para los tres roles de piso a la vez.

## 7. Pantallas

### 7.1 `/disponibilidad`

- Pestañas: Todos / No disponibles (N).
- Buscador.
- Tabla "Ítem | Estado": productos muestran imagen + "Producto - Variante" + categoría; opciones muestran el nombre de la opción + el grupo de personalización al que pertenece; etiqueta "Disponible" / "Desactivado" con switch; paginación "1 - N de M items".

## 8. Procesos paso a paso

- Antes de abrir el servicio del día, el equipo marca en Disponibilidad los productos u opciones que no hay hoy.
- Al marcar algo agotado, el cambio se refleja al instante en POS, carta y QR (verificable abriendo dos pestañas a la vez).

## 9. Textos de la interfaz

- Etiquetas de estado: "Disponible" / "Desactivado".
- Paginación: "1 - N de M items".

## 10. Casos límite y requisitos

| # | Requisito |
|---|---|
| 1 | Un producto con todas sus variantes agotadas se muestra como no elegible en el catálogo, aunque `products.available` no se haya tocado manualmente. |
| 2 | Todo cambio de disponibilidad se propaga por tiempo real a todos los dispositivos conectados, igual que los contadores de mesas. |

## 11. Criterios de aceptación

- Dado que se marca una variante como agotada, cuando un cliente abre la carta en otra pestaña, entonces esa variante aparece no seleccionable en menos de 10 segundos sin recargar.
- Dado un grupo de personalización con una opción agotada, cuando el personal arma un pedido, entonces esa opción no se puede sumar (aparece atenuada/deshabilitada).
- Dado el filtro "No disponibles", cuando se aplica, entonces solo lista variantes/opciones con `available=false`.

## 12. Tareas

| ID | Tarea | Tipo | Agente | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M02-T01 | Migración: tabla `availability` (variant \| modifier_option) + backfill desde `products.available` | BD | db-architect | M | M01-T02, M01-T03 | Backfill verificado; RLS por restaurante |
| M02-T02 | RPC/función para calcular disponibilidad efectiva de un producto (al menos 1 variante disponible) | BD | db-architect | S | M02-T01 | Usada por catálogo/carta para atenuar tarjetas |
| M02-T03 | Server action: alternar disponibilidad de variante/opción con validación de rol | Backend | general-purpose | S | M02-T01 | Solo roles permitidos pueden escribir |
| M02-T04 | UI `/disponibilidad` (pestañas, buscador, tabla, switch, paginación) | Frontend | general-purpose | M | M02-T03 | Reproduce §7.1 |
| M02-T05 | Conectar disponibilidad a tiempo real (Supabase Realtime) en POS, carta y QR | Frontend | general-purpose | M | M02-T03 | Cambio visible sin recargar en menos de 10 s |
| M02-T06 | Tarjetas de agotados en Inicio (dashboard) | Frontend | reports-builder | S | M02-T01 | Coincide con §8 |
| M02-T07 | Tests: no se puede seleccionar un ítem agotado en ningún flujo de pedido | QA | test-writer | M | M02-T04, M02-T05 | Playwright cubre POS, mesero y cliente QR |

Basado en el relevamiento interno de funcionalidades del POS.
