# M00 · Base (negocio, sucursal, miembros, roles, permisos, auditoría)

## Estado en Monky

**Existe:** `restaurants` (negocio y sucursal fusionados en una sola entidad: `id`, `name`, `slug`, `opening_hours`, zona horaria fija `America/Guayaquil` resuelta por `restaurant_tz`/`business_date`/`business_today`/`business_day_bounds`), `restaurant_members` (`role` con un único valor fijo del enum `member_role`: `OWNER | ADMIN | WAITER | KITCHEN`, `status`: `ACTIVE | INACTIVE`), y `audit_logs` (tabla de auditoría genérica ya en producción, con un enum `audit_action` de ~24 valores que ya cubre eventos sensibles como `CANCEL_ORDER`, `APPLY_DISCOUNT`, `REMOVE_DISCOUNT`, `VOID_PAYMENT`, `VOID_BILL`, `CLOSE_CASH_SESSION`, `CASH_MOVEMENT`, `FORCE_CLOSE_SESSION`, `LOGIN`/`LOGOUT`).

**Se adapta:** el modelo de roles pasa de un valor único por miembro a un conjunto combinable de roles, se agrega el rol Cajero (hoy no existe como tal — el cobro lo puede operar cualquier `ADMIN`/`OWNER`), y se añade acceso por PIN de 4 dígitos como método alterno al login por correo (`auth.ts` hoy solo soporta correo/contraseña vía Supabase Auth).

**Es nuevo:** PIN de acceso, matriz de permisos con redirección silenciosa y ocultamiento de menú por rol, separación de "empresa" de "sucursal" (hoy 1 fila de `restaurants` = 1 sucursal; ver M17 §3 para el detalle de esa migración cuando se aborde multi-sucursal).

Regla del proyecto: no se reescribe nada que ya funcione en producción. La migración de `role` único a `roles` combinables se hace por expand → deploy → contract: se agrega la columna nueva sin quitar `role`, se despliega el código que lee `roles`, y solo después se retira `role` si ya no lo usa nada.

## 1. Objetivo y alcance (qué entra y qué no)

**Entra:** modelo de negocio/sucursal, miembros y su acceso (PIN y/o correo), catálogo de roles combinables con su descripción oficial, matriz de permisos por pantalla con redirección silenciosa, aislamiento de datos por sucursal, historial de seguridad (auditoría) legible desde el panel de administración.

**No entra:** dispositivos vinculados con PIN (M10 §3), zonas y mesas (M03), configuración de menú digital (M12), impresión (M16), multi-sucursal completo con creación/borrado de sucursales (M17 lo extiende).

## 2. Dependencias

Ninguna — es el módulo raíz. Todos los demás módulos dependen de M00 para roles, permisos y aislamiento por restaurante.

## 3. Datos

**Ya existe en Monky:**
- `restaurants` — negocio y sucursal en una sola fila.
- `restaurant_members` — miembro con un `role` fijo del enum `member_role`.
- `audit_logs` — auditoría genérica, ya en producción.

**A extender o crear (expand → deploy → contract):**

| Entidad | Campos nuevos | Notas |
|---|---|---|
| `restaurants` | Sin cambios de fondo mientras el negocio tenga una sola sucursal. Si se aborda M17, separar en `companies` (nombre, moneda, país, slug) y `branches` (`company_id`, alias, dirección, ubicación, logo, portada, `is_main`) | Ver M17 §3 para el detalle de esa migración |
| `restaurant_members` | `pin_hash` (texto, hash del PIN de 4 dígitos), `roles` (arreglo de texto, en paralelo a `role` durante la transición — backfill: `OWNER → ['ADMIN']` con bandera de dueño implícita, `ADMIN → ['ADMIN']`, `WAITER → ['WAITER']`, `KITCHEN → ['KITCHEN']`), `cash_register_ids` (arreglo de uuid, solo relevante si `roles` incluye `CASHIER`), `email_login_enabled` (booleano) | Un miembro puede tener cero o más roles del catálogo de §6 |
| Catálogo de roles (constraint o tabla de referencia) | `SUPER_ADMIN` (no asignable, es el dueño que registró el negocio), `ADMIN`, `MEMBERS_ADMIN`, `BRANCH_MANAGER`, `MENU_MANAGER`, `CASHIER`, `WAITER`, `KITCHEN` | Ver §6 para las descripciones oficiales de cada uno |
| `security_events` (nueva, o vista filtrada sobre `audit_logs`) | Puede reutilizar `audit_logs` tal cual, ya que su enum `audit_action` ya cubre los eventos sensibles necesarios; si se necesita un subconjunto curado para el panel de "Historial de seguridad", crear una vista sobre `audit_logs` en vez de una tabla nueva | Evita duplicar lo que ya funciona |

