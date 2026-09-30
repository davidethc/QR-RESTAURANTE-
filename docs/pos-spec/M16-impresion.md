# M16 · Impresión

## Estado en Monky

**Ya existe:** nada de impresión especializada todavía. Monky no imprime tickets, comandas ni cortes de caja hoy; no hay hoja de estilos de impresión ni configuración de impresión por sucursal.

**Es nuevo (todo el módulo):**
- Modo básico de impresión con `window.print()` y una hoja de estilos para ticket de 80mm.
- Personalización de tickets (tamaño de letra, encabezado, pie de página).
- Las cuatro plantillas: ticket de cliente, comanda de cocina, precuenta de mesa y corte de caja — todas deben construirse desde cero, usando los datos que ya existen en Cobro (`bills`, `record_payment`), Caja (`open_cash_session`, cortes) y Pedidos (`orders`, `order_items`).
- La impresión avanzada (Bluetooth/USB, impresión automática sin diálogo) queda fuera del MVP y se documenta como punto de extensión futuro.

## 1. Objetivo y alcance

**Entra:** modo básico de impresión (ticket de cliente, comanda de cocina, precuenta de mesa, corte de caja) con hoja de estilos de 80mm, personalización de tickets (tamaño de letra, encabezado, pie de página), vista previa en vivo.

**No entra en el MVP:** impresión avanzada con Bluetooth/USB e impresión automática sin diálogo (queda como punto de extensión futuro).

## 2. Dependencias
Pedido de mesa y comandas, Pedido de mostrador, Cobro, Caja y cortes.

## 3. Datos

**A crear:**
| Entidad | Campos | Notas |
|---|---|---|
| `printing_settings` | `restaurant_id`, `advanced_printing bool default false`, `os` (autodetectado, solo si avanzado), `connection` (`bluetooth`\|`usb`, solo si avanzado), `customer_ticket_font_size` (`small`\|`normal`\|`large`, default `normal`), `customer_ticket_header text`, `customer_ticket_footer text`, `kitchen_ticket_font_size` | El ticket debe poder incluir el logo del negocio desde el inicio, ya guardado en `restaurants.logo_url` |

## 4. Estados y transiciones
No aplica máquina de estados; es una configuración estática usada al momento de imprimir.

## 5. Reglas de negocio y cálculos
- **Modo básico:** `window.print()` con una hoja de estilos de impresión para ticket de 80mm.
- **Impresión avanzada** (fuera del MVP, documentar el punto de extensión): interruptor, sistema operativo autodetectado, método de conexión Bluetooth o cable USB (impresión automática: imprime sin diálogo al entrar el pedido, requiere app instalada).
- Personalización: ticket de cliente — tamaño de letra (Chica/Normal/Grande), texto de encabezado (debajo del nombre del negocio), texto de pie de página. Ticket de cocina/barra — tamaño de letra.
- Vista previa en vivo y aviso antes de salir sin guardar cambios.
- El ticket debe incluir el logo del negocio (usando `restaurants.logo_url`), no solo el nombre.

## 6. Permisos por rol
Todos los roles (Dueño, Administrador, Mesero, Cocina) tienen acceso a `Configuración → Impresión`, siendo esta la **única** sección de Configuración visible para los roles operativos.

## 7. Pantallas

### 7.1 `Configuración → Impresión` (`/ajustes/impresion`)
- Interruptor de impresión avanzada (fuera de MVP, mostrar como "Próximamente" mientras no se implemente).
- Ticket para cliente: tamaño de letra (Chica/Normal/Grande) · texto de encabezado · texto de pie de página.
- Ticket para cocina/barra: tamaño de letra.
- Vista previa en vivo.
- Aviso si se sale sin guardar.

## 8. Procesos paso a paso
Puesta en marcha del restaurante, paso de impresión: configurar tickets (encabezado, pie y tamaño) y, más adelante, la impresora (Bluetooth o USB para impresión automática, fuera de MVP).

## 9. Textos de la interfaz
Usar el texto existente de Monky donde ya exista una pantalla equivalente; para lo nuevo, redactar textos propios y breves con el mismo propósito que las etiquetas de §7.1.

Plantillas de referencia (contenido a reproducir con datos propios, no textos literales de terceros — los valores de ejemplo son inventados):

