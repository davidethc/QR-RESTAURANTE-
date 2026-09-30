# M17 · Multi-sucursal

## Estado en Monky

**Ya existe:** ninguna separación empresa/sucursal. Monky hoy modela 1 restaurante = 1 entidad completa: la tabla `restaurants` guarda a la vez los datos de la empresa (nombre, configuración de cobro) y los de la operación (mesas, caja, pedidos), todo bajo un único `restaurant_id`. No existen tablas `companies` ni `branches`, ni un campo de sucursales por miembro.

**Es nuevo (todo el módulo):**
- Separar `Company` (empresa, catálogo compartido) de `Branch` (sucursal, operación propia).
- Migración estructural: cada restaurante actual de Monky se convierte en 1 `company` + 1 `branch` marcada como principal, sin perder datos ni cambiar URLs ni códigos QR existentes.
- Selector de sucursal, creación y borrado de sucursales.
- Miembros con acceso a una o varias sucursales.
- Ajuste de todas las políticas de acceso a datos (RLS) para filtrar correctamente por sucursal o por empresa según el tipo de dato.

Esta es la migración de mayor alcance del roadmap: toca prácticamente todas las tablas existentes. Debe diseñarse con `db-architect` y revisarse con `security-reviewer` antes de tocar producción, y aplicarse primero en `monky-qa`.

## 1. Objetivo y alcance

**Entra:** separar Empresa (catálogo compartido) de Sucursal (operación), crear y borrar sucursales, selector de sucursal, página pública con todas las sucursales de una empresa, aislamiento de datos operativos por sucursal, miembros con acceso a una o varias sucursales.

**No entra:** planes y límites comerciales por sucursal (se documentan como referencia en Configuración general).

## 2. Dependencias
Roles y miembros (con acceso por sucursal), Catálogo (compartido a nivel empresa), Zonas y mesas (por sucursal), Caja y cortes (por sucursal), Menú digital (por sucursal), Configuración general (Datos de sucursal).

## 3. Datos

**Migración estructural:**
| Cambio | Detalle |
|---|---|
| Separar `restaurants` en `companies` (nombre, divisa, país, slug raíz) y `branches` (empresa, alias, dirección, ubicación, logo, portada, si es la principal) | Toda tabla que hoy usa `restaurant_id` para datos **compartidos** (categorías, productos, variantes, personalizaciones, promociones) pasa a `company_id`; toda tabla de datos **propios de sucursal** (disponibilidad, cajas, cortes, movimientos, zonas, mesas, pedidos, menú digital, impresión, dispositivos) mantiene o pasa a `branch_id` |
| `members.branch_ids uuid[]` | Un miembro puede tener acceso a una, varias o todas las sucursales |

**Compartido entre sucursales (empresa):** categorías, productos, variantes, personalizaciones, promociones.
**Propio de cada sucursal:** disponibilidad, cajas, cortes y movimientos, zonas y mesas, pedidos, menú digital (activación, pausa, horarios, tiempos, pagos, envíos, WhatsApp), impresión y dispositivos.

## 4. Estados y transiciones
No aplica máquina de estados propia más allá de la existencia o el borrado de una sucursal.

## 5. Reglas de negocio y cálculos
- Crear sucursal: selector → "+ Crear sucursal" → Alias de sucursal y Dirección completa → Agregar sucursal. El panel **cambia solo** a la nueva sucursal creada.
- Borrar sucursal: solo estando dentro de esa sucursal → Datos de sucursal → Eliminar sucursal → confirmación **escribiendo el nombre** de la sucursal → vuelve a la sucursal principal.
- Un miembro puede tener acceso a una, varias o todas las sucursales (el dueño siempre a todas).
- El cliente puede ver una página pública con todas las sucursales de la empresa.

## 6. Permisos por rol
- Crear/borrar sucursal: solo Dueño.
- Editar datos de una sucursal existente: además del dueño, Gestor de Sucursal.
- Un miembro solo ve las sucursales listadas en su acceso (`branch_ids`).

## 7. Pantallas

### 7.1 Selector de sucursal (menú superior)
Configuración · lista de sucursales ("Sin alias (matriz)", otras) · **+ Crear sucursal** · correo de la cuenta · Cerrar sesión.

### 7.2 Datos de sucursal → Eliminar sucursal (extiende Configuración general §7.2)
"Borrar sucursal — No podrás deshacer esta acción. ¿Confirmas que deseas borrar la sucursal '<nombre>'?" con campo obligatorio para escribir el nombre exacto antes de habilitar el botón de confirmar.

