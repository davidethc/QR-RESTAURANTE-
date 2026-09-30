# M01 · Catálogo (categorías, productos, variantes, personalizaciones)

## Estado en Monky

Ya existen `products` (`category_id`, `name`, `description`, `image_url`, `position`, `active`, `available`, `featured`, `paired_drink_id`), `categories` (`name`, `position`, `active`, `description`) y el mecanismo de personalización por producto: `product_options` (`product_id`, `name`, `type`, `required`, `position`) con sus `product_option_values` (`name`, `price_modifier`, `position`). Los server actions reales viven en `src/lib/actions/menu.ts`: `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`, `createProduct`, `updateProduct`, `deleteProduct`, `reorderProducts`, `toggleProductAvailable`, `uploadProductImage`. Las RPC `get_public_menu` y `get_admin_menu` arman el menú para la carta pública y el panel respectivamente. La pantalla real es `/menu`.

Lo que falta y este módulo agrega con expand → deploy → contract (sin tocar lo anterior mientras siga en uso):

- **Variantes de precio por producto** (hoy un producto tiene un único `price`; no hay tabla de variantes).
- **Grupos de personalización reutilizables**: hoy `product_options` pertenece a un solo `product_id` con `required` binario; no hay mínimo/máximo de selección ni reutilización entre productos.
- **Horarios por categoría**: `categories` no tiene ningún campo de horario.
- **Canales por producto** (opciones de servicio: mesas, mostrador sin mesa, para llevar, domicilio, menú digital): no existe ningún campo equivalente en `products`.

`product_options.type` es hoy un texto libre, no un enum controlado; se mantiene así en la migración de este módulo salvo que se decida lo contrario.

## 1. Objetivo y alcance

**Entra:** categorías, productos con variantes de precio, grupos de personalización reutilizables y sus opciones, canales (opciones de servicio) por producto, horarios asociados a categorías.

**No entra:** disponibilidad/agotados (M02 §3). Promociones (módulo de promociones, fuera de este conjunto). Precios distintos por sucursal (el catálogo es de la empresa y se comparte entre sucursales cuando exista multi-sucursal).

## 2. Dependencias

Requiere el modelo de restaurante, miembros y roles ya existente (`restaurants`, `restaurant_members`).

## 3. Datos

**Ya existe en Monky:** `products` (`category_id`, `name`, `description`, `image_url`, `position`, `active`, `available`), `product_options` (`product_id`, `type`, `required`), `product_option_values` (`price_modifier`).

**A crear/extender:**

| Entidad | Campos | Notas |
|---|---|---|
| `categories` | agregar `schedule_ids uuid[]` (default = horario "Menú general") | Extiende la tabla existente sin romperla |
| `products` | agregar `service_options jsonb` `{pos:{tables,dine_in_no_table,takeaway,delivery}, digital_menu:{tables,pickup,delivery}}`, todas `true` por defecto | Convive con `available`, que sigue siendo el interruptor de disponibilidad (M02) |
| `product_variants` (nueva) | `product_id`, `name` (vacío si un solo precio), `price numeric(10,2)`, `position` | Migración: cada producto existente genera 1 variante con `name=''` y `price` igual al `products.price` actual; `products.price` se conserva como caché durante la transición |
| `modifier_groups` (nueva) | `restaurant_id`, `name` (instrucción al cliente), `internal_label` (opcional, no visible al cliente), `min_select int` (0 = opcional), `max_select int`, `allow_repeat bool` | Sustituye el `required` binario por mínimo/máximo reales |
| `modifier_options` (nueva) | `group_id`, `name`, `price numeric(10,2)` (≥0), `position` | Reemplaza `product_option_values` para los grupos nuevos |
| `product_modifier_groups` (puente N:N) | `product_id`, `group_id`, `position` | Un grupo puede vincularse a varios productos |
| `schedules` | `restaurant_id`, `name` | Ej. "Menú general", "Desayunos" |
| `schedule_shifts` | `schedule_id`, `weekday int` (0–6), `starts_at time`, `ends_at time` | Un horario sin turnos = abierto 24 h |

