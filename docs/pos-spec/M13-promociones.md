# M13 · Promociones

## Estado en Monky

**Nuevo.** Confirmado leyendo el esquema real: no existe ninguna tabla de promociones en Monky. Hay que construir descuento en productos/categorías y "Compra X y lleva Y" (2x1, 3x2...), con activación por días de la semana o rango de fechas, evaluados en la zona horaria de la sucursal (Monky ya guarda `timezone` en `restaurants`, que se reutiliza para esta evaluación).

## 1. Objetivo y alcance

**Entra:** promoción de tipo Descuento (porcentaje o monto fijo) o Compra X y lleva Y, aplicable a productos o categorías específicas, activación por días de la semana o rango de fechas, canales (mismos que producto), visualización en POS/mesero/carta (precio tachado, etiqueta, banner).

**NO entra:** disponibilidad (M02), catálogo base (M01, este módulo solo referencia productos/categorías ya creados).

## 2. Dependencias

M01 (catálogo), M04/M06 (donde se aplica el descuento a la línea), M12 (banner en la carta pública).

## 3. Datos

**A crear:**

| Entidad | Campos | Notas |
|---|---|---|
| `promotions` | `restaurant_id`, `name`, `type` (`discount`\|`buy_x_get_y`), `value_type` (`percent`\|`fixed`, solo si `discount`), `value numeric`, `receive_qty int`, `buy_qty int` (solo si `buy_x_get_y`; ej. 2x1 = receive_qty=2, buy_qty=1), `applies_to` (`products`\|`categories`), `target_ids uuid[]`, `weekdays int[]` (0–6) o `starts_on date`/`ends_on date` (exactamente una de las dos formas de activación), `service_options jsonb` (igual estructura que producto), `status` (`active`) | El esquema 2x1 solo admite días de la semana, no rango de fechas |

**Índices:** `promotions(restaurant_id, status)`, GIN sobre `target_ids` si se filtra frecuentemente.

## 4. Estados y transiciones

`ACTIVA` mientras existe y está dentro de su vigencia (evaluado en cada solicitud, no es un campo persistido de estado). Se borra con confirmación explícita. Se evaluará con el equipo de producto si conviene agregar un interruptor de pausa además de borrar, como mejora sobre el borrado definitivo.

## 5. Reglas de negocio y cálculos

```
precio_unitario   = precio_variante + Σ(precio_opción × cantidad_opción)
descuento_línea   = promo aplicable (porcentaje sobre la variante, o monto fijo)
subtotal_línea    = (precio_unitario − descuento_unitario) × cantidad
```

- El ticket muestra el precio de lista por línea y el descuento total aparte, con el total ya neto del descuento.
- En pantalla y en la carta: precio desde la variante más barata, con el precio de lista tachado y una etiqueta con el porcentaje o tipo de descuento.
- **Descuento en productos:** porcentaje o monto fijo por unidad sobre los productos o categorías elegidos, si el día/fecha y el canal coinciden.
- **Compra X y lleva Y:** con `receive_qty=2, buy_qty=1` (2x1), de cada 2 unidades se cobra 1. Cuando convive con un descuento porcentual sobre el mismo producto, el porcentaje se aplica primero al precio y luego el esquema de "llevar X pagando Y" se aplica a las unidades resultantes (validar el orden exacto con el equipo de producto antes de implementar, dejando pruebas automáticas que fijen el comportamiento esperado).
- **Evaluación de vigencia:** siempre en la hora local de la sucursal (zona horaria de `restaurants.timezone`), con inicio a las 00:00 y fin inclusivo hasta las 23:59 del día de término — una promoción con rango de fechas debe seguir aplicándose hasta el final del último día configurado, con pruebas automáticas que crucen la medianoche.
- **Selector de días:** empieza vacío y muestra un resumen en texto de los días activos (por ejemplo, "Activa: viernes y sábado"), para que crear una promo nunca implique desmarcar días que no se quieren incluir.

## 6. Permisos por rol

Dueño, Administrador y Gestor de Menú.

## 7. Pantallas

### 7.1 Promociones

- Vacío: invitación a crear promociones atractivas para aumentar ventas.
- Botón de nueva promoción con dos opciones: Descuento en productos (categorías o productos específicos) / Compra X y lleva X (estilo 2x1, 3x2, etc.).
- Lista: buscador, tabla con nombre, tipo de promoción, estado; opciones de editar o borrar con confirmación explícita de que la acción no se puede deshacer.
- **Formulario de descuento** (con vista previa de los productos afectados):
  - Nombre, con ejemplos genéricos como guía.
  - Valor del descuento (porcentaje o monto fijo).
  - Se aplica a (productos específicos o categorías específicas, con selector múltiple).
  - Cuándo se activa: rango de fechas (con calendario, días pasados deshabilitados) o días de la semana (empezando vacío, con resumen en texto).
  - Más opciones: canales (misma estructura que producto).
