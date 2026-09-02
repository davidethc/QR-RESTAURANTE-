# FASE UX — WIREFRAMES DEL CLIENTE MOBILE

## 1. Objetivo

Diseñar la experiencia completa que tendrá el cliente desde el momento en que escanea el QR hasta que finaliza su interacción con el restaurante.

Esta fase no define todavía colores, tipografías ni tecnología.

El objetivo es definir:

- Estructura de cada pantalla.
- Información que verá el cliente.
- Botones y acciones.
- Navegación.
- Jerarquía de información.
- Estados.
- Errores.
- Comportamiento en celular.

La experiencia debe poder utilizarse de manera intuitiva sin necesidad de explicación por parte del personal.

---

# 2. Principio principal

El cliente utilizará principalmente un teléfono móvil.

Por lo tanto:

> **La experiencia del cliente será diseñada Mobile First.**

La interfaz debe funcionar cómodamente en:

- Smartphones pequeños.
- Smartphones grandes.
- Diferentes sistemas operativos.
- Diferentes navegadores.

La versión de escritorio será secundaria para esta experiencia.

---

# 3. Flujo general del cliente

```text
ESCANEAR QR
     ↓
VALIDAR RESTAURANTE + MESA
     ↓
CARTA PRINCIPAL
     ↓
EXPLORAR CATEGORÍAS
     ↓
VER PRODUCTO
     ↓
AGREGAR AL CARRITO
     ↓
REVISAR CARRITO
     ↓
CONFIRMAR PEDIDO
     ↓
PEDIDO ENVIADO
     ↓
SEGUIMIENTO
```

El cliente también podrá realizar acciones paralelas:

```text
CARTA
 ├── Buscar productos
 ├── Llamar mesero
 ├── Solicitar cuenta
 └── Ver carrito
```

---

# 4. Pantalla 01 — Entrada mediante QR

## Objetivo

Identificar el restaurante y la mesa antes de mostrar la carta.

El QR estará asociado a:

- Restaurante.
- Mesa.
- Estado de la mesa o QR.

Ejemplo conceptual:

```text
┌───────────────────────────┐
│                           │
│          LOGO             │
│                           │
│   LA CASA DEL SABOR       │
│                           │
│        MESA 07            │
│                           │
│      Cargando carta...    │
│                           │
└───────────────────────────┘
```

### Resultado esperado

Si todo es correcto:

```text
QR
 ↓
Validación
 ↓
Carta
```

---

# 5. Estados de entrada QR

## QR válido

Continúa automáticamente a la carta.

## QR inválido

```text
QR no válido

Este código no corresponde
a una mesa activa.

[ VOLVER ]
```

## Mesa desactivada

```text
Mesa no disponible

Consulta con el personal
del restaurante.

[ VOLVER ]
```

## Restaurante cerrado

```text
Restaurante cerrado

Horario:
11:00 — 22:00

[ VOLVER ]
```

---

# 6. Pantalla 02 — Carta principal

Esta será la pantalla más importante de toda la experiencia del cliente.

Debe permitir acceder rápidamente a la información principal.

### Estructura conceptual

```text
┌───────────────────────────┐
│            LOGO           │
│                           │
│ La Casa del Sabor         │
│ Mesa 07                   │
│                           │
│ [ 🔎 Buscar productos ]   │
│                           │
│ [Entradas] [Principales]  │
│ [Bebidas]  [Postres]      │
│                           │
│ DESTACADOS                │
│                           │
│ ┌───────────────────────┐ │
│ │        FOTO           │ │
│ │                       │ │
│ │ Hamburguesa Especial  │ │
│ │ Carne + queso...      │ │
│ │ $7.50            [+]  │ │
│ └───────────────────────┘ │
│                           │
│ ┌───────────────────────┐ │
│ │        FOTO           │ │
│ │ Pizza Especial        │ │
│ │ $10.00           [+]  │ │
│ └───────────────────────┘ │
│                           │
│ 🛎️ Llamar mesero          │
│ 🛒 Carrito (2)            │
└───────────────────────────┘
```

---

# 7. Elementos de la carta