**Índices:** `restaurant_members(restaurant_id)`, `restaurant_members(pin_hash)` para login rápido por PIN, `audit_logs(restaurant_id, created_at desc)` (ya existe).

**RLS:** cada tabla sigue filtrando por `restaurant_id` como hoy; se añade una política para que un miembro sin rol `ADMIN`/`OWNER` no pueda leer eventos de auditoría de otros miembros, salvo su propio historial si se decide exponerlo.

## 4. Estados y transiciones

**Miembro:**
```
ACTIVO CON SUCURSAL ──(quitar todas las sucursales)──▶ SIN ACCESO
SIN ACCESO ──(asignar ≥ 1 sucursal)──▶ ACTIVO CON SUCURSAL
```

**Correo del miembro:** `no confirmado → confirmado` (solo si `email_login_enabled` está activo).

## 5. Reglas de negocio y cálculos

- El PIN es obligatorio para todo miembro, incluso si además usa correo.
- El PIN se guarda siempre con hash, nunca en texto plano.
- Un miembro puede tener varios roles a la vez (§6): el conjunto de permisos efectivo es la unión de los permisos de cada rol que tenga.
- El rol Cajero requiere además `cash_register_ids` no vacío para poder cobrar, pero esa validación no debe bloquear el guardado de miembros que tengan otros roles sin Cajero.
- Redirección silenciosa por rol (§6 y §7): si un miembro entra a una pantalla que no le corresponde, se le lleva sin mostrar error a su pantalla de trabajo:
  - Solo `WAITER` (sin `ADMIN`/`OWNER`) → Mesas.
  - Solo `CASHIER` → Panel de pedidos (POS).
  - Solo `KITCHEN` → Cocina (KDS).
  - `ADMIN` / `OWNER` / `SUPER_ADMIN` → ve todo.
- El menú de navegación oculta las secciones que el rol no puede usar, no solo redirige si el miembro entra por URL directa.
- Aislamiento de datos por sucursal: un miembro solo ve las sucursales listadas en su asignación.
- El correo de acceso no se puede repetir dentro de la misma instancia de Monky.

## 6. Permisos por rol

Catálogo de roles y su descripción, para mostrar tal cual en el formulario de miembro (textos propios de Monky):

| Rol | Descripción en pantalla |
|---|---|
| Super administrador | El dueño del negocio (no se asigna manualmente) |
| Administrador | Puede ver y controlar casi todo el negocio |
| Administrador de miembros | Puede agregar, editar y eliminar miembros, pero no otros administradores |
| Gestor de sucursal | Puede editar los datos de la sucursal, pero no crear ni eliminar sucursales |
| Gestor de menú | Puede agregar, editar y eliminar productos, personalizaciones y promociones |
| Cajero | Tiene acceso al panel de pedidos y puede cambiar la disponibilidad de productos (requiere caja asignada) |
| Mesero | Tiene acceso al panel de mesas y puede cambiar la disponibilidad de productos |
| Cocinero | Tiene acceso a las comandas digitales y puede cambiar la disponibilidad de productos |

Matriz de acceso por pantalla para los tres roles operativos puros:

| Pantalla | Mesero | Cajero | Cocinero |
|---|---|---|---|
| Inicio | Sí, sin cifras de venta | Sí | Sí |
| Panel de pedidos (POS) | redirige a Mesas | Sí (su pantalla) | redirige a Cocina |
| Panel de mesas | Sí (su pantalla) | redirige al POS | redirige a Cocina |
| Cocina (KDS) | redirige a Mesas | redirige al POS | Sí (su pantalla) |
| Menú | redirige a Inicio | redirige a Inicio | redirige a Inicio |
| Caja | redirige a Inicio | Sí, completo | redirige a Inicio |
| Disponibilidad | Sí | Sí | Sí |
| Menú digital (solo ver) | Sí | Sí | — |
| Configuración | Solo Impresión | Solo Impresión | Solo Impresión |

## 7. Pantallas (ruta, elementos, campos, botones)

### 7.1 Miembros y permisos

- **Tabla:** nombre del miembro ("Tú" para el dueño) · sucursales con acceso (Todas / N / "Sin acceso", con detalle en hover) · roles asignados · correo ("Sin correo" o correo + "Correo sin confirmar") · menú de acciones → Editar / Eliminar (con confirmación explícita, sin poder deshacerse) · pie con conteo de miembros y sucursales.
- **Alta o edición de miembro** (panel lateral con vista previa en vivo):
  - Nombre — obligatorio.
  - Apellido — obligatorio.
  - PIN de acceso: botón para asignar → teclado numérico de 4 dígitos en pantalla → una vez guardado se muestra oculto con opción de cambiarlo. Texto de apoyo: usar el texto existente de Monky si ya hay uno equivalente, o algo como "Este PIN se usa para iniciar sesión en los dispositivos del local."
  - Interruptor de acceso con correo electrónico → si se activa: campo de correo (con aviso de que se enviará confirmación) y campo de contraseña (editable después).
  - Roles: casillas con las ocho opciones de §6, combinables entre sí (salvo Super administrador, que no se asigna).
  - Sucursales con acceso: selector múltiple.
  - Cajas asignadas: campo visible solo si el rol Cajero está marcado.
  - Botones: Cancelar / Agregar miembro (o Guardar cambios).
- **Validaciones:**
  - PIN siempre obligatorio, tenga o no correo.
  - Correo repetido → mensaje de que ya existe una cuenta con ese correo.
  - Al menos una sucursal asignada, o el miembro queda sin poder ingresar.
  - "Cajas asignadas" solo es obligatorio cuando el campo está visible (rol Cajero marcado en ese momento).

### 7.2 Historial de seguridad

- Descripción: pantalla para supervisar acciones del equipo que requieren atención, pensada para prevenir pérdidas y detectar irregularidades a tiempo.
- Estado vacío: mensaje invitando a que, cuando ocurra una acción sensible, aparecerá aquí.
- Filtros: por tipo de acción y por miembro.
- Tabla: acción realizada, fecha, con enlace al objeto relacionado (pedido, corte de caja, producto, etc.) y un detalle expandible (miembro, monto, tipo de diferencia si aplica).

### 7.3 Ingreso por PIN en un dispositivo (compartido con M10)

Teclado numérico 0–9 con borrar, se bloquea mientras valida el PIN, y ofrece una alternativa de "Ingresar con correo electrónico".

## 8. Procesos paso a paso

- **Configuración inicial del negocio, paso de alta de personal:** crear cada persona con PIN y roles → asignarle sucursal (y caja si es Cajero) → opcionalmente habilitar acceso con correo.
- **Apertura del turno:** cada persona ingresa con su PIN y cae en su pantalla de trabajo según el primer rol operativo que tenga (Mesero → Mesas, Cajero → POS, Cocinero → Cocina); si combina roles administrativos, ve el panel completo.

## 9. Textos de la interfaz

Usar el texto existente de Monky donde ya exista una pantalla equivalente (login, formulario de miembro). Para las pantallas nuevas de este módulo, redactar en español neutro, tono cálido y breve, por ejemplo:
- Aviso de correo duplicado: invitar a iniciar sesión con esa cuenta existente en vez de crear una nueva.
- Aviso de sucursal obligatoria: explicar que sin al menos una sucursal asignada, el miembro no podrá entrar a la plataforma.
- Ayuda del PIN: explicar en una frase que ese PIN es el que usará el miembro para entrar en los dispositivos del local.
- Confirmación de borrado de miembro: dejar explícito que la acción no se puede deshacer.
- Estado vacío del historial de seguridad: invitar a que, en cuanto haya una acción sensible, aparecerá ahí.

