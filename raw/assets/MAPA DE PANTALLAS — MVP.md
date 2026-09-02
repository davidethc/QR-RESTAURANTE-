# MAPA DE PANTALLAS — MVP
## Sistema Digital de Atención y Pedidos para Restaurantes

---

# 1. Estructura general

El sistema estará dividido en cuatro experiencias:

```text
                    PLATAFORMA
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
      CLIENTE         STAFF        ADMINISTRADOR
                         │
                    ┌────┴────┐
                    ▼         ▼
                  MESERO    COCINA
```

El **cliente** no necesita iniciar sesión.

El personal del restaurante sí deberá autenticarse.

---

# 2. Experiencia del cliente

El cliente entra mediante un QR específico de una mesa.

### Flujo principal

```text
QR
 ↓
Validación
 ↓
Carta
 ↓
Categoría
 ↓
Producto
 ↓
Carrito
 ↓
Confirmación
 ↓
Pedido
 ↓
Seguimiento
```

---

# 3. Pantalla: Entrada por QR

## Objetivo

Identificar:

- Restaurante.
- Mesa.
- Estado del restaurante.

Ejemplo:

```text
┌──────────────────────┐
│                      │
│       LOGO           │
│                      │
│   LA CASA DEL SABOR  │
│                      │
│       Mesa 07        │
│                      │
│    Cargando menú...  │
│                      │
└──────────────────────┘
```

### Posibles estados

#### Correcto

Continúa hacia la carta.

#### QR inválido

```text
QR no válido

Este código no corresponde
a una mesa activa.

[ Volver ]
```

#### Mesa desactivada

```text
Mesa no disponible.

Consulta con el personal
del restaurante.
```

#### Restaurante cerrado

```text
Restaurante cerrado.

Horario:
11:00 – 22:00
```

---

# 4. Pantalla principal — Carta

Esta será probablemente la pantalla **más importante visualmente de todo el proyecto**.

Debe estar diseñada primero para celulares.

Estructura:

```text
┌───────────────────────────┐
│ ←                         │
│        LOGO               │
│                           │
│ La Casa del Sabor         │
│                           │
│ [ 🔎 Buscar productos ]   │
│                           │
│ [Entradas] [Platos]       │
│ [Bebidas]  [Postres]      │
│                           │
│ DESTACADOS                │
│                           │
│ ┌───────────────────────┐ │
│ │       FOTO            │ │
│ │                       │ │
│ │ Hamburguesa Especial  │ │
│ │ Carne + queso...      │ │
│ │ $7.50            [+]  │ │
│ └───────────────────────┘ │
│                           │
│ 🛎️ Llamar mesero          │
│                           │
│ 🛒 Carrito (2)            │
└───────────────────────────┘
```

---

# 5. Elementos de la carta

Debe mostrar:

- Logo.
- Nombre.
- Descripción del restaurante.
- Buscador.
- Categorías.
- Productos.
- Fotografías.
- Precio.
- Disponibilidad.
- Carrito.
- Llamar mesero.

El botón de carrito debería permanecer fácilmente accesible.

---

# 6. Pantalla de categoría

Ejemplo:

```text
ENTRADAS

← Volver

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

---

# 7. Pantalla de detalle de producto

Aquí se muestran todos los detalles.

```text
┌───────────────────────────┐
│ ←                         │
│                           │
│        FOTO PRODUCTO      │
│                           │
│ Hamburguesa Especial      │
│ $7.50                     │
│                           │
│ Carne artesanal, queso,   │
│ lechuga y salsa de casa.  │
│                           │
│ Tamaño                    │
│ ○ Normal                  │
│ ○ Grande +$2              │
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

# 8. Producto agotado

Si el producto deja de estar disponible:

```text
Hamburguesa Especial

Actualmente no disponible.
```

El botón:

**AGREGAR**

queda deshabilitado.

---

# 9. Pantalla carrito

Debe ser extremadamente clara.

```text
MI PEDIDO

Mesa 07

2 × Hamburguesa Especial
$15.00

1 × Coca-Cola
$2.00

----------------

Subtotal
$17.00

[ + Agregar más productos ]

[ CONTINUAR ]
```

---

# 10. Revisión del pedido

Antes de enviarlo:

```text
CONFIRMAR PEDIDO

Mesa 07

2 × Hamburguesa Especial
1 × Coca-Cola

Total: $17.00

⚠️ Revisa tu pedido antes
de enviarlo.

[ VOLVER ]
[ ENVIAR PEDIDO ]
```