La carta deberá poder mostrar:

- Logo.
- Nombre del restaurante.
- Mesa.
- Descripción.
- Buscador.
- Categorías.
- Productos.
- Fotografías.
- Precio.
- Disponibilidad.
- Carrito.
- Llamar mesero.
- Solicitar cuenta.

No todos estos elementos deben ocupar la misma importancia visual.

---

# 8. Navegación de categorías

Las categorías permiten desplazarse rápidamente por el menú.

Ejemplo:

```text
[Entradas]
[Platos fuertes]
[Hamburguesas]
[Bebidas]
[Postres]
```

La navegación debe ser fácil de tocar en celulares.

Las categorías podrían mostrarse horizontalmente mediante scroll.

---

# 9. Pantalla 03 — Categoría

Al seleccionar una categoría:

```text
← Entradas

┌──────────────────────────┐
│ FOTO                     │
│ Patacones                │
│ Con queso y salsa        │
│ $4.00               [+]  │
└──────────────────────────┘

┌──────────────────────────┐
│ FOTO                     │
│ Ceviche                  │
│ Ceviche de camarón       │
│ $6.00               [+]  │
└──────────────────────────┘
```

Cada producto debe permitir entrar a su detalle.

---

# 10. Pantalla 04 — Detalle del producto

Esta pantalla aparece cuando el cliente necesita conocer más información o personalizar el producto.

Debe poder incluir:

- Fotografía.
- Nombre.
- Descripción.
- Precio.
- Variantes.
- Extras.
- Ingredientes.
- Cantidad.
- Observaciones.

Ejemplo:

```text
┌───────────────────────────┐
│ ←                         │
│                           │
│       FOTO PRODUCTO       │
│                           │
│ Hamburguesa Especial      │
│ $7.50                     │
│                           │
│ Carne artesanal, queso,   │
│ lechuga y salsa de casa.  │
│                           │
│ Extras                    │
│ □ Queso +$1               │
│ □ Tocino +$1.50           │
│                           │
│ Sin ingredientes          │
│ □ Cebolla                 │
│                           │
│ Observaciones             │
│ [____________________]     │
│                           │
│ Cantidad                  │
│ [-] 1 [+]                 │
│                           │
│ [ AGREGAR AL PEDIDO ]     │
└───────────────────────────┘
```

---

# 11. Regla importante del detalle de producto

No todos los productos necesitan configuraciones.

El sistema debe permitir:

### Producto simple

```text
Coca-Cola
$2.00

[ AGREGAR ]
```

### Producto configurable

```text
Pizza

Tamaño
○ Pequeña
○ Mediana
○ Grande

Ingredientes
□ Jamón
□ Queso
□ Champiñones

[ AGREGAR ]
```

La interfaz debe adaptarse al producto.

---

# 12. Producto agotado

Cuando un administrador desactive un producto:

```text
Hamburguesa Especial

Actualmente no disponible.
```

No debe poder añadirse al carrito.

El sistema debe evitar que un cliente pueda enviar un pedido con un producto que ya no está disponible.

---

# 13. Pantalla 05 — Carrito

El carrito debe ser fácil de revisar.

```text
MI PEDIDO

Mesa 07

2 × Hamburguesa Especial
$15.00

1 × Coca-Cola
$2.00

------------------

Subtotal
$17.00

[ + AGREGAR MÁS ]

[ CONTINUAR ]
```

Debe mostrar claramente:

- Producto.
- Cantidad.
- Precio.
- Modificaciones.
- Subtotal.
- Total.
- Mesa.

---

# 14. Edición desde el carrito

El cliente debe poder:

- Aumentar cantidad.
- Reducir cantidad.
- Eliminar producto.
- Volver al detalle.
- Agregar productos.

Ejemplo:

```text
Hamburguesa Especial

[-] 2 [+]

[Eliminar]
```

---

# 15. Prevención de pedido accidental

Antes de enviar el pedido deberá existir una pantalla de confirmación.

Esto evita que un toque accidental genere inmediatamente una orden.

---

# 16. Pantalla 06 — Confirmación