## 10. Casos límite y requisitos

| # | Requisito |
|---|---|
| 1 | La sucursal seleccionada al crear un miembro se guarda exactamente como se dejó en el formulario antes de cerrar; no debe quedar "Sin acceso" por error de guardado. |
| 2 | El campo "Cajas asignadas" solo se valida como obligatorio cuando el rol Cajero está marcado en ese momento; un Mesero sin ese rol se guarda sin pedirlo. |
| 3 | La navegación oculta las secciones que el rol no puede usar, además de redirigir si el miembro entra por URL directa a una pantalla no permitida. |

## 11. Criterios de aceptación

- Dado un miembro con roles `[WAITER]`, cuando entra con su PIN, cae en el panel de mesas y no ve en el menú lateral Menú, Caja ni Configuración (salvo Impresión).
- Dado un miembro con roles `[WAITER, CASHIER]`, cuando entra, puede navegar entre Mesas y POS sin redirección.
- Dado un formulario de miembro sin el rol Cajero marcado, cuando se guarda sin llenar "Cajas asignadas", se guarda sin error porque el campo no es visible ni obligatorio.
- Dado un correo ya usado por otro miembro, cuando se intenta guardar, se muestra el aviso de duplicado y no se guarda.
- Dado un evento de cancelación de pedido, cuando ocurre, aparece en el Historial de seguridad con miembro, fecha y enlace al pedido.

## 12. Tareas

| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M00-T01 | Migración: agregar `pin_hash`, `roles text[]`, `cash_register_ids uuid[]`, `email_login_enabled` a `restaurant_members`; backfill desde `role` sin quitar la columna actual | BD | db-architect | M | — | Migración aplicada; tipos regenerados; `role` sigue funcionando en paralelo |
| M00-T02 | Vista o tabla curada de eventos de seguridad sobre `audit_logs`, con RLS por restaurante | BD | db-architect | S | M00-T01 | Solo lectura para ADMIN/OWNER; no expone eventos de otros miembros a roles operativos |
| M00-T03 | RPC de verificación de PIN con límite de intentos | BD | db-architect | M | M00-T01 | Devuelve el miembro o un error genérico; no revela si el PIN existe |
| M00-T04 | Server action: guardar miembro con roles combinables y validación condicional de "Cajas asignadas" | Backend | general-purpose | M | M00-T01 | La validación solo exige los campos visibles según los roles marcados |
| M00-T05 | UI de alta/edición de miembro (roles como casillas, PIN con teclado numérico, vista previa) | Frontend | ui-caja | L | M00-T04 | Reproduce §7.1 con textos propios de Monky |
| M00-T06 | Matriz de permisos + redirección por rol + ocultar ítems de menú no permitidos | Frontend | general-purpose | M | M00-T01 | Cubre la tabla de §6 sin mostrar error al usuario |
| M00-T07 | UI de Historial de seguridad con filtros por acción y miembro | Frontend | reports-builder | M | M00-T02 | Estado vacío y filtros con textos propios de Monky |
| M00-T08 | Revisar cobertura de eventos sensibles ya instrumentados en `audit_logs` y sumar los que falten | Backend | money-backend | M | M00-T02, M07, M08 | Cada acción sensible relevante queda registrada con su detalle |
| M00-T09 | Revisión de seguridad: RLS de `restaurant_members` y de la vista de eventos, hash del PIN, no exponerlo en ninguna respuesta de API | QA | security-reviewer | S | M00-T01 a M00-T08 | Informe sin hallazgos críticos |
| M00-T10 | Tests SQL: unicidad de correo, PIN obligatorio, roles combinables | QA | test-writer | M | M00-T01 a M00-T06 | Suite en `app/supabase/tests` con `BEGIN`/`ROLLBACK` |

Basado en el relevamiento interno de funcionalidades del POS.
