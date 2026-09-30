# M09 · Tiempo real y notificaciones

## Estado en Monky

**Existe.** Confirmado leyendo el esquema y las tablas reales: Monky ya usa Supabase Realtime sobre `orders`, `tables` y `waiter_calls`. En particular:

- `waiter_calls` **ya tiene** la columna `type` con enum `WAITER`\|`BILL` — distingue "Llamar a mesero" de "Pedir la cuenta" desde ya; no es un campo por agregar.
- `waiter_calls` ya tiene `status`, `handled_at`, `handled_by` — la lógica de "atendido" ya existe a nivel de datos.
- `tables` y `table_sessions` ya reflejan el estado operativo consumido por el panel de mesas.

Lo que sí es nuevo o por afinar: los toasts y contadores exactos por evento, la latencia objetivo medida end-to-end, la sincronización de contadores entre todos los dispositivos abiertos (no solo el que originó el evento), y sonido opcional por evento.

## 1. Objetivo y alcance

**Entra:** canal de eventos en tiempo real para Panel de mesas, KDS y Panel de pedidos; toasts con textos propios de Monky; contadores sincronizados (mesas solicitando cuenta, solicitando mesero, comandas sin revisar, mesas activas, comandas por preparar, pedidos sin revisar); sonido opcional por evento.

**NO entra:** la lógica de negocio de cada evento (abrir mesa, llamar mesero, etc. — están en M04/M05/M11), solo la propagación y su presentación.

## 2. Dependencias

M04, M05, M06, M11 (fuentes de los eventos).

## 3. Datos

No requiere tablas nuevas para lo esencial; usa Supabase Realtime sobre cambios en `orders`, `waiter_calls` y `tables` (ya existentes en Monky).

| Entidad | Estado | Notas |
|---|---|---|
| `waiter_calls.type` (`WAITER`\|`BILL`) | Ya existe | Cubre "Llamar a mesero" y "Pedir la cuenta" como dos tipos distintos |
| `waiter_calls.handled_at`/`handled_by` | Ya existe | Base de datos para "marcar como atendido" |

## 4. Estados y transiciones

No aplica una máquina de estados propia; este módulo es transporte de eventos sobre los estados definidos en M04 (mesa) y M05 (comanda).

## 5. Reglas de negocio y cálculos

- Todos los contadores se sincronizan entre dispositivos, incluso al cobrar o cancelar, en todos los dispositivos con esa pantalla abierta para la misma sucursal.
- Latencia objetivo: menos de 5 segundos desde el evento origen hasta que aparece el toast y el contador se actualiza, usando Supabase Realtime (no polling).
- Los avisos pueden marcarse como "atendidos", aprovechando que `waiter_calls` ya soporta ese estado.
- Sonido opcional por evento, configurable por el usuario.

## 6. Permisos por rol

Los eventos solo llegan a los roles que corresponden a cada pantalla (mesero ve avisos de mesa, cocinero ve nuevas comandas, cajero ve pedidos web nuevos).

## 7. Pantallas

Este módulo no tiene pantalla propia; se manifiesta como overlays (toasts) y contadores dentro de M04, M05 y M06.

| Evento | Origen | Destino | Qué se ve | Latencia objetivo |
|---|---|---|---|---|
| Nueva comanda desde el QR | Cliente | Panel de mesas | Toast de nueva comanda + contador "comandas sin revisar" + indicador en la mesa y la pestaña de zona | < 5 s |
| Llamar a mesero | Cliente | Panel de mesas | Toast de solicitud de mesero + contador "solicitando mesero" | < 5 s |
| Pedir la cuenta | Cliente | Panel de mesas | Toast de solicitud de cuenta + contador "solicitando cuenta"; se limpia "solicitando mesero" | < 5 s |
| Nueva comanda (POS o mesero) | Personal | KDS | Tarjeta nueva + contador "comandas por preparar" | < 5 s |
| Pedido web nuevo | Cliente | Panel de pedidos | Fila "Nuevo" + contador "pedidos sin revisar" | inmediato al abrir |
| Cobro de mesa | Personal | Panel de mesas | Los contadores bajan y la mesa se libera en todos los dispositivos abiertos | < 5 s |

## 8. Procesos paso a paso

Ver M04 §8 para el detalle exacto de cada aviso al mesero desde el QR del cliente.

## 9. Textos de la interfaz

Redactar textos propios de Monky con el mismo propósito, en español neutro y tono cálido y breve. Ejemplos de referencia (a redactar, no copiar literal):

- Toast de nueva comanda indicando el número de mesa.
- Toast de solicitud de mesero indicando el número de mesa.
- Toast de solicitud de cuenta indicando el número de mesa.
- Contador de comandas por preparar.
- Contador de pedidos sin revisar.

## 10. Casos límite y requisitos

| # | Situación | Requisito de Monky |
|---|---|---|
| 1 | Contadores de mesas en otro dispositivo tras cobrar | Se sincronizan todos los eventos por Realtime, con reconciliación al reconectar (se vuelve a pedir el estado completo, no solo el delta perdido) |

## 11. Criterios de aceptación

- Dado que un cliente llama al mesero desde el QR, cuando pasan menos de 5 segundos, entonces el toast y el contador aparecen en todos los dispositivos del panel de mesas abiertos en esa sucursal.
- Dado que se cobra una mesa desde un dispositivo, cuando se consulta otro dispositivo abierto, entonces la mesa aparece disponible sin necesidad de recargar.
- Dado que un dispositivo pierde y recupera la conexión, cuando se reconecta, entonces reconcilia el estado completo (no solo los eventos perdidos) antes de seguir mostrando toasts nuevos.

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M09-T01 | Auditoría de canales Realtime existentes; confirmar cobertura de mesa/comanda/pedido/llamada | Backend | general-purpose | M | M04-T01, M05-T01 | Informe de gaps |
| M09-T02 | Canal Realtime unificado de contadores por sucursal (mesas activas, solicitando cuenta/mesero, comandas sin revisar, comandas por preparar, pedidos sin revisar) | Backend | general-purpose | L | M09-T01 | Contadores consistentes entre pestañas en prueba manual |
| M09-T03 | Toasts con textos propios de Monky en Panel de mesas y KDS | Frontend | general-purpose | M | M09-T02 | Verificado visualmente contra la tabla de §7 |
| M09-T04 | Reconciliación al reconectar (fetch completo de estado, no solo delta) | Frontend | general-purpose | M | M09-T02 | Probado desconectando la red y reconectando |
| M09-T05 | Marcar aviso como "atendido" y sonido por evento | Frontend | general-purpose | M | M09-T02 | Aprovecha `waiter_calls.handled_at`/`handled_by` ya existentes |
| M09-T06 | Tests E2E de latencia y sincronización multi-dispositivo (dos contextos de navegador) | QA | test-writer | M | M09-T02..T04 | Playwright con 2 páginas simultáneas |
| M09-T07 | QA en vivo: medir latencia real en `monky-qa` con dos dispositivos | QA | qa-e2e | S | M09-T02..T04 | Latencia registrada en `app/TESTING.md` |

Basado en el relevamiento interno de funcionalidades del POS.