```text
CONFIRMAR PEDIDO

Mesa 07

2 × Hamburguesa Especial
1 × Coca-Cola

Total: $17.00

Revisa tu pedido antes
de enviarlo.

[ VOLVER ]
[ ENVIAR PEDIDO ]
```

Al pulsar:

**ENVIAR PEDIDO**

el sistema deberá bloquear temporalmente acciones para evitar doble envío.

---

# 17. Estado — Enviando pedido

Durante el envío:

```text
Enviando pedido...

No cierres esta ventana.
```

El botón no debe poder pulsarse repetidamente.

---

# 18. Pantalla 07 — Pedido enviado

```text
✓ PEDIDO ENVIADO

Pedido #128

Mesa 07

El restaurante recibió
tu pedido.

[ VER ESTADO ]
[ VOLVER A LA CARTA ]
```

El cliente debe recibir confirmación clara.

---

# 19. Pantalla 08 — Seguimiento del pedido

El cliente podrá consultar el estado actual.

```text
PEDIDO #128

Mesa 07

✓ Pedido enviado
✓ Pedido aceptado
● En preparación
○ Listo
○ Entregado
```

Los estados deben actualizarse sin que el cliente tenga que realizar acciones complicadas.

---

# 20. Estados visibles del pedido

El cliente podrá observar:

```text
PENDIENTE
↓
ACEPTADO
↓
EN PREPARACIÓN
↓
LISTO
↓
ENTREGADO
```

Si se rechaza:

```text
PENDIENTE
↓
RECHAZADO
```

---

# 21. Pedido rechazado

La pantalla debe explicar claramente el resultado.

```text
PEDIDO NO ACEPTADO

Lo sentimos, el restaurante
no pudo aceptar tu pedido.

Motivo:
Producto no disponible.

[ VOLVER A LA CARTA ]
```

La información mostrada dependerá de la razón proporcionada por el restaurante.

---

# 22. Pedido listo

Cuando cocina marque el pedido como listo:

```text
✓ TU PEDIDO ESTÁ LISTO

Pedido #128

Un mesero llevará tu pedido
a la Mesa 07.
```

Esto informa al cliente del progreso.

---

# 23. Pedido entregado

Una vez que el mesero entregue:

```text
✓ PEDIDO ENTREGADO

Pedido #128

Esperamos que disfrutes
tu comida.
```

Posteriormente podrá utilizarse esta pantalla para solicitar valoración.

---

# 24. Pantalla 09 — Llamar al mesero

Esta acción deberá estar disponible desde la experiencia principal.

Botón:

```text
🛎️ Llamar al mesero
```

Al pulsarlo:

```text
¿Necesitas ayuda?

Mesa 07

[ CONFIRMAR ]
[ CANCELAR ]
```

---

# 25. Solicitud enviada

```text
✓ SOLICITUD ENVIADA

Un mesero ha sido avisado.

Mesa 07
```

La pantalla puede permitir volver a la carta mientras la solicitud permanece pendiente.

---

# 26. Prevención de solicitudes duplicadas

Si una solicitud ya está pendiente:

```text
Ya existe una solicitud
de atención para esta mesa.

Un mesero ha sido avisado.
```

Esto evita que el cliente pulse varias veces y genere muchas solicitudes.

---

# 27. Pantalla 10 — Solicitar cuenta

Desde la experiencia de mesa:

```text
💳 Solicitar cuenta
```

Al pulsar:

```text
SOLICITAR CUENTA

Mesa 07

¿Deseas solicitar la cuenta?

[ SOLICITAR ]
[ CANCELAR ]
```

---

# 28. Cuenta solicitada

```text
✓ SOLICITUD ENVIADA

El mesero llevará la cuenta
a tu mesa.
```

La función no implica necesariamente pago digital dentro del MVP.

---

# 29. Navegación inferior

Se evaluará una navegación fija para las acciones frecuentes.

Una propuesta:

```text
┌────────────────────────────┐
│                            │
│          CONTENIDO         │
│                            │
├────────────────────────────┤
│ Carta │ 🛎️ │ 🛒 │ Cuenta   │
└────────────────────────────┘
```

