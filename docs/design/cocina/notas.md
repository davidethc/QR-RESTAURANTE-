# Cocina v2 — notas de diseño

Misma identidad que Caja v2 (`data-caja` en el `<main>`): fondo pizarra, tarjetas blancas con borde `#E2E8F0`, colores semánticos siempre con icono + texto.

## Pantalla

- **Franja de estado** (`StatusStrip`): "Cocina" con cuántas comandas hay por preparar, y una tarjeta por cifra del semáforo: A tiempo (verde), Demoradas (ámbar, desde el umbral "demorada" de los ajustes) y Atrasadas (rojo, desde el umbral "atrasada"). Por debajo de 1280 px de ancho, las acciones bajan a su propia fila para que ninguna cifra quede cortada.
- **Acciones**: Tiempos (solo dueño o administrador; abre los umbrales debajo de la franja, sin diálogo), Historial y pantalla completa. El "en vivo" aparece una sola vez, en la barra superior del panel.
- **Comandas** en orden de llegada (la más vieja primero), en una cuadrícula de tarjetas de al menos 19,5 rem: tres columnas a 1280 px y dos a 1024 px.

## Tarjeta de comanda

- Banda superior: icono del servicio (mesa, para llevar, domicilio, en el local), lugar en letra grande y cronómetro con icono + texto (A tiempo / Demorada / Atrasada). La banda y el marco cambian a ámbar o rojo con el cronómetro.
- Fila de datos: pedido y número de comanda, "Nueva", cliente, quién la tomó y la hora de entrada.
- Productos: cantidad en un recuadro oscuro, nombre en `text-xl`, variante en gris, extras como chips y notas en ámbar con icono.
- Botón grande verde "Comanda lista" (mismo `completeTicket` de antes). En el historial, "Devolver a preparación" es secundario (borde).
- Solo la cabecera se vuelve a pintar cada segundo (`useNow("second")`, reloj compartido). Las cifras de la franja usan `useNow("minute")`.

## Necesita funcionalidad nueva (no se hizo)

- **Carriles por estado** (Nueva → En preparación → Lista): hoy una comanda solo puede estar `pending` o `completed`, y las únicas transiciones son completar y devolver a preparación. Iniciar la preparación o marcarla como lista por separado necesita un estado nuevo en la base y RPCs nuevas.
- **Cifra "En preparación"**: por la misma razón.