---

# 11. Pedido enviado

```text
✓ PEDIDO ENVIADO

Pedido #128

Mesa 07

El restaurante recibió
tu pedido.

[ VER ESTADO ]
[ VOLVER A LA CARTA ]
```

---

# 12. Estado del pedido

El cliente podrá consultar:

```text
PEDIDO #128

Mesa 07

✓ Pedido recibido
✓ Pedido aceptado
● Preparando
○ Listo
○ Entregado
```

Posteriormente se pueden añadir tiempos estimados.

---

# 13. Pedido rechazado

```text
PEDIDO NO ACEPTADO

Lo sentimos, el restaurante
no pudo aceptar tu pedido.

Motivo:
Producto no disponible.

[ VOLVER A LA CARTA ]
```

La experiencia debe permitir que el cliente intente nuevamente.

---

# 14. Llamar al mesero

Este botón debe estar disponible desde la carta.

Al pulsar:

```text
¿Necesitas ayuda?

🛎️ Solicitar atención

Mesa 07

[ CONFIRMAR ]
[ CANCELAR ]
```

---

# 15. Solicitud enviada

```text
✓ SOLICITUD ENVIADA

Un mesero ha sido avisado.

Mesa 07

[ VOLVER ]
```

---

# 16. Solicitud atendida

```text
✓ ATENCIÓN CONFIRMADA

El mesero atenderá tu mesa.
```

No necesitamos que el cliente permanezca mirando la pantalla.

---

# 17. Solicitar cuenta

Desde la carta o una sección de mesa:

```text
💳 SOLICITAR CUENTA

Mesa 07

¿Deseas solicitar la cuenta?

[ SOLICITAR ]
[ CANCELAR ]
```

Después:

```text
✓ SOLICITUD ENVIADA

El mesero llevará tu cuenta.
```

---

# 18. Experiencia del mesero

El mesero inicia sesión.

```text
LOGIN
 ↓
DASHBOARD
```

---

# 19. Login del personal

```text
┌─────────────────────┐
│ LOGO                │
│                     │
│ Correo              │
│ [_______________]   │
│                     │
│ Contraseña          │
│ [_______________]   │
│                     │
│ [ INICIAR SESIÓN ]  │
│                     │
└─────────────────────┘
```

---

# 20. Dashboard del mesero

El dashboard debe priorizar lo urgente.

```text
BUENAS TARDES

La Casa del Sabor

🔔 3 solicitudes
🛒 2 pedidos nuevos
🍽️ 4 mesas ocupadas

-----------------------

PEDIDOS NUEVOS

#128  Mesa 7
#129  Mesa 3

-----------------------

SOLICITUDES

🛎️ Mesa 4
🛎️ Mesa 8

-----------------------

[ MESAS ]
[ PEDIDOS ]
[ SOLICITUDES ]
```

---

# 21. Pedidos nuevos

```text
PEDIDOS NUEVOS

┌─────────────────────┐
│ #128                │
│ Mesa 07             │
│                     │
│ 2 Hamburguesas      │
│ 1 Coca-Cola         │
│                     │
│ [ ACEPTAR ]         │
│ [ RECHAZAR ]        │
└─────────────────────┘
```

---

# 22. Aceptar pedido

Cuando el mesero acepta:

```text
Pedido #128
✓ Aceptado

Enviado a cocina.
```

El pedido cambia a:

**ACEPTADO**

y aparece en cocina.

---

# 23. Rechazar pedido

Al pulsar:

```text
RECHAZAR PEDIDO

Selecciona motivo:

○ Producto agotado
○ Problema con pedido
○ Restaurante no puede procesarlo
○ Otro

Comentario:
[________________]

[ CONFIRMAR RECHAZO ]
```

El rechazo debe quedar registrado.

---

# 24. Pedidos del mesero

```text
PEDIDOS

NUEVOS
#128 Mesa 7

ACEPTADOS
#124 Mesa 3
#126 Mesa 8

EN PREPARACIÓN
#125 Mesa 5

LISTOS
#123 Mesa 2

ENTREGADOS
#121 Mesa 6
```

---

# 25. Solicitudes de atención

```text
SOLICITUDES

🔔 Mesa 4
Solicita atención
Hace 00:32

[ ATENDER ]
[ RECHAZAR ]

🔔 Mesa 8
Solicita cuenta
Hace 01:15

[ ATENDER ]
[ RECHAZAR ]
```

---

# 26. Mesas

Vista del restaurante:

```text
MESAS

┌─────┐ ┌─────┐ ┌─────┐
│  1  │ │  2  │ │  3  │
│ 🟢  │ │ 🔴  │ │ 🟢  │
└─────┘ └─────┘ └─────┘

┌─────┐ ┌─────┐ ┌─────┐
│  4  │ │  5  │ │  6  │
│ 🟡  │ │ 🔴  │ │ 🟢  │
└─────┘ └─────┘ └─────┘
```

---

# 27. Detalle de mesa

Ejemplo:

```text
MESA 07

Estado:
OCUPADA

Pedidos:
#128
#130

Solicitudes:
Ninguna

Total pedidos:
$28.00

[ VER PEDIDOS ]
[ SOLICITAR CUENTA ]
```

---

# 28. Cocina

La cocina tendrá una interfaz completamente diferente.

Debe ser rápida y visual.

```text
COCINA

NUEVOS
──────────────────

#128
Mesa 07

2 Hamburguesas
1 Papas
2 Coca-Cola

Nota:
Una sin cebolla

[ PREPARAR ]


EN PREPARACIÓN
──────────────────

#126
Mesa 03

1 Pizza
1 Jugo

[ MARCAR LISTO ]
```

---

# 29. Regla de cocina

La cocina solamente recibe:

**PEDIDOS ACEPTADOS**

No verá:

- pedidos rechazados;
- pedidos pendientes;
- solicitudes de mesero;
- administración de productos.

---

# 30. Pedido en cocina

Cuando aparece:

```text
#128
Mesa 07

2 Hamburguesas
1 Papas
2 Coca-Cola
```

Cocina pulsa:

**PREPARAR**

El pedido pasa a:

**EN PREPARACIÓN**

Al finalizar:

**MARCAR LISTO**

---

# 31. Pedido listo

Después de marcar:

```text
✓ PEDIDO #128

Mesa 07

LISTO
```

El mesero recibe la actualización.

---

# 32. Administrador

El administrador tendrá una navegación independiente.

```text
DASHBOARD
│
├── Resumen
├── Pedidos
├── Mesas
├── Productos
├── Categorías
├── QR
├── Empleados
└── Configuración
```

---

# 33. Dashboard administrador

```text
LA CASA DEL SABOR

Hoy

Pedidos
38

Solicitudes
12

Mesas ocupadas
8 / 12

----------------------

Pedidos pendientes
2

Pedidos en preparación
4

Solicitudes pendientes
3
```

---

# 34. Productos

```text
PRODUCTOS

[ + NUEVO PRODUCTO ]

Buscar...

Hamburguesa Especial
$7.50
Disponible ✅

Pizza Familiar
$12.00
Disponible ✅

Ceviche
$6.00
Agotado ❌
```

---

# 35. Crear producto

Campos:

```text
Nombre
Descripción
Precio
Categoría
Imagen
Disponible
Opciones
Extras

[ GUARDAR ]
```

---

# 36. Categorías

```text
CATEGORÍAS

Entradas
Platos fuertes
Hamburguesas
Bebidas
Postres

[ + NUEVA CATEGORÍA ]
```

El administrador podrá:

- Crear.
- Editar.
- Eliminar.
- Reordenar.

---

# 37. Gestión de mesas

```text
MESAS

Mesa 01
Mesa 02
Mesa 03
Mesa 04
...

[ + NUEVA MESA ]
```

Cada mesa tendrá:

- Número.
- Estado.
- QR.
- Activación.

---

# 38. Gestión de QR

El administrador podrá seleccionar:

Mesa 01

y obtener:

```text
┌──────────────────┐
│                  │
│       QR         │
│                  │
│                  │
│      MESA 01     │
│                  │
└──────────────────┘

[ DESCARGAR ]
[ IMPRIMIR ]
```

Posteriormente podremos crear un generador de varias mesas:

```text
[ GENERAR QR 1–10 ]
```

---

# 39. Empleados

```text
EMPLEADOS

Juan Pérez
MESERO
Activo ✅

Carlos Gómez
COCINA
Activo ✅

Ana López
ADMINISTRADOR
Activo ✅

[ + AGREGAR EMPLEADO ]
```

---

# 40. Agregar empleado

```text
Nombre
Correo
Rol

○ Mesero
○ Cocina
○ Administrador

Estado

[ CREAR USUARIO ]
```

---

# 41. Configuración del restaurante

```text
CONFIGURACIÓN

Información
Apariencia
Horario
Datos de contacto
Redes sociales

[ GUARDAR CAMBIOS ]
```