La navegación final se definirá durante el diseño visual para evitar saturar la pantalla.

---

# 30. Carrito persistente

Mientras el cliente navega por la carta, el carrito debe permanecer accesible.

Ejemplo:

```text
┌────────────────────────────┐
│ 🛒 Tu pedido       3 items │
└────────────────────────────┘
```

Debe evitar ocupar demasiado espacio.

---

# 31. Buscador

El buscador permitirá encontrar productos rápidamente.

Ejemplo:

```text
[ 🔎 Buscar hamburguesas... ]
```

Resultados:

```text
Hamburguesa Especial
$7.50

Hamburguesa BBQ
$8.00
```

Si no existe:

```text
No encontramos productos
con ese nombre.
```

---

# 32. Estado sin productos

Si una categoría está vacía:

```text
Esta categoría todavía
no tiene productos.
```

La experiencia debe poder regresar a otras categorías.

---

# 33. Estado de restaurante cerrado

Si el cliente entra fuera de horario:

```text
RESTAURANTE CERRADO

Nuestro horario:

Lunes — Viernes
11:00 — 22:00

Puedes consultar nuestra
carta, pero los pedidos
no están disponibles.
```

La decisión de permitir consultar la carta cuando está cerrado se podrá configurar posteriormente.

---

# 34. Estado sin conexión

Si el cliente pierde conexión:

```text
No hay conexión

Comprueba tu conexión
e inténtalo nuevamente.

[ REINTENTAR ]
```

Los pedidos no deben marcarse como enviados hasta que el servidor confirme la operación.

---

# 35. Error al enviar pedido

Si falla el envío:

```text
No pudimos enviar tu pedido.

Tu pedido todavía no fue
registrado por el restaurante.

[ REINTENTAR ]
[ REVISAR PEDIDO ]
```

No se debe decir que el restaurante recibió el pedido si no existe confirmación del servidor.

---

# 36. Prevención de pedidos duplicados

Cuando se pulse:

**ENVIAR PEDIDO**

el sistema deberá:

1. Deshabilitar el botón.
2. Mostrar estado de carga.
3. Crear una única operación.
4. Esperar confirmación.
5. Mostrar el número de pedido.

Nunca deberá mostrar:

> Pedido enviado

si no existe confirmación real.

---

# 37. Productos que cambian mientras están en el carrito

Caso:

El cliente añade:

```text
Hamburguesa $7.50
```

Después el restaurante cambia el precio.

Cuando el cliente intente enviar el pedido, el sistema deberá volver a verificar:

- Disponibilidad.
- Precio.
- Opciones.
- Productos eliminados.

Si hay cambios:

```text
Tu pedido necesita una actualización.

Hamburguesa Especial
Precio actualizado: $8.00

[ REVISAR ]
```

---

# 38. Dos clientes utilizando la misma mesa

El sistema debe permitir que varias personas utilicen el mismo QR.

Ejemplo:

```text
Mesa 07

Cliente A
Pedido #125

Cliente B
Pedido #126

Cliente C
Pedido #127
```

Los pedidos estarán asociados a la misma mesa.

En fases posteriores podremos estudiar funcionalidades para agrupar cuentas.

---

# 39. Sesión de mesa

El cliente debe saber siempre dónde está:

```text
Mesa 07
```

Esta información debe estar disponible sin necesidad de volver a escanear.

---

# 40. Error de QR compartido

Si una persona escanea un QR desde fuera del restaurante, el sistema no debe romperse.

El comportamiento exacto de validación de mesa se definirá posteriormente.

Para el MVP:

- El QR identifica restaurante.
- El QR identifica mesa.
- El servidor valida que el QR sea válido.

---

# 41. Principios visuales

La experiencia deberá priorizar:

### Claridad

El cliente debe entender qué puede hacer.

### Jerarquía

El producto y el precio deben ser fáciles de localizar.

### Imágenes

Las fotografías deben mejorar la decisión de compra.

### Espaciado

Los elementos deben tener suficiente espacio para tocarse.

### Botones

