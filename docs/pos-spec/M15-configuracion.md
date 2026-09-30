# M15 · Configuración general

## Estado en Monky

**Ya existe:**
- `/settings`, con un formulario de Datos del restaurante (logo, nombre, descripción, teléfono, dirección) y un formulario separado de Cobro y caja (activar cobro, descuento máximo del mesero, hora de corte del día), visible solo al Dueño.
- La subida de logo (`uploadRestaurantLogo`) ya es una acción independiente de `updateRestaurantSettings`: el archivo se sube después de guardar el resto del formulario, en un paso separado. Falta confirmar en el frontend que un error en la subida del logo no descarta lo ya escrito en los demás campos.
- La tabla `restaurants` ya tiene `name`, `description`, `phone`, `address`, `logo_url`, `cover_image_url`, `opening_hours`, `timezone`, `business_day_cutoff`.

**Se adapta:**
- El formulario actual de "Datos del restaurante" cubre nombre, logo y contacto, pero no tiene todavía alias visible al cliente, ubicación en mapa, ni el flujo de eliminar sucursal — porque hoy 1 restaurante = 1 entidad, no hay separación empresa/sucursal (ver M17).
- No hay todavía un campo `country` bloqueado ni mensaje de "para cambiar el país contacta a soporte": country no existe como columna hoy.

**Es nuevo:**
- Campo `currency` configurable (Monky no lo tiene hoy; hay que confirmar si el precio ya asume una sola divisa fija o si se necesita el selector).
- `service_options` (activar/desactivar canales de servicio: mesas, en el local, para llevar, domicilio, tanto en punto de venta como en menú digital) — no existe ninguna tabla ni UI de esto hoy.
- `delivery_settings` (costos de envío) — depende del módulo de menú digital, que todavía no existe en Monky.
- La estructura común de un panel de Configuración con menú lateral: hoy `/settings` es una sola página con dos formularios, no un modal con secciones navegables. Habrá que decidir si se extiende `/settings` o se rediseña como panel de varias secciones antes de agregar más.
- La sección "Suscripción" no tiene equivalente en Monky (no hay planes comerciales todavía): se documenta aquí solo como referencia para una fase comercial posterior, no se construye en el MVP.

## 1. Objetivo y alcance

**Entra:** las secciones de Configuración que no pertenecen a otro módulo específico: General, Suscripción (solo como referencia, ver más abajo), Datos de sucursal, Opciones de servicio, Costos de envío, y la estructura común del panel de Configuración con su menú lateral.

**No entra:** Miembros y permisos, Historial de seguridad, Zonas y mesas, Cajas, Impresión (M16), Métodos de pago/Tiempos/Horarios/WhatsApp/Propinas del menú digital.

## 2. Dependencias
Roles y permisos: quien gestiona una sucursal puede editar sus datos pero no crear ni borrar sucursales.

## 3. Datos

**A extender:**
| Entidad | Campos | Notas |
|---|---|---|
| `restaurants` | `currency`, `country` (editable solo por soporte, no por el usuario) | Confirmar si se necesita `currency` configurable o si Monky fija una sola divisa; `country` se bloquea con mensaje |
| `restaurants` | `alias` (visible al cliente, vacío = "Sin alias (matriz)"), `geo_location` | Se suma a los campos ya existentes de dirección, logo y portada |
| `service_options` | `pos jsonb` `{tables, dine_in_no_table, takeaway, delivery}`, `digital_menu jsonb` `{tables, pickup, delivery}` | A nivel restaurante; todas activas por defecto |
| `delivery_settings` | `shipping_cost_type`, `free_shipping_*`, `min_purchase_*` | Este módulo solo aporta la UI de "Costos de envío"; el dato vive en el módulo de menú digital |

## 4. Estados y transiciones
No aplica máquina de estados propia.

## 5. Reglas de negocio y cálculos
- El país se fija en el registro y solo soporte puede cambiarlo: "Para cambiar el país contacta a soporte."
- Subir el logo o la portada **no debe borrar** lo escrito sin guardar en el resto del formulario: las subidas de imagen deben ser independientes del guardado del formulario de texto (Monky ya lo hace correctamente para el logo actual — mantener ese mismo patrón al extender el formulario).
- Las opciones de servicio apagadas aquí se reflejan como "Deshabilitado" en los selectores de tipo de pedido del punto de venta, y ocultas en la carta pública.
- Borrar sucursal es una operación muy destructiva: exigir escribir el nombre de la sucursal para confirmar, no solo una confirmación simple.

## 6. Permisos por rol
- General, Suscripción: solo Dueño.
- Datos de sucursal, Opciones de servicio, Costos de envío: Dueño, Administrador, Gestor de Sucursal (puede editar pero no crear/borrar sucursales).
- Roles operativos (Mesero, Cocina): solo ven la sección Impresión dentro de Configuración.

## 7. Pantallas

