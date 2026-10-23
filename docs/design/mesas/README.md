# Rediseño de Mesas (Ola 2)

Mesas toma la identidad de la nueva Caja: paleta slate (`data-caja`), franja de cifras arriba, bloques separados con borde y color, y una sola acción grande por panel.

## Sala (`/tables`)

- **Cabecera**: cuatro cifras en tarjetas propias (Libres, Ocupadas, Por cobrar, Piden atención). Las herramientas del dueño (Link de carta, PDF de QR, + Mesas) y el Historial van a la derecha.
- **Zonas**: control segmentado cuando hay más de una. Vista **Tarjetas** (por defecto) o **Plano** (posiciones guardadas de la zona, desde tablet).
- **Leyenda** fija con los cinco estados. Cada estado lleva color, icono y texto:

| Estado | Tono | Icono |
|---|---|---|
| Libre | neutro | sillón |
| Ocupada | azul (info) | personas |
| QR pendiente | ámbar | código QR |
| Pide cuenta | ámbar | recibo |
| Llamando al mesero | rojo | campana |

- **Tarjeta de mesa**: nombre, estado principal (el más urgente pinta la tarjeta; los demás salen como iconos pequeños), consumo y minutos desde el pedido más antiguo que sigue en curso (sale del almacén en vivo, sin canal nuevo).
- **Panel de la mesa**: a la derecha en tablet y escritorio, hoja completa en teléfono. Sin menús ni diálogos encima de la hoja: transferir, cancelar, rechazar un pedido del QR, liberar y forzar cierre se abren como pasos dentro del mismo panel, con "Volver".
  - Libre: **Abrir mesa**.
  - Ocupada: **Agregar productos / Tomar pedido** (principal), Ver cuenta, Transferir, Cancelar pedido, y según el rol Cobrar y liberar (abre la hoja de cobro de Caja), Liberar mesa o Forzar cierre.
  - Pide cuenta: **Cobrar y liberar** pasa a ser la acción principal; aparece Reabrir mesa.
  - QR pendiente: Aprobar / Rechazar en la tarjeta del pedido.
  - Llamando al mesero: aviso rojo con **Atender en Pedidos** (abre la solicitud filtrada por mesa).
  - Mesero con cobro activo: "Cobra el administrador" (mismo permiso de antes).

## Tomar pedido (`/tables/[id]/order`)

Mismo constructor que "Nuevo pedido" de Caja: categorías a la izquierda (pestañas en teléfono) con "Más pedidos" primero, productos en tarjetas grandes (un toque agrega si no hay variantes ni extras), la comanda siempre visible a la derecha (cajón "Ver comanda" en teléfono) y un botón grande **Enviar a cocina**. Lo ya enviado vive en la pestaña **Ya enviado** (editar, cancelar con motivo, imprimir). Salir con productos sin enviar pide confirmación.

## Capturas

`v2/` a 1280, 1024 y 390 px: sala, mesa ocupada, transferir, mesa libre, plano, vista del mesero, mesa llamando, tomar pedido, comanda, cajón, ya enviado, salir sin enviar y la solicitud abierta desde Mesas.