**Índices:** `product_variants(product_id)`, `modifier_options(group_id)`, único en `product_modifier_groups(product_id, group_id)`, `schedule_shifts(schedule_id, weekday)`.

**Migración de datos:** cada `product_options`/`product_option_values` existente se convierte en un `modifier_group` propio de ese producto (no reutilizable todavía) con `min_select = 1` si `required = true` (si no, `0`) y `max_select` igual a la cantidad de opciones actuales, sin repetición — así el comportamiento visible no cambia el día del despliegue. El equipo de menú puede fusionar manualmente estos grupos en reutilizables después. `product_options`/`product_option_values` no se eliminan hasta que todo el código que los lee migre a los grupos nuevos (fase "contract").

## 4. Estados y transiciones

El catálogo no tiene máquina de estados propia; está siempre "publicado" salvo por la disponibilidad (M02).

## 5. Reglas de negocio y cálculos

- Un producto tiene 1..N variantes; si hay más de una, quien pide ve "Opciones · Selecciona 1 · obligatorio" (selección única).
- Precio mostrado en la tarjeta: "Desde $X" = precio de la variante más económica.
- `min_select = 0` en un grupo de personalización significa que es opcional; `max_select` limita cuántas opciones distintas (o repetidas, si `allow_repeat`) se pueden sumar.
- El filtro "Sin usar" en la lista de personalizaciones muestra los grupos sin ningún vínculo en `product_modifier_groups`.
- Un horario sin turnos permanece abierto las 24 horas.
- Una categoría nueva se incluye por defecto en el horario "Menú general".
- Si falta elegir una variante obligatoria o falta un tipo de pedido, Monky muestra el error junto al campo correspondiente; el botón de continuar nunca queda inerte sin explicación (ver M04 §10).

## 6. Permisos por rol

Solo Dueño, Administrador y Gestor de Menú acceden a `/menu`. Los roles operativos (Mesero, Cajero, Cocinero) son redirigidos a Inicio si intentan entrar.

## 7. Pantallas

### 7.1 `/menu` — Productos

- Pestañas: Productos | Personalizaciones | Promociones.
- Lista: + Nueva categoría · + Nuevo producto · bloques por categoría (asa de arrastre, nombre, menú "…" → Editar / Agregar producto / Borrar) · filas de producto (imagen, nombre, menú "…" → Editar / Duplicar / Borrar) · pie "Mostrando N productos".
- **Nueva/Editar categoría:** Nombre de categoría + "Horarios que incluyen esta categoría" (selector múltiple, default "Menú general").
- **Agrega un producto / Editar producto** (panel con vista previa en vivo):

| Campo | Detalle |
|---|---|
| Nombre del producto | obligatorio |
| Categoría | select + "+ Nueva categoría" (modal corto: nombre, Cancelar/Agregar) |
| Descripción | texto libre |
| Imagen del producto | cargar archivo → recorte con zoom → guardar |
| Precio | monto; "+ Agregar otro precio" agrega filas de variante (nombre de variante, precio, borrar) |
| Personalizaciones | "No se han creado personalizaciones" o buscador para agregar un grupo existente; cada grupo agregado se muestra resumido (ej. "Elige tu salsa: Ají ($0), Queso extra ($0.50)") con opción de quitarlo |
| Más opciones → Opciones de servicio | switches por canal: en POS (Mesas / En el local sin mesa / Para llevar / Domicilio) y en Menú digital (Mesas / Para recoger / Domicilio); un producto solo se puede pedir por los canales activados |

- Botones: Cancelar / Agregar producto (o Guardar cambios).
- **Duplicar** abre el formulario con "<nombre> (copia)", variantes y grupos precargados, sin guardar hasta confirmar.
- **Borrar** pide confirmación explícita porque la acción no se puede deshacer.

### 7.2 `/menu` — Personalizaciones