**Ticket del cliente (Imprimir pedido):**
```
[Nombre del restaurante]
[texto de encabezado]
29 sep 2026, 3:02 p.m.
#A1B2C
Folio #3
Mesa 4
Tomado en punto de venta
EN EL LOCAL
2 x Hamburguesa clásica                      $16.00
    "sin cebolla"
1 x Limonada grande                          $3.50
Transacción #1                               $15.00
  Efectivo recibido                          $20.00
  Cambio                                     $5.00
Transacción #2                               $4.50
  Cobrado en tarjeta                         $4.50
Productos                                    $19.50
Descuento                                   -($2.00)
Total                                        $17.50
Monto cobrado                                $17.50
[texto de pie de página]
```
En domicilio agrega "Envío $X" y el bloque de datos del cliente.

**Comanda de cocina (Imprimir comanda):**
```
29 sep 2026, 3:02 p.m.
#A1B2C
Folio #3
Mesa 4
Tomado por [miembro]
Comanda #1
EN EL LOCAL
2 x Hamburguesa clásica                      $16.00
    PUNTO: Término medio        (modificadores agrupados por grupo)
    EXTRAS: Queso extra
    "sin cebolla"
```

**Precuenta de mesa (Imprimir cuenta):**
```
[Nombre del restaurante] · fecha · #código · Folio #6 · Tomado en punto de venta
MESA 4 · Salón principal
[líneas con notas]
Productos $22.00 · Descuento -($2.00) · Monto a pagar $20.00
```

**Corte de caja (Imprimir corte):**
```
Corte de caja #5006 · 29 sep, 9:05 a.m.
Realizado por [miembro] · Caja [nombre]
Total efectivo retirado: $0
EFECTIVO   Calculado por sistema $120 · Contado manualmente $115 · Diferencia (faltante) -$5 · Fondo de caja -($50)
TARJETA    Calculado $80 · Contado $80 · Diferencia $0
TRANSFER.  Calculado por sistema $30
SALIDAS DE EFECTIVO
  "compra de insumos"                        $15
Total de salidas                             $15
________________________
Firma de responsable
```

## 10. Casos límite y requisitos
| # | Requisito |
|---|---|
| 1 | El ticket incluye el logo del negocio desde el inicio (no solo texto), usando el logo ya configurado en Datos de sucursal. |

## 11. Criterios de aceptación
- Dado un ticket de cliente con encabezado y pie configurados, cuando se imprime un pedido, entonces el contenido coincide con la plantilla de §9 (sustituyendo los datos reales).
- Dado un cambio en el tamaño de letra sin guardar, cuando se intenta salir de la pantalla, entonces aparece el aviso de cambios sin guardar.
- Dado el logo configurado en Datos de sucursal, cuando se imprime cualquier ticket, entonces aparece en la cabecera.
- Dado un pedido de domicilio, cuando se imprime el ticket, entonces incluye la línea "Envío $X" y el bloque de datos del cliente.

## 12. Tareas
| ID | Tarea | Tipo | Agente sugerido | Tamaño | Depende de | Criterio de hecho |
|---|---|---|---|---|---|---|
| M16-T01 | Migración: tabla `printing_settings` por restaurante | BD | db-architect | S | — | Defaults: Normal, sin encabezado ni pie |
| M16-T02 | Hoja de estilos de impresión de 80mm (`@media print`) | Frontend | general | M | — | Verificado en vista previa e impresión real de navegador |
| M16-T03 | Plantilla de ticket de cliente con logo, encabezado, pie y bloque de domicilio | Frontend | general | M | M16-T01, Cobro | Coincide con la plantilla de §9 |
| M16-T04 | Plantilla de comanda de cocina (modificadores agrupados por grupo, notas) | Frontend | general | M | M16-T01, Pedido de mesa | Coincide con la plantilla de §9 |
| M16-T05 | Plantilla de precuenta de mesa | Frontend | general | S | M16-T01, Pedido de mesa | Coincide con la plantilla de §9 |
| M16-T06 | Plantilla de corte de caja con firma | Frontend | general | S | M16-T01, Caja y cortes | Coincide con la plantilla de §9 |
| M16-T07 | UI Configuración → Impresión (tamaño, encabezado, pie, vista previa, aviso de cambios sin guardar) | Frontend | general | M | M16-T01 | Reproduce §7.1 |
| M16-T08 | Tests visuales/snapshot de las cuatro plantillas de impresión | QA | test-writer | M | M16-T02..T06 | Snapshot compara contra el texto de §9 |

Basado en el relevamiento interno de funcionalidades del POS.