Los botones principales deben ser claramente identificables.

### Consistencia

El mismo tipo de acción debe verse de manera similar en todo el sistema.

---

# 42. Accesibilidad

La interfaz deberá considerar:

- Tamaños de texto legibles.
- Contraste adecuado.
- Áreas táctiles suficientes.
- No depender exclusivamente del color.
- Etiquetas comprensibles.
- Estados claramente diferenciados.

---

# 43. Reglas de navegación

El cliente siempre debe poder:

- Volver.
- Ir a la carta.
- Ver carrito.
- Ver estado del pedido.
- Solicitar atención.

No se debe permitir que el usuario termine atrapado en una pantalla.

---

# 44. Regla de minimización de pasos

Para realizar un pedido:

```text
Carta
 ↓
Producto
 ↓
Agregar
 ↓
Carrito
 ↓
Confirmar
 ↓
Enviar
```

El proceso debe mantenerse corto.

No agregar pantallas intermedias sin necesidad.

---

# 45. Experiencia objetivo

La experiencia ideal deberá sentirse así:

```text
ESCANEO
   ↓
"Ya estoy dentro"
   ↓
"Encuentro lo que quiero"
   ↓
"Lo agrego"
   ↓
"Confirmo"
   ↓
"El restaurante ya recibió mi pedido"
   ↓
"Veo qué está pasando"
   ↓
"Me entregan mi pedido"
```

La sensación buscada es:

> **Simple, rápida y sin complicaciones.**

---

# 46. Wireframe global

```text
                 QR
                  │
                  ▼
          VALIDAR MESA
                  │
                  ▼
              CARTA
          ┌───────┼─────────┐
          │       │         │
          ▼       ▼         ▼
      CATEGORÍAS BUSCAR   ACCIONES
          │                 │
          ▼          ┌──────┼──────┐
      PRODUCTOS       ▼      ▼      ▼
          │        CARRITO MESERO CUENTA
          ▼
       PRODUCTO
          │
          ▼
       CARRITO
          │
          ▼
     CONFIRMACIÓN
          │
          ▼
     PEDIDO ENVIADO
          │
          ▼
      SEGUIMIENTO
          │
          ▼
     PEDIDO LISTO
          │
          ▼
       ENTREGADO
```

---

# 47. Resultado esperado de esta fase

Al terminar esta fase tendremos definido:

- Flujo del cliente.
- Pantallas principales.
- Navegación.
- Acciones.
- Estados.
- Errores.
- Casos especiales.
- Comportamiento móvil.
- Prioridades de información.

Todavía no se definirá:

- Tecnología.
- Base de datos.
- Arquitectura de backend.
- Código.
- Integraciones.

---

# 48. Estado del proyecto

```text
✅ Idea
✅ Problema
✅ Propuesta de valor
✅ Público objetivo
✅ Roles
✅ Flujo operativo
✅ Mapa de pantallas
✅ Wireframes conceptuales del cliente

⏳ Wireframes detallados del mesero
⏳ Wireframes detallados de cocina
⏳ Wireframes detallados del administrador
⏳ UI visual
⏳ Reglas de negocio definitivas
⏳ Modelo de datos
⏳ Arquitectura técnica
⏳ Desarrollo
```

---

# 49. Próxima fase

La siguiente fase será:

# WIREFRAMES UX — MESERO

Se diseñarán:

```text
LOGIN
 ↓
DASHBOARD
 ↓
PEDIDOS NUEVOS
 ↓
DETALLE DEL PEDIDO
 ├── ACEPTAR
 └── RECHAZAR
 ↓
PEDIDOS ACTIVOS
 ↓
SOLICITUDES
 ↓
MESAS
 ↓
DETALLE DE MESA
```

La interfaz del mesero deberá estar orientada a **velocidad y atención**, con prioridad absoluta para pedidos y solicitudes pendientes.

Después continuaremos con:

```text
MESERO
  ↓
COCINA
  ↓
ADMINISTRADOR
  ↓
REGLAS DE NEGOCIO
  ↓
MODELO DE DATOS
  ↓
ARQUITECTURA
```