---

# 42. Personalización

El administrador podrá configurar inicialmente:

- Logo.
- Nombre.
- Descripción.
- Imagen principal.
- Color principal.
- Color secundario.

El objetivo es que cada restaurante tenga su propia identidad.

---

# 43. Navegación general del cliente

```text
CARTA
 │
 ├── Buscar
 │
 ├── Categorías
 │      └── Productos
 │             └── Detalle
 │
 ├── Carrito
 │      └── Confirmar
 │             └── Pedido
 │
 ├── Llamar mesero
 │
 └── Solicitar cuenta
```

---

# 44. Navegación del mesero

```text
DASHBOARD
 │
 ├── Pedidos
 │      ├── Nuevos
 │      ├── Aceptados
 │      ├── En preparación
 │      ├── Listos
 │      └── Entregados
 │
 ├── Solicitudes
 │
 └── Mesas
```

---

# 45. Navegación de cocina

```text
COCINA
 │
 ├── Pendientes
 │
 ├── En preparación
 │
 └── Listos
```

Debe mantenerse extremadamente simple.

---

# 46. Navegación del administrador

```text
DASHBOARD
 │
 ├── Resumen
 ├── Pedidos
 ├── Mesas
 ├── Productos
 ├── Categorías
 ├── QR
 ├── Empleados
 └── Configuración
```

---

# 47. Pantallas de error globales

El MVP debe contemplar estados generales.

## Error de conexión

```text
No pudimos conectar con el servidor.

Comprueba tu conexión
e inténtalo nuevamente.

[ REINTENTAR ]
```

## Página inexistente

```text
Página no encontrada.

[ VOLVER ]
```

## Sesión expirada

```text
Tu sesión ha expirado.

[ INICIAR SESIÓN ]
```

## Sin permisos

```text
No tienes permiso para acceder
a esta sección.
```

---

# 48. Estados de carga

No queremos pantallas congeladas.

Ejemplo:

```text
Cargando carta...
```

o skeletons visuales.

Para acciones:

```text
Enviando pedido...
```

```text
Aceptando pedido...
```

```text
Guardando cambios...
```

Esto hace que la plataforma se sienta mucho más profesional.

---

# 49. Estados vacíos

No todo estará lleno.

Ejemplo:

```text
NO HAY PEDIDOS

Cuando recibas un pedido
aparecerá aquí.
```

Para cocina:

```text
NO HAY PEDIDOS EN PREPARACIÓN

Todo está al día ✓
```

Para solicitudes:

```text
NO HAY SOLICITUDES

Todo tranquilo.
```

---

# 50. MVP — Pantallas definitivas

## CLIENTE

1. Entrada QR
2. Carta
3. Categoría
4. Detalle producto
5. Carrito
6. Confirmación
7. Pedido enviado
8. Estado pedido
9. Llamar mesero
10. Solicitar cuenta
11. Estados de error

## MESERO

1. Login
2. Dashboard
3. Pedidos nuevos
4. Detalle pedido
5. Aceptar pedido
6. Rechazar pedido
7. Pedidos activos
8. Solicitudes
9. Mesas
10. Detalle de mesa

## COCINA

1. Login
2. Panel cocina
3. Pedido
4. En preparación
5. Marcar listo

## ADMINISTRADOR

1. Login
2. Dashboard
3. Pedidos
4. Mesas
5. Productos
6. Crear producto
7. Editar producto
8. Categorías
9. QR
10. Empleados
11. Configuración
12. Personalización

---

# 51. Resultado de esta fase

Con este mapa ya conocemos:

- Qué pantallas existen.
- Quién accede a ellas.
- Cómo se mueve cada usuario.
- Qué acciones principales existen.
- Qué estados debemos representar.
- Qué errores debemos contemplar.
- Qué entra en el MVP.

El siguiente paso será convertir cada pantalla en un **wireframe UX**, comenzando por la experiencia más importante:

```text
CLIENTE EN CELULAR
       ↓
QR
       ↓
CARTA
       ↓
PRODUCTO
       ↓
CARRITO
       ↓
PEDIDO
```

Después diseñaremos:

```text
MESERO
   ↓
DASHBOARD
   ↓
PEDIDOS / SOLICITUDES

COCINA
   ↓
PEDIDOS
   ↓
LISTO

ADMIN
   ↓
GESTIÓN DEL RESTAURANTE
```

Una vez terminados los wireframes, podremos pasar a **UI visual + componentes + modelo de datos + reglas de negocio + arquitectura técnica**.