### 7.3 Página pública de sucursales
Tarjeta por sucursal (alias o "Sucursal sin nombre", dirección, "Hacer pedido" o "Menú digital no disponible").

## 8. Procesos paso a paso
1. Crear: selector → "+ Crear sucursal" → Alias y Dirección completa → Agregar sucursal; el panel cambia solo a la nueva.
2. Miembros: asignar "Sucursales con acceso" (una, varias, o todas para el dueño).
3. Borrar: solo dentro de esa sucursal → Datos de sucursal → Eliminar sucursal → confirmar escribiendo el nombre → vuelve a la sucursal principal.

## 9. Textos de la interfaz
- "+ Crear sucursal"
- "Sin alias (matriz)"
- "Borrar sucursal — No podrás deshacer esta acción. ¿Confirmas que deseas borrar la sucursal '<nombre>'?"

## 10. Casos límite y requisitos
| # | Requisito |
|---|---|
| 1 | Borrar sucursal exige escribir el nombre exacto de la sucursal antes de habilitar el botón de confirmar — una sola confirmación no es suficiente, dado lo destructivo de la acción. |
| 2 | La migración de datos existentes (de "1 restaurante = 1 sucursal" a Empresa + Sucursal) debe conservar el `qr_token` de mesas, el slug y todo el historial de cada restaurante, sin pérdida de datos ni cambio de URLs o códigos QR vigentes. |

## 11. Criterios de aceptación
- Dado que se crea una sucursal nueva, cuando se guarda, entonces el panel cambia automáticamente a esa sucursal.
- Dado un producto creado en una sucursal, cuando se revisa desde otra sucursal de la misma empresa, entonces aparece en el catálogo (compartido), pero su disponibilidad es independiente por sucursal.
- Dado el flujo de borrado de sucursal, cuando se escribe un nombre distinto al real, entonces el botón de confirmar permanece deshabilitado.
- Dado un miembro con acceso a 2 de 3 sucursales, cuando entra al selector, entonces solo ve esas 2.
- Dado un restaurante existente de Monky (previo a la migración), cuando se aplica la migración de este módulo, entonces conserva su `qr_token` de mesas, su slug y todos sus datos históricos intactos.

## 12. Tareas
| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M17-T01 | Diseño de migración: separar `companies`/`branches`, mapeo de qué tablas pasan a `company_id` vs `branch_id` | BD | db-architect | L | Roles y miembros, Catálogo, Zonas y mesas, Caja y cortes | Documento de mapeo revisado por security-reviewer antes de ejecutar |
| M17-T02 | Migración estructural con backfill (cada restaurante actual → 1 empresa + 1 sucursal principal) | BD | db-architect | L | M17-T01 | Cero pérdida de datos verificada con conteos antes/después |
| M17-T03 | RPC: crear sucursal (cambia el contexto activo automáticamente) | BD | db-architect | M | M17-T02 | Verificado en UI |
| M17-T04 | RPC: borrar sucursal con confirmación de nombre exacto | BD | db-architect | M | M17-T02 | Confirmación por nombre exacto verificada |
| M17-T05 | UI selector de sucursal (crear, cambiar, "Sin alias (matriz)") | Frontend | general | M | M17-T03 | Reproduce §7.1 |
| M17-T06 | UI eliminar sucursal con campo de confirmación de nombre | Frontend | general | S | M17-T04 | Reproduce §7.2 |
| M17-T07 | Ajustar RLS de todas las tablas afectadas para filtrar por `branch_id`/`company_id` según corresponda | BD | db-architect | L | M17-T02 | Ningún dato cruza entre sucursales de distinta empresa ni se filtra el compartido incorrectamente |
| M17-T08 | Tests de migración: conteos antes/después, aislamiento entre sucursales, catálogo compartido | QA | test-writer | L | M17-T02, M17-T07 | Suite SQL con datos de `monky-qa` |
| M17-T09 | Revisión de seguridad de la migración y del nuevo esquema de RLS | QA | security-reviewer | L | M17-T02, M17-T07 | Informe sin hallazgos críticos antes de aplicar en producción |
| M17-T10 | QA en vivo: crear una segunda sucursal de prueba en `monky-qa` y verificar aislamiento | QA | qa-e2e | M | M17-T05, M17-T06 | Registrado en `app/TESTING.md` |

Basado en el relevamiento interno de funcionalidades del POS.
