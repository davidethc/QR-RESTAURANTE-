# M08 · Caja y cortes

## Estado en Monky

**Existe — ajustes menores.** La caja está en producción y el corte a ciegas ya es un principio de diseño aplicado, no algo por construir. Confirmado leyendo el esquema y las acciones reales:

- Tablas ya existentes: `cash_registers`, `cash_sessions` (`status`: `OPEN`\|`CLOSED`, `opening_float`), `cash_movements` (`type`: `IN`\|`OUT`, `reason` con enum ya obligatorio: `FLOAT_TOPUP`\|`TIPS_PAYOUT`\|`SUPPLIER_PAYMENT`\|`EXPENSE`\|`REFUND`\|`WITHDRAWAL`\|`OTHER`), `cash_session_counts` (una fila por método de pago con `expected`, `counted`, `difference`).
- El corte a ciegas **ya está resuelto a nivel de arquitectura**: el código de las acciones de servidor documenta explícitamente que la sesión de caja que puede leer el mesero no expone montos esperados ni conteos hasta que la RPC de cierre los calcula; solo Dueño/Administrador consultan el resumen completo después de cerrado. Este módulo no construye el comportamiento "a ciegas" desde cero, lo extiende con más superficie de UI.
- RPCs ya existentes: `open_cash_session`, `close_cash_session`, `get_cash_session_summary`, `cash_session_expected`, `add_cash_movement`, `resolve_open_cash_session`.

Gaps reales confirmados:

| Gap | Notas |
|---|---|
| Numeración consecutiva global visible (#11287, #4967) | No existe como columna; hoy solo hay `id` (UUID) y `created_at` |
| Resultado explícito Exacto/Faltante/Sobrante | `cash_session_counts.difference` ya permite derivarlo; falta materializarlo como etiqueta en la UI y, si conviene, como columna calculada |
| Bloqueo por pedidos sin cobrar con "Omitir pagos pendientes" | No existe todavía en las RPCs de cierre |
| Calculadora de denominaciones de efectivo | No existe, es una pieza de UI nueva |
| Tarjeta "Último fondo de caja" por caja | No existe como vista, se puede derivar de la última `cash_session` cerrada por `register_id` |

Como es un módulo de dinero en producción, **ninguna tarea de este documento reescribe la lógica core de caja**; toda tarea de base de datos pasa por `db-architect` con revisión de `security-reviewer` antes de aplicarse (ver tabla de tareas).

## 1. Objetivo y alcance

**Entra:** cajas (crear/editar/borrar), movimientos manuales (entrada/retiro con motivo obligatorio), corte de caja a ciegas con calculadora de efectivo, cálculo de esperado vs. contado, bloqueo por pedidos sin cobrar, impresión del corte (contenido en M16), tarjeta "Último fondo de caja" por caja.

**NO entra:** el cobro en sí (M07 — este módulo solo consulta los pagos ya hechos para calcular lo esperado).

## 2. Dependencias

M00 (rol Cajero y cajas asignadas), M07 (pagos que alimentan lo esperado).

## 3. Datos

**Ya existe:** `cash_registers`, `cash_sessions`, `cash_session_counts`, `cash_movements`.

**A ajustar/agregar:**

| Entidad | Campo | Notas |
|---|---|---|
| `cash_registers` | — | Confirmar que al borrar una caja, los cortes y pagos asociados se conservan (no hay borrado en cascada) |
| `cash_sessions` | numeración consecutiva global | Columna nueva o secuencia dedicada |
| `cash_sessions` | `skipped_pending_orders` (bool) + relación a los pedidos omitidos | Para auditar cuándo se forzó un corte con pedidos sin cobrar |
| `cash_session_counts` | ya cubre `expected`/`counted`/`difference` por método | No requiere cambio de forma, solo de consumo en UI |

**Índices:** `cash_movements(cash_session_id)`, `payments(cash_session_id, created_at)` (ya existente, usado por M07), cortes por `register_id, created_at desc`.

## 4. Estados y transiciones

Un corte no tiene estados propios (es un evento inmutable una vez creado). El "corte actual" es implícito: todo movimiento/pago asociado a la sesión de caja abierta desde el último cierre de esa caja.

## 5. Reglas de negocio y cálculos

```
esperado_efectivo  = Σ cobros en efectivo (netos de cambio) + Σ entradas − Σ retiros   [de esa caja, desde el último corte]
esperado_tarjeta   = Σ cobros con tarjeta
esperado_transfer  = Σ cobros por transferencia
diferencia         = contado − esperado    (negativa = faltante, positiva = sobrante)
efectivo_a_retirar = efectivo_contado − fondo_de_caja
```

- **A ciegas:** el formulario de corte no muestra lo esperado mientras se declara; el resumen lateral solo muestra lo declarado (efectivo contado, tarjeta contado, transferencias, fondo, efectivo a retirar) — nunca el esperado, hasta guardar. Este comportamiento ya está garantizado por el diseño de las acciones de servidor actuales.
- Si hay pedidos sin cobrar en esa caja, Monky bloquea el corte con un mensaje que indica cuántos pedidos faltan por cobrar y ofrece "Omitir pagos pendientes" para continuar de todas formas, dejando constancia auditable de cuáles se omitieron.
- Los pedidos sin productos (creados vacíos y nunca completados) se excluyen del conteo de "pedidos sin cobrar", para que nunca bloqueen un corte por error.
- El campo de pagos en tarjeta se deshabilita cuando no hubo cobros con tarjeta en el período, con un aviso claro de que no hay nada que contabilizar.
- Un corte con diferencia (faltante o sobrante) genera un evento de seguridad.
- Un retiro de efectivo genera un evento de seguridad.
- Período del corte: desde el corte anterior de esa caja específica (en el primero, desde el primer movimiento en esa caja).
- Numeración: movimientos y cortes son consecutivos globales (no por caja ni por sucursal).

## 6. Permisos por rol

Dueño, Administrador y Cajero tienen acceso completo a Caja. Mesero y Cocinero son redirigidos a Inicio.

## 7. Pantallas

### 7.1 Cortes de caja

- Pestañas: Cortes de caja | Entradas y retiros de efectivo.
- Vacío: mensaje invitando a hacer el primer corte a ciegas, explicando que sirve para detectar faltantes y prevenir errores de manejo de efectivo.
- Con datos: tarjeta "Último fondo de caja" por caja · botón para nuevo corte · filtros (id, creado por, caja) · tabla con corte, fecha, caja, creado por, resultado y total esperado.
- **Modal "Nuevo corte de caja":**
  - Selector de caja.
  - Monto en efectivo, con botón para abrir la calculadora de denominaciones.
  - Monto de pagos en tarjeta.
  - Fondo de caja que queda para el siguiente turno.
  - Nota adicional.
  - Panel de resumen: solo información declarada (efectivo contado, tarjeta contado, transferencias, fondo de caja, efectivo a retirar), nunca el esperado.
  - Cancelar / Guardar.
- **Calculadora de efectivo:** filas de cantidad × valor por denominación, fila de total, Cancelar / Guardar. Las denominaciones dependen de la divisa configurada.
- **Detalle del corte:** fecha, número, caja, quién lo realizó, fondo de caja, efectivo retirado, tabla de contado/esperado/diferencia por método (desplegable con el detalle de cada cobro y movimiento), botón para imprimir (contenido exacto en M16).

### 7.2 Entradas y retiros

- Vacío: invitación a registrar movimientos para tener control exacto en cada corte.
- Cabecera: selector de corte actual por caja (también cortes anteriores), total de entradas, total de retiros.
- Pestañas: Todos / Entrada de efectivo / Retiros de efectivo, con filtros y tabla de movimiento, tipo, corte asociado, fecha y cantidad.
- **Modal "Nuevo movimiento":** caja, tipo (entrada/retiro), cantidad, motivo obligatorio, Cancelar / Confirmar.

### 7.3 Configuración de cajas

Crear, editar y borrar cajas (ej. Mostrador, Drive-thru, Barra); al borrar, se conservan los cortes y pagos asociados.

## 8. Procesos paso a paso

**Apertura de turno:** el cajero revisa la tarjeta "Último fondo de caja" para validar que el saldo inicial de efectivo coincida antes de comenzar a operar; si falta o sobra algo, registra una entrada o retiro con motivo.

**Movimientos durante el día:** Caja → Entradas y retiros → Nuevo movimiento → caja, tipo, cantidad, motivo → Confirmar. Se refleja en la tabla, suma a los totales y al esperado del siguiente corte. Un retiro genera evento de seguridad.

**Cierre de turno (corte a ciegas):**
1. Caja → Cortes → Nuevo corte de caja.
2. Formulario: caja (si hay varias), monto en efectivo (con calculadora), monto de pagos en tarjeta, fondo de caja que queda, nota adicional.
3. Resumen lateral: solo lo declarado.
4. Guardar: si hay pedidos sin cobrar, se bloquea con la lista y la opción de omitir; si no, se crea el corte.
5. Resultado: fila con número, fecha, caja, creado por, resultado (Exacto/Faltante/Sobrante) y total esperado; detalle desplegable; opción de imprimir; si hubo diferencia, se genera evento de seguridad.
6. "Último fondo de caja" queda actualizado por caja para el siguiente turno.

## 9. Textos de la interfaz

Redactar textos propios de Monky con el mismo propósito, en español neutro y tono cálido y breve. Ejemplos de referencia (a redactar, no copiar literal):

- Mensaje de estado vacío invitando al primer corte a ciegas.
- Tarjeta de último fondo de caja con quién lo registró y el monto.
- Explicación del campo "fondo de caja" como el efectivo que se reserva para el siguiente turno.
- Aviso de bloqueo por pedidos pendientes con la lista de folios y la opción de omitir.
- Aviso de que no hubo cobros con tarjeta en el período.
- Explicación del motivo obligatorio en cada movimiento.
- Aviso de que borrar una caja no elimina sus cortes ni pagos asociados.

## 10. Casos límite y requisitos

| # | Situación | Requisito de Monky |
|---|---|---|
| 1 | Pedidos de mesa vacíos | Se excluyen explícitamente del conteo de "pedidos sin cobrar" que bloquea el corte (ver M04) |
| 2 | Corte con "Omitir pagos pendientes" marcado | Queda registrado con la lista de folios omitidos, visible y auditable en el detalle del corte |
| 3 | Propina mostrada en el corte | Si se refleja en el corte, el ajuste de propina debe ser reversible (ver M15) |

## 11. Criterios de aceptación

- Dado un corte en curso, cuando se está llenando el formulario, entonces no se muestra ningún monto "esperado" en pantalla (a ciegas).
- Dado que hay 2 pedidos sin cobrar en la caja, cuando se intenta guardar el corte sin marcar "Omitir pagos pendientes", entonces se bloquea con el mensaje y la lista de folios.
- Dado un corte guardado con diferencia, cuando se revisa el historial de seguridad, entonces aparece el evento con el monto y si es faltante o sobrante.
- Dado que no hubo cobros con tarjeta en el período, cuando se abre el formulario de corte, entonces el campo correspondiente aparece deshabilitado con un aviso claro.
- Dado que se borra una caja, cuando se confirma, entonces los cortes y pagos asociados a ella se conservan intactos.

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M08-T01 | Auditoría del esquema actual de caja contra numeración global, `skipped_pending_orders` y resultado Exacto/Faltante/Sobrante | BD | db-architect | M | M07-T01 | Informe de gaps + migración |
| M08-T02 | Migración: numeración consecutiva global en `cash_sessions`/`cash_movements`, `skipped_pending_orders` | BD | db-architect | M | M08-T01 | Revisado por security-reviewer |
| M08-T03 | RPC de bloqueo por pedidos sin cobrar + "Omitir pagos pendientes" | BD | db-architect | M | M08-T02, M04-T01 | Excluye pedidos vacíos del conteo |
| M08-T04 | UI modal "Nuevo corte de caja" con resumen a ciegas | Frontend | ui-caja | L | M08-T03 | Reproduce §7.1 con textos propios de Monky |
| M08-T05 | Calculadora de denominaciones de efectivo (por divisa) | Frontend | ui-caja | M | M08-T04 | Denominaciones correctas; total = suma de cantidad×valor |
| M08-T06 | UI detalle del corte (tabla Contado/Esperado/Diferencia desplegable) | Frontend | ui-caja | M | M08-T03 | Reproduce §7.1 detalle |
| M08-T07 | UI Entradas y retiros (modal, tabla, motivo obligatorio) | Frontend | ui-caja | M | M08-T01 | Reproduce §7.2 |
| M08-T08 | Tarjeta "Último fondo de caja" por caja | Frontend | ui-caja | S | M08-T03 | Texto claro con miembro y monto |
| M08-T09 | Instrumentar eventos de seguridad: retiro y corte con diferencia | Backend | money-backend | S | M08-T03, M00-T02 | Eventos registrados en `audit_logs` |
| M08-T10 | Tests de dinero: cálculo de esperado, bloqueo por pendientes, numeración global consecutiva | QA | test-writer | L | M08-T03 | Suite SQL con BEGIN/ROLLBACK |
| M08-T11 | QA en vivo del flujo de cierre completo en `monky-qa` | QA | qa-e2e | M | M08-T04..T08 | Registrado en `app/TESTING.md` |
| M08-T12 | Revisión de seguridad: RLS de cortes/movimientos, que el corte a ciegas no filtre "esperado" por API antes de guardar | QA | security-reviewer | M | M08-T02..T06 | Informe sin hallazgos críticos |

Basado en el relevamiento interno de funcionalidades del POS.