- Estado vacío: mensaje invitando a crear personalizaciones para que los clientes agreguen extras, quiten ingredientes o elijan formas de preparación.
- Lista: + Nueva personalización · filtros Todas / Sin usar (N) · buscador · tabla con nombre del grupo, etiqueta interna y menú "…" → Editar / Duplicar / Borrar.
- Formulario: nombre del grupo (instrucción visible al cliente), etiqueta interna (no visible al cliente), opciones (nombre, precio, borrar; "+ Agregar otra opción"), cantidad a seleccionar (mínimo/máximo), switch "Permitir repetición de opciones", vista previa en vivo, Cancelar / Agregar personalización.

## 8. Procesos paso a paso

Puesta en marcha del menú: crear categorías → crear personalizaciones (grupos reutilizables) → crear productos con variantes, imagen, personalizaciones y canales activados.

## 9. Textos de la interfaz

- "Un producto puede tener múltiples precios según sus tamaños."
- "Este producto solo se podrá pedir en las opciones de servicio que estén activadas."
- "No se han creado personalizaciones."
- "Crea personalizaciones para tus productos. Permite a tus clientes agregar extras, quitar ingredientes o escoger formas de preparación."
- "Instrucciones para el cliente." / "No es visible para tus clientes."
- "Remover producto: no podrás deshacer esta acción."
- "El horario permanecerá abierto las 24 horas hasta que agregues un turno."

## 10. Casos límite y requisitos

| # | Requisito |
|---|---|
| 1 | Al borrar un grupo de personalización usado por varios productos, Monky avisa cuántos productos lo usan antes de confirmar el borrado. |
| 2 | Si falta elegir la variante obligatoria o el tipo de pedido, Monky muestra el mensaje de error junto al campo exacto, nunca solo un botón inerte. |

## 11. Criterios de aceptación

- Dado un producto con 2 variantes, cuando el cliente o el personal lo agregan, entonces deben elegir exactamente una variante antes de continuar.
- Dado un grupo de personalización con `min_select=1, max_select=2`, cuando se seleccionan 3 opciones, entonces la tercera se rechaza y el botón "+" se desactiva en el tope.
- Dado un grupo de personalización sin productos vinculados, cuando se filtra "Sin usar", entonces aparece en la lista.
- Dado un producto duplicado, cuando se abre el formulario de duplicado, entonces el nombre trae el sufijo " (copia)" y no se ha guardado nada aún.

## 12. Tareas

| ID | Tarea | Tipo | Agente | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M01-T01 | Migración: `categories.schedule_ids`, `products.service_options`, tablas `schedules`/`schedule_shifts` | BD | db-architect | M | — | Migración aplicada; RLS por restaurante |
| M01-T02 | Migración: `product_variants` + backfill desde el precio único actual de `products` | BD | db-architect | M | M01-T01 | Cada producto existente queda con 1 variante equivalente |
| M01-T03 | Migración: `modifier_groups`, `modifier_options`, `product_modifier_groups` + backfill desde `product_options`/`product_option_values` | BD | db-architect | L | M01-T02 | Backfill documentado y reversible; el comportamiento visible no cambia |
| M01-T04 | Server actions: CRUD de categoría, producto, variantes, grupos de personalización y opciones (validación con zod) | Backend | general-purpose | L | M01-T03 | Reglas de mínimo/máximo y "un solo precio" validadas en servidor |
| M01-T05 | UI formulario de producto (variantes, personalizaciones reutilizables, canales, recorte de imagen) | Frontend | general-purpose | L | M01-T04 | Reproduce §7.1 |
| M01-T06 | UI Personalizaciones (lista, filtro "Sin usar", formulario con vista previa) | Frontend | general-purpose | M | M01-T04 | Reproduce §7.2 |
| M01-T07 | UI Horarios básicos (crear horario, turnos por día) — reutilizada por el módulo de menú digital | Frontend | general-purpose | M | M01-T01 | "24 horas sin turnos" funciona por defecto |
| M01-T08 | Regenerar tipos de Supabase y actualizar componentes que leían `products.price`/`product_options` directo | Backend | scribe-ops | S | M01-T04 | `npm run typecheck` sin errores |
| M01-T09 | Tests: variante obligatoria, mínimo/máximo de personalización, backfill de datos | QA | test-writer | M | M01-T04 | Suite Vitest + SQL con rollback |

Basado en el relevamiento interno de funcionalidades del POS.
