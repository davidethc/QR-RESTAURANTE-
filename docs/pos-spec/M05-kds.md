# M05 · KDS (comandas digitales de cocina)

## Estado en Monky

Ya existe `/kitchen`, que consume `orders`/`order_items` directamente y usa las RPC `accept_order`, `accept_and_prepare_order`, `start_order_preparing`, `mark_order_ready`, `mark_order_delivered`, `reject_order`, `cancel_order` (los server actions equivalentes en `src/lib/actions/orders.ts` son `acceptOrder`, `rejectOrder`, `markReady`, `markDelivered`). Hoy el contador de la pantalla cuenta filas de `orders`, no rondas dentro de un pedido, porque cada ronda ya es un `orders` distinto ligado a la misma `table_sessions` (ver M04, Estado en Monky). Falta: cronómetro con colores por tiempo transcurrido, un contador que refleje explícitamente comandas/rondas en curso (no pedidos completos), modo pantalla completa robusto, historial con "Devolver a preparación", y una activación explícita del módulo.

Si M04 adopta la tabla `tickets` propuesta, el KDS cuenta filas de `tickets` pendientes; si en cambio se mantiene el modelo de "varios `orders` por sesión", el KDS debe contar `orders` en curso por sesión de forma que una mesa con dos rondas abiertas muestre "2 comandas por preparar", no "1 pedido". Esa decisión depende de M04 y debe resolverse antes de construir este módulo.

## 1. Objetivo y alcance

**Entra:** cola de comandas "por preparar" en tiempo real, tarjeta por comanda con cronómetro de color, completar/devolver comanda, historial de completadas, modo pantalla completa para un monitor fijo.

**No entra:** creación de comandas (ocurre en M04/M06, el KDS solo las consume). Impresión física.

## 2. Dependencias

M04 (pedido de mesa y comandas), M06 (pedidos de mostrador), tiempo real vía Supabase Realtime.

## 3. Datos

Usa el agrupador de ronda que defina M04 (`tickets.kitchen_status` `pending`|`completed`, `completed_at`, `is_new`, o su equivalente sobre `orders` en curso).

**A agregar (opcional, para colores exactos):**

| Campo | Notas |
|---|---|
| Umbrales de aviso/alerta en minutos (a nivel restaurante, en configuración) | Sin valores de referencia previos; se sugiere verde 0–10 min, amarillo 10–20 min, rojo más de 20 min, con tope visual "+99 mins" |

## 4. Estados y transiciones

```
POR PREPARAR (con cronómetro) ──Completar comanda──▶ COMPLETADA (va al historial)
COMPLETADA ──Devolver a preparación──▶ POR PREPARAR
```

Colores del cronómetro: verde (recién creada) → amarillo (intermedio) → rojo (muy demorada, tope "+99 mins"). Los umbrales por defecto se definen en configuración del restaurante y quedan documentados en la migración correspondiente.

## 5. Reglas de negocio y cálculos

- El contador de la pantalla cuenta comandas/rondas, no pedidos: un pedido de mesa puede tener varias rondas en distintos momentos y cada una cuenta por separado.
- "Completar comanda" saca la tarjeta de la cola al instante, sin pedir confirmación.
- "Devolver a preparación" se hace desde el historial, para corregir un error.
- El modo pantalla completa usa la Fullscreen API estándar con manejo de los eventos `fullscreenchange`/`fullscreenerror`, de forma que salir (por botón o por Esc) nunca deja controles inutilizables.
- Las comandas se agrupan y muestran en orden de llegada.

## 6. Permisos por rol

Dueño, Administrador y Cocinero. Mesero es redirigido a Mesas y Cajero a POS si intentan entrar a `/kitchen`.

## 7. Pantallas

### 7.1 `/kitchen`

- **Sin activar:** breve explicación de qué es el KDS ("gestiona las comandas de cocina desde uno o varios dispositivos en tiempo real") y botón Activar.
- **Activo:** Ver historial · Ver en pantalla completa · filtro Hoy · contador "N comandas por preparar" · tarjetas en fila · Completar comanda.
- **Tarjeta de comanda** (en orden de llegada): folio · número de comanda · tipo (En el local / Mesa N / Domicilio) · cliente o "Sin nombre" · autor (mesero o menú digital) · hora · cronómetro con color · líneas "1 x Producto - Variante" con opciones y notas resaltadas.
- **Historial** (`/kitchen/historial`): tarjetas completadas con "Devolver a preparación", paginación.

## 8. Procesos paso a paso

1. El cocinero entra con su PIN → Comandas digitales → ve "N comandas por preparar".
2. Las tarjetas aparecen en orden de llegada (estructura de §7.1).
3. "Completar comanda" saca la tarjeta de la cola al momento, sin confirmar.
4. Si hubo un error: Ver historial → "Devolver a preparación".
5. Se puede activar pantalla completa para un monitor fijo.

## 9. Textos de la interfaz

- "Comandas digitales: gestiona las comandas de cocina desde uno o varios dispositivos en tiempo real."
- "N comandas por preparar."
- "Tomado por <mesero | menú digital>."
- "Ver en pantalla completa" / "Salir de pantalla completa".

## 10. Casos límite y requisitos

| # | Requisito |
|---|---|
| 1 | El contador siempre refleja filas de comandas/rondas pendientes, nunca pedidos distintos; un pedido con dos rondas pendientes cuenta como 2. |
| 2 | El botón de salir de pantalla completa sigue funcionando aunque el navegador cambie el estado por su cuenta (por ejemplo, con la tecla Esc). |

## 11. Criterios de aceptación

- Dado un pedido con 2 comandas pendientes, cuando se ve el contador, entonces marca "2 comandas por preparar" (no "1 pedido").
- Dado que se crea una comanda desde el mesero o desde el QR del cliente, cuando pasan menos de 8 segundos, entonces la tarjeta aparece en el KDS sin recargar.
- Dado que se pulsa "Completar comanda", cuando se confirma la acción, entonces desaparece de la cola inmediatamente y aparece en el historial.
- Dado el modo pantalla completa, cuando se sale con Esc o con el botón de salir, entonces todos los controles siguen respondiendo normalmente.

## 12. Tareas

| ID | Tarea | Tipo | Agente | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M05-T01 | Configuración de umbrales de color del cronómetro (tabla o columna en `restaurants`) | BD | db-architect | S | M04-T01 | Valores por defecto documentados |
| M05-T02 | Adaptar `/kitchen` para contar comandas/rondas en vez de pedidos completos | Frontend | general-purpose | M | M04-T01 | Contador correcto verificado con 2+ rondas del mismo pedido |
| M05-T03 | Tarjeta de comanda con cronómetro de color y notas resaltadas | Frontend | general-purpose | M | M05-T01 | Reproduce el diseño de §7.1 |
| M05-T04 | Historial de comandas completadas + "Devolver a preparación" | Frontend | general-purpose | M | M05-T02 | Ruta `/kitchen/historial` |
| M05-T05 | Modo pantalla completa robusto (Fullscreen API con manejo de errores) | Frontend | general-purpose | S | M05-T02 | Verificado manualmente en QA |
| M05-T06 | Pantalla "Sin activar" con activación explícita del módulo | Frontend | general-purpose | S | M05-T02 | Texto de §9 |
| M05-T07 | Tests E2E: contador por comandas, completar/devolver, tiempo real | QA | test-writer | M | M05-T02..T04 | Playwright + Vitest |
| M05-T08 | QA en vivo del flujo §8 en `monky-qa` | QA | qa-e2e | S | M05-T02..T06 | Registrado en `app/TESTING.md` |

Basado en el relevamiento interno de funcionalidades del POS.