### 7.0 Estructura común (`/ajustes/*`, panel con menú lateral)
Menú: General · Suscripción · Datos de sucursal · Opciones de servicio · Costos de envío · Miembros y permisos · Historial de seguridad · Zonas y mesas · Cajas · Impresión · Menú digital (Métodos de pago / Tiempos de entrega / Horarios / WhatsApp vinculado / Propinas) · Más funcionalidades. Los roles operativos solo ven Impresión.

### 7.1 General (`/ajustes/general`)
Nombre de empresa (Guardar/Cancelar) · Divisa ("Escoge la divisa que tus clientes verán en tu carta.") · País (bloqueado: "Para cambiar el país contacta a soporte.").

### 7.2 Datos de sucursal (`/ajustes/sucursal`)
Alias de sucursal ("Visible para tus clientes, un nombre corto o distintivo…", ejemplo: Centro, Norte, Sur) · Dirección completa (ejemplo: "Avenida Principal 123, Barrio Central") · Ubicación en el mapa (Agregar ubicación) · Logotipo del negocio · Portada del negocio (cargar imagen con recorte) · **Eliminar sucursal** (flujo completo en M17).

### 7.3 Opciones de servicio (`/ajustes/opciones-de-servicio`)
"Elige qué opciones de servicio están disponibles al momento de tomar un pedido, tanto para tu personal como para tus clientes." Punto de venta: Mesas / En el local / Para llevar / Domicilio · Menú digital: Mesas / Para recoger / Domicilio.

### 7.4 Costos de envío (`/ajustes/envios`)
Tipo de costo de envío (Por cotizar: "El precio de envío no se calcula automáticamente.") · interruptor de envío gratis a partir de una compra mínima · interruptor de compra mínima requerida para habilitar envíos.

### 7.5 Suscripción (referencia, no se construye en el MVP)
Sección reservada para una fase comercial posterior (planes y límites); no forma parte del alcance actual.

## 8. Procesos paso a paso
Puesta en marcha del restaurante: General (nombre y divisa) → Datos de sucursal (alias, dirección, mapa, logo, portada) → Opciones de servicio (qué canales se usan).

## 9. Textos de la interfaz
- "Escoge la divisa que tus clientes verán en tu carta."
- "Para cambiar el país contacta a soporte."
- "Visible para tus clientes, un nombre corto o distintivo…"
- "Elige qué opciones de servicio están disponibles al momento de tomar un pedido, tanto para tu personal como para tus clientes."
- "El precio de envío no se calcula automáticamente."
- "Borrar sucursal — No podrás deshacer esta acción. ¿Confirmas que deseas borrar la sucursal '<nombre>'?"

## 10. Casos límite y requisitos
| # | Requisito |
|---|---|
| 1 | Subir el logo o la portada nunca borra lo escrito sin guardar en el resto del formulario: las subidas de imagen son independientes del guardado de los campos de texto (patrón ya usado por Monky para el logo). |
| 2 | Borrar sucursal exige escribir el nombre exacto de la sucursal antes de habilitar el botón de confirmar; una sola confirmación no es suficiente. |

## 11. Criterios de aceptación
- Dado un formulario de Datos de sucursal con el campo Alias modificado sin guardar, cuando se sube el logo, entonces el Alias modificado sigue presente al terminar la subida.
- Dado el campo País, cuando se intenta editarlo, entonces aparece bloqueado con el mensaje exacto.
- Dado que se desactiva "Domicilio" en Opciones de servicio, cuando se abre el selector de tipo de pedido en el punto de venta, entonces esa opción aparece "Deshabilitado".
- Dado el flujo de borrar sucursal, cuando se confirma sin escribir el nombre exacto, entonces se bloquea la eliminación.

## 12. Tareas
| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M15-T01 | Migración: `currency` en `restaurants` si se confirma necesaria, `service_options` a nivel restaurante | BD | db-architect | S | — | Defaults: todas las opciones activas |
| M15-T02 | Server actions: guardar General, Datos de sucursal (subidas de imagen independientes del guardado de texto) | Backend | general | M | M15-T01 | Caso de subida de logo verificado (no se pierde texto no guardado) |
| M15-T03 | UI General, Datos de sucursal, Opciones de servicio, Costos de envío | Frontend | general | L | M15-T02 | Reproduce §7.1–7.4 |
| M15-T04 | Estructura común del panel de Configuración (menú lateral, visibilidad por rol) | Frontend | general | M | — | Roles operativos solo ven Impresión |
| M15-T05 | Flujo de borrado de sucursal con confirmación escribiendo el nombre | Frontend | general | S | M15-T02, M17 (migración de sucursales) | Confirmación por nombre exacto verificada |
| M15-T06 | Tests: independencia de subida de imagen, bloqueo de país, confirmación de borrado | QA | test-writer | M | M15-T02, M15-T05 | Suite Vitest/Playwright |

Basado en el relevamiento interno de funcionalidades del POS.
