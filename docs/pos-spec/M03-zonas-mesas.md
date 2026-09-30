# M03 · Zonas y mesas

## Estado en Monky

Hoy `tables` es una lista plana: `number`, `name`, `kind` (`TABLE`|`COUNTER`), `status` (`AVAILABLE`|`OCCUPIED`|`ATTENTION`|`BILL_REQUESTED`|`INACTIVE`) y `qr_token` (aleatorio, no adivinable — ya mejor que un id secuencial visible en la URL del QR). No existe ninguna tabla de zonas ni campos de posición/forma en `tables`. Este módulo es enteramente nuevo sobre el modelo existente; no reemplaza nada que ya funcione, solo agrega columnas y una tabla nueva.

## 1. Objetivo y alcance

**Entra:** zonas (agrupación de mesas con un plano en cuadrícula configurable), mesas con identificador, forma, tamaño y posición en el plano, edición visual del plano, mantener el `qr_token` aleatorio ya existente en Monky.

**No entra:** la sesión de mesa y el flujo de pedido (M04). El QR del lado del cliente. Transferir pedido entre mesas (se documenta en M04 porque opera sobre el pedido, pero depende de que M03 exista para listar mesas disponibles de la zona).

## 2. Dependencias

Modelo de restaurante, miembros y roles ya existente.

## 3. Datos

**Ya existe:** `tables` (`id`, `restaurant_id`, `number`, `name`, `kind`, `status`, `qr_token`), `table_sessions`.

**A crear:**

| Entidad | Campos | Notas |
|---|---|---|
| `zones` | `restaurant_id`, `name`, `grid_cols int default 7`, `grid_rows int default 5` | Tabla nueva |
| `tables` | agregar `zone_id`, `shape` (`square`\|`round`), `col int`, `row int`, `width_cells int default 1`, `height_cells int default 1` | Se agregan columnas nuevas; `qr_token` no se toca |

**Índices:** `tables(zone_id)`; el solapamiento de mesas de varias celdas (`width_cells`/`height_cells` > 1) se valida en el server action, no solo con una restricción SQL de unicidad.

**Migración:** las mesas actuales sin zona se agrupan automáticamente en una zona por defecto ("Salón" o "Zona 1") para no romper los QR ya impresos; los `qr_token` existentes no cambian.

## 4. Estados y transiciones

La mesa no tiene estado propio en este módulo (el estado operativo Disponible/Activa/Cuenta pertenece a la sesión de mesa, ver M04 §4). Aquí solo se gestiona su existencia y posición en el plano.

## 5. Reglas de negocio y cálculos

- Zona por defecto: 7 columnas × 5 filas.
- Mesa nueva: identificador consecutivo automático (editable), forma Cuadrada, tamaño 1×1.
- `width_cells`/`height_cells` siempre ≥ 1.
- Transferir pedido (regla de esta capa, ejecutada en M04): solo se listan mesas disponibles de la misma zona; el servidor valida que la mesa destino no tenga sesión activa antes de confirmar.

## 6. Permisos por rol

Dueño, Administrador y Gestor de Sucursal pueden crear/editar/borrar zonas y mesas desde Configuración → Zonas y mesas. Mesero, Cajero y Cocinero no acceden a esta configuración; solo ven el resultado en el panel de mesas (M04) y en Menú digital → Mesas para descargar el QR.

## 7. Pantallas

### 7.1 `Configuración → Zonas y mesas`

- Tabla de zonas: nombre (Editar/Borrar).
- **+ Nueva zona** (ejemplos: comedor principal, barra, terraza, primer piso) abre un editor de plano a pantalla completa:
  - Cabecera: Salir · nombre de la zona · Guardar.
  - Panel izquierdo: nombre de zona, columnas (deslizador + número), filas.
  - Panel derecho: cuadrícula con un botón "+" en cada celda vacía para agregar una mesa.
  - Mesa seleccionada: identificador de mesa, forma (Cuadrada/Redonda), ancho y altura (controles −/n/+, con acción "Expandir"), Borrar.

### 7.2 `Menú digital → Mesas` (referencia)

Por zona: botón "Ajustes" (enlaza al editor de §7.1) y cada mesa con su ícono de QR descargable.

## 8. Procesos paso a paso

Puesta en marcha: crear la zona, dibujar el plano y colocar las mesas; después, en Menú digital → Mesas, descargar el QR de cada mesa e imprimirlo.

## 9. Textos de la interfaz

- Estado vacío: "Organiza las zonas y mesas de tu negocio. Crea y posiciona las mesas justo como las tienes en tu negocio."
- Ejemplos de nombre de zona: "comedor principal, barra, terraza, primer piso".
- Control de tamaño: "Expandir".

## 10. Casos límite y requisitos

| # | Requisito |
|---|---|
| 1 | El QR de mesa usa siempre `qr_token` aleatorio; el plano nunca expone ni sustituye este token por un identificador secuencial adivinable. |
| 2 | Dos mesas no pueden ocupar la misma celda del plano: el editor bloquea el guardado con un aviso visual antes de confirmar. |
| 3 | No se puede borrar una zona mientras alguna de sus mesas tenga una sesión activa. |

## 11. Criterios de aceptación

- Dado el editor de plano, cuando se agrega una mesa en una celda vacía, entonces recibe identificador consecutivo automático, forma Cuadrada y tamaño 1×1 por defecto.
- Dado que se cambia el ancho de una mesa a 2 celdas, cuando se guarda, entonces ocupa 2 columnas contiguas en el plano sin solaparse con otra mesa.
- Dado que se transfiere un pedido, cuando se abre el selector de mesa destino, entonces solo aparecen mesas disponibles de la misma zona, con la actual marcada "(Actual)".
- Dado un `qr_token` existente, cuando se reorganiza el plano, entonces el token de esa mesa no cambia (el QR ya impreso sigue funcionando).

## 12. Tareas

| ID | Tarea | Tipo | Agente | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M03-T01 | Migración: tabla `zones` + columnas nuevas en `tables` (`zone_id`, `shape`, `col`, `row`, `width_cells`, `height_cells`) + zona por defecto para mesas existentes | BD | db-architect | M | — | `qr_token` de mesas existentes no cambia |
| M03-T02 | Validación server-side de solapamiento de mesas en el plano | Backend | general-purpose | M | M03-T01 | Rechaza guardar si dos mesas comparten celda |
| M03-T03 | Server actions: CRUD de zona y mesa (crear, mover, redimensionar, borrar) | Backend | general-purpose | M | M03-T01, M03-T02 | Reglas de §5 aplicadas |
| M03-T04 | UI editor de plano a pantalla completa (cuadrícula, deslizadores de columnas/filas, panel de mesa seleccionada) | Frontend | general-purpose | L | M03-T03 | Reproduce §7.1 |
| M03-T05 | UI lista de zonas en Configuración | Frontend | general-purpose | S | M03-T03 | Estado vacío con el texto de §9 |
| M03-T06 | Tests: no solapamiento, identificador automático, tamaño mínimo 1×1 | QA | test-writer | M | M03-T02, M03-T04 | Suite Vitest/Playwright |

Basado en el relevamiento interno de funcionalidades del POS.