- **Formulario Compra X y lleva X:**
  - Nombre, con ejemplos genéricos como guía.
  - Cantidad a recibir / cantidad a comprar.
  - Se aplica a.
  - Días de la semana (empezando vacío).
  - Más opciones (canales).

## 8. Procesos paso a paso

Las promociones se configuran como parte opcional del menú, después de categorías, personalizaciones y productos (M01).

## 9. Textos de la interfaz

Redactar textos propios de Monky con el mismo propósito, en español neutro y tono cálido y breve. Ejemplos de referencia (a redactar, no copiar literal):

- Estado vacío invitando a crear la primera promoción.
- Descripción breve de cada tipo de promoción al elegir cuál crear.
- Ejemplos genéricos de nombre de promoción (por ejemplo, "Descuento especial" o "Promo de fin de semana").
- Instrucción para elegir los días activos de la promoción.
- Confirmación de borrado explicando que la acción no se puede deshacer.
- Etiquetas de descuento en la carta (porcentaje, 2x1) junto al precio tachado.

## 10. Casos límite y requisitos

| # | Situación | Requisito de Monky |
|---|---|---|
| 1 | Promoción con rango de fechas | Se evalúa en la zona horaria de la sucursal, con fin inclusivo hasta las 23:59; pruebas automáticas que crucen la medianoche |
| 2 | Selector de días al crear una promoción | Empieza vacío y muestra un resumen en texto de los días elegidos |

## 11. Criterios de aceptación

- Dado una promo de descuento activa hoy (dentro de `starts_on`..`ends_on`), cuando se consulta a las 23:50 hora de la sucursal del último día, entonces sigue aplicándose (fin inclusivo).
- Dado el selector de días al crear una promo nueva, cuando se abre por primera vez, entonces no hay ningún día marcado.
- Dado una promo 2x1 con 10% de descuento adicional sobre el mismo producto, cuando se agregan 2 unidades de un producto de $2.50, entonces el cobro total combina ambos esquemas según el orden validado con producto (referencia: $2.25 por las 2 unidades).
- Dado un producto con promo activa, cuando se muestra en la carta o en el selector de productos del POS, entonces aparece el precio tachado y la etiqueta del descuento.
- Dado que se borra una promoción, cuando se confirma, entonces deja de aplicarse de inmediato a nuevas líneas (no afecta pedidos ya cobrados).

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M13-T01 | Migración: tabla `promotions` con los dos tipos y activación por días o fechas | BD | db-architect | M | M01-T02 | Constraint: `buy_x_get_y` no admite `starts_on/ends_on`, solo `weekdays` |
| M13-T02 | Función SQL de evaluación de vigencia en hora local de la sucursal (fin inclusivo) | BD | db-architect | M | M13-T01 | Test cruzando medianoche y cambio de mes |
| M13-T03 | RPC: calcular descuento de línea (descuento simple y 2x1 combinado con porcentaje) | BD | money-backend | L | M13-T02 | Reproduce el ejemplo numérico de §5 ($2.25 por 2 unidades) |
| M13-T04 | Server actions: CRUD de promoción (zod, selector de días vacío por defecto) | Backend | general-purpose | M | M13-T01 | Validación: exactamente un modo de activación |
| M13-T05 | UI lista y formularios de promoción (descuento y 2x1) | Frontend | general-purpose | L | M13-T04 | Reproduce §7.1 con textos propios de Monky; días vacíos por defecto |
| M13-T06 | Aplicar descuento visual en POS/mesero (precio tachado, etiqueta) | Frontend | ui-caja | M | M13-T03, M04-T06 | Coincide con M04/M06 |
| M13-T07 | Banner de promoción y precio tachado en la carta pública | Frontend | general-purpose | M | M13-T03, M12-T05 | Coincide con M12 §7.1 |
| M13-T08 | Tests: fin de fecha inclusivo, selector de días vacío, cálculo 2x1+porcentaje | QA | test-writer | L | M13-T02, M13-T03 | Suite SQL + Vitest, incluye caso frontera de medianoche |

Basado en el relevamiento interno de funcionalidades del POS.
