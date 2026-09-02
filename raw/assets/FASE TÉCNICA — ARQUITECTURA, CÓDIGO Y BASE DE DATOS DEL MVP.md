# FASE TÉCNICA — ARQUITECTURA, CÓDIGO Y BASE DE DATOS DEL MVP

## 1. Objetivo

Definir la arquitectura técnica, estructura del código y modelo de datos que soportarán el MVP de la plataforma digital para restaurantes.

La arquitectura debe cumplir principalmente con:

- Rapidez.
- Simplicidad.
- Seguridad.
- Escalabilidad razonable.
- Facilidad de mantenimiento.
- Experiencia Mobile First.
- Desarrollo rápido del MVP.
- Capacidad de evolucionar posteriormente.

---

# 2. Restricciones principales del proyecto

Estas decisiones son obligatorias para todo el desarrollo.

## 2.1 Mobile First

La experiencia del cliente se diseñará y optimizará primero para:

- Smartphones.
- Pantallas pequeñas.
- Uso táctil.
- Uso con una sola mano.
- Conexiones móviles variables.

La experiencia Desktop será secundaria para el cliente.

---

## 2.2 Performance

La carta digital debe ser extremadamente rápida.

El objetivo es:

```text id="m7e8v4"
ESCANEAR QR
     ↓
ABRIR CARTA
     ↓
VER PRODUCTOS
```

con la menor fricción posible.

No debemos enviar al celular información innecesaria.

---

## 2.3 Consumo reducido de datos

Debemos considerar que el cliente puede utilizar datos móviles.

Por ello:

- Imágenes optimizadas.
- JavaScript limitado al necesario.
- Carga progresiva cuando corresponda.
- Consultas pequeñas.
- Evitar descargar todo el catálogo innecesariamente.

---

## 2.4 Interfaz rápida

Las acciones importantes deben proporcionar respuesta inmediata.

Ejemplos:

```text id="2y6z82"
Agregar producto
↓
Producto agregado ✓
```

```text id="4oz6iw"
Enviar pedido
↓
Enviando...
↓
Pedido #128
```

No debemos crear interfaces que se sientan congeladas.

---

# 3. Arquitectura principal

La arquitectura inicial será un:

> **Modular Monolith**

No utilizaremos microservicios para el MVP.

La aplicación estará centralizada, pero separada internamente por dominios.

```text id="z1j6r8"
NEXT.JS
│
├── Auth
├── Restaurants
├── Menu
├── Tables
├── Orders
├── Waiter
├── Kitchen
└── Staff
```

Esto permite desarrollar rápidamente sin sacrificar organización.

---

# 4. Stack tecnológica propuesta

## Frontend / Full-stack web

```text id="s4ev7m"
Next.js
TypeScript
```

## UI

```text id="hnft3h"
Tailwind CSS
shadcn/ui
```

## Backend / Database Platform

```text id="2a9a7h"
Supabase
```

## Database

```text id="n4bqhw"
PostgreSQL
```

## Authentication

```text id="bs6evn"
Supabase Auth
```

## Storage

```text id="7o6b2b"
Supabase Storage
```

## Realtime

```text id="m5p7sc"
Supabase Realtime
```

## Validación

```text id="6ghrqk"
Zod
```

## Control de versiones

```text id="mybr3t"
Git
GitHub
```

## Deployment

```text id="3np6s0"
Vercel
```

---

# 5. Arquitectura general

```text id="tm8h9c"
                         INTERNET
                            │
                            ▼
                       ┌─────────┐
                       │ VERCEL  │
                       └────┬────┘
                            │
                       ┌────▼────┐
                       │ NEXT.JS │
                       └────┬────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
           CLIENTE        MESERO        ADMIN
                            │
                            ▼
                          COCINA
                            │
                            ▼
                       ┌──────────┐
                       │ SUPABASE │
                       └────┬─────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
           ▼                ▼                ▼
      PostgreSQL          Auth            Storage
           │
           ▼
        Realtime
```

---

# 6. Arquitectura por dominios

La aplicación se dividirá conceptualmente en:

```text id="grt0x1"
restaurants
menu
tables
orders
waiter-calls
staff
auth
kitchen
```

Cada módulo será responsable de su propio dominio.

---

# 7. Principio de separación

No se debe colocar toda la lógica del negocio dentro de componentes visuales.

Incorrecto:

```tsx id="0f0zml"
<Button onClick={async () => {
  // consulta y modifica la base
}} />
```

Preferido:

```text id="clxns9"
UI
 ↓
Action / Use Case
 ↓
Validaciones
 ↓
Dominio
 ↓
Base de datos
```

Ejemplo:

```text id="04cqrs"
acceptOrder()
```

será responsable de verificar:

- Usuario autorizado.
- Pedido pendiente.
- Productos válidos.
- Pedido no procesado previamente.
- Cambio de estado correcto.

---

# 8. Operaciones principales del dominio

Las acciones críticas serán explícitas.

```text id="e4j1mk"
createOrder()
acceptOrder()
rejectOrder()
startPreparing()
markOrderReady()
markOrderDelivered()

createWaiterCall()
handleWaiterCall()

requestBill()
```

Esto evita que cualquier parte del sistema pueda modificar estados arbitrariamente.

---

# 9. Estados de pedido

```text id="cbk48s"
PENDING
ACCEPTED
PREPARING
READY
DELIVERED
REJECTED
CANCELLED
```

Flujo normal:

```text id="4z5fbi"
PENDING
   ↓
ACCEPTED
   ↓
PREPARING
   ↓
READY
   ↓
DELIVERED
```

Flujo alternativo:

```text id="08ghz6"
PENDING
   ↓
REJECTED
```

---

# 10. Transiciones válidas

```text id="4c1h40"
PENDING
 ├── ACCEPTED
 ├── REJECTED
 └── CANCELLED

ACCEPTED
 ├── PREPARING
 └── CANCELLED

PREPARING
 ├── READY
 └── CANCELLED

READY
 └── DELIVERED
```

No deben permitirse transiciones arbitrarias.

Ejemplos inválidos:

```text id="f49n1p"
PENDING → READY ❌

REJECTED → PREPARING ❌

DELIVERED → ACCEPTED ❌
```

---

# 11. Responsabilidad por estado

## Mesero

Puede procesar:

```text id="om6vf8"
PENDING
   ↓
ACCEPTED

PENDING
   ↓
REJECTED
```

## Cocina

Puede procesar:

```text id="hz3tma"
ACCEPTED
   ↓
PREPARING
   ↓
READY
```

## Mesero

Puede completar:

```text id="5e5gt7"
READY
   ↓
DELIVERED
```

---

# 12. Realtime

Solo se utilizará para eventos donde realmente aporte valor.

## Eventos principales

```text id="v6yjty"
Nuevo pedido
      ↓
Mesero

Pedido aceptado
      ↓
Cocina

Pedido listo
      ↓
Mesero

Nueva solicitud
      ↓
Mesero

Solicitud de cuenta
      ↓
Mesero
```

---

# 13. No todo necesita Realtime

No utilizaremos realtime para:

- Editar nombre del restaurante.
- Cambiar descripción.
- Subir logo.
- Crear categorías.
- Cambiar configuraciones administrativas.

Estas operaciones pueden utilizar solicitudes normales.

---

# 14. Base de datos

La base de datos será:

> PostgreSQL.

Se utilizará un modelo relacional porque el sistema tiene muchas relaciones.

```text id="3scyzb"
RESTAURANTE
   ↓
MESAS
   ↓
PEDIDOS
   ↓
ITEMS
   ↓
PRODUCTOS
   ↓
CATEGORÍAS
```

---

# 15. Arquitectura Multi-Tenant

La plataforma será multi-restaurante.

Cada restaurante tendrá sus propios datos.

Todas las entidades importantes estarán asociadas a:

```text id="ubnbc4"
restaurant_id
```

Ejemplo:

```text id="9fef1k"
Restaurante A
   ↓
restaurant_id = A

Restaurante B
   ↓
restaurant_id = B
```

Los datos nunca deben mezclarse.

---

# 16. Seguridad Multi-Tenant

Se utilizarán reglas de acceso a nivel de base de datos.

Principal mecanismo:

> **Row Level Security (RLS)**

El frontend nunca será considerado una barrera de seguridad suficiente.

La base de datos también debe comprobar los permisos.

---

# 17. Tablas principales

El MVP tendrá inicialmente:

```text id="5qd8f2"
restaurants
profiles
restaurant_members
tables
categories
products
orders
order_items
waiter_calls
```

Y posteriormente podrán incorporarse:

```text id="j2p1nw"
product_options
product_option_values
customers
payments
reviews
promotions
subscriptions
audit_logs
```

---

# 18. Tabla `restaurants`

```sql id="x5r1rd"
restaurants
-----------
id
name
slug
description
logo_url
cover_image_url
phone
address
status
timezone
opening_hours
created_at
updated_at
```

`slug` permitirá URLs amigables.

Ejemplo:

```text id="wo3c5k"
/menu/la-casa-del-sabor
```

---

# 19. Tabla `profiles`

La autenticación estará separada del perfil de usuario.

```text id="r1e8t0"
profiles
--------
id
full_name
avatar_url
created_at
updated_at
```

---

# 20. Tabla `restaurant_members`

Relaciona usuarios con restaurantes.

```text id="cn8sj0"
restaurant_members
------------------
id
restaurant_id
user_id
role
status
created_at
updated_at
```

Roles:

```text id="m2y5kg"
OWNER
ADMIN
WAITER
KITCHEN
```

---

# 21. Tabla `tables`

```text id="6n8mq4"
tables
------
id
restaurant_id
number
name
status
qr_token
created_at
updated_at
```

Debe existir unicidad de mesa dentro del restaurante.

Ejemplo:

```text id="h91r3p"
Restaurante A + Mesa 1 = único
Restaurante B + Mesa 1 = permitido
```

---

# 22. QR

El QR debe identificar:

```text id="7qzqsv"
RESTAURANTE
+
MESA
```

Preferiblemente mediante un token asociado a la mesa.

El QR no debe depender únicamente de un número visible.

---

# 23. Tabla `categories`

```text id="8s4w6t"
categories
----------
id
restaurant_id
name
description
position
active
created_at
updated_at
```

`position` permitirá ordenar categorías.

---

# 24. Tabla `products`

```text id="rhw8js"
products
--------
id
restaurant_id
category_id
name
description
price
image_url
available
active
position
created_at
updated_at
```

---

# 25. `active` vs `available`

Son conceptos diferentes.

### `active`

Determina si el producto pertenece a la carta.

### `available`

Determina si actualmente se puede vender.

Ejemplo:

```text id="4bh1u2"
Ceviche

active = true
available = false
```

Significa:

> Está en la carta pero temporalmente agotado.

---

# 26. Tabla `orders`

```text id="qqlt3b"
orders
------
id
restaurant_id
table_id
status
subtotal
total
notes
accepted_by
accepted_at
preparing_at
ready_at
delivered_at
created_at
updated_at
```

---

# 27. Tabla `order_items`

```text id="he9e9x"
order_items
-----------
id
order_id
product_id
product_name
quantity
unit_price
subtotal
notes
created_at
```

Se almacenará información histórica del producto.

Esto evita que cambiar el producto posteriormente modifique un pedido antiguo.

---

# 28. Tabla `waiter_calls`

```text id="rme0kn"
waiter_calls
------------
id
restaurant_id
table_id
type
status
handled_by
created_at
handled_at
```

Tipos iniciales:

```text id="x2z65t"
WAITER
BILL
```

---

# 29. Carrito

El carrito del cliente no necesita existir inicialmente como tabla permanente.

Se manejará temporalmente en el cliente:

```text id="rf4a6i"
CARTA
 ↓
CARRITO
 ↓
CONFIRMAR
 ↓
CREAR ORDER
```

Una vez enviado, se guarda como pedido.

Esto reduce complejidad.

---

# 30. Sesión anónima del cliente

El cliente no necesita registrarse.

Podemos utilizar una sesión anónima asociada a:

```text id="3i8rpt"
restaurant
+
table
+
session
```

Esto permitirá asociar acciones durante la visita sin exigir registro.

---

# 31. Histórico de precios

Un pedido debe conservar:

```text id="16o5y8"
product_name
unit_price
```

aunque posteriormente el producto cambie.

Ejemplo:

```text id="1r1x6v"
Día 1
Hamburguesa = $7.50

Día 20
Hamburguesa = $8.00
```

El pedido del Día 1 debe continuar mostrando:

```text id="6gq06x"
$7.50
```

---

# 32. Eliminaciones

Se utilizará preferentemente desactivación lógica para entidades importantes.

Ejemplo:

```text id="2v2fi0"
active = false
```

en lugar de eliminar inmediatamente.

Esto protege el historial.

---

# 33. Índices

Se crearán índices según los patrones de consulta reales.

Especialmente:

```text id="ql3w1q"
orders
restaurant_id
status

products
restaurant_id
category_id

waiter_calls
restaurant_id
status
```

También se considerarán:

```text id="i1qgqm"
tables
restaurant_id
number
```

y combinaciones utilizadas frecuentemente.

---

# 34. Restricciones

La base tendrá restricciones para evitar datos inválidos.

Ejemplos:

```text id="aq5u9s"
quantity > 0

price >= 0

required foreign keys

unique restaurant + table number

valid order status
```

---

# 35. Concurrencia

Debe manejarse cuando dos trabajadores realizan la misma acción.

Ejemplo:

```text id="g5bc1n"
Mesero A
 ↓
ACEPTAR

Mesero B
 ↓
ACEPTAR
```

Solo uno puede ganar la operación.

El segundo recibirá:

> Este pedido ya fue procesado.

---

# 36. Validación server-side

Las validaciones críticas nunca dependerán solamente del frontend.

Ejemplo:

```text id="y7qstb"
Frontend
   ↓
"Pedido válido"
```

no es suficiente.

El servidor debe volver a comprobar:

```text id="xk7q88"
Pedido pendiente
+
Usuario autorizado
+
Productos disponibles
+
Mesa válida
```

---

# 37. Zod

Los datos entrantes serán validados.

Ejemplos:

```text id="q7pkn4"
CreateProductSchema
CreateOrderSchema
RejectOrderSchema
CreateWaiterCallSchema
```

---

# 38. Estructura del código

La aplicación utilizará una estructura modular.

```text id="lf7hsp"
src/
│
├── app/
│
├── modules/
│   ├── auth/
│   ├── restaurants/
│   ├── menu/
│   ├── tables/
│   ├── orders/
│   ├── waiter-calls/
│   ├── staff/
│   └── kitchen/
│
├── components/
│   ├── ui/
│   └── shared/
│
├── lib/
│   ├── supabase/
│   ├── auth/
│   └── validation/
│
├── types/
│
└── config/
```

---

# 39. Estructura del módulo Orders

Ejemplo:

```text id="br7d7i"
modules/orders/
│
├── actions/
│   ├── create-order.ts
│   ├── accept-order.ts
│   ├── reject-order.ts
│   ├── start-preparing.ts
│   ├── mark-ready.ts
│   └── mark-delivered.ts
│
├── queries/
│   ├── get-order.ts
│   └── get-orders.ts
│
├── validations/
│   └── order.schema.ts
│
├── types/
│   └── order.types.ts
│
└── utils/
```

---

# 40. Server y Client

Se utilizará el servidor para:

- Operaciones de base de datos.
- Validaciones críticas.
- Operaciones administrativas.
- Seguridad.

Y el cliente para:

- Carrito.
- Interactividad.
- Filtros.
- Modales.
- UI.
- Realtime.

No toda la aplicación será Client Component.

---

# 41. Performance del cliente

La experiencia pública tendrá prioridad de rendimiento.

Debemos evitar:

```text id="asb9da"
Cargar todo el restaurante
+
Todas las categorías
+
Todas las imágenes
+
Todo JavaScript
```

al abrir la carta.

Preferimos:

```text id="b9v2a5"
Cargar estructura esencial
↓
Mostrar contenido
↓
Cargar imágenes progresivamente
↓
Solicitar datos adicionales cuando sean necesarios
```

---

# 42. Imágenes

Las imágenes de productos deberán:

- Estar comprimidas.
- Tener tamaños razonables.
- Servirse optimizadas.
- Utilizar formatos modernos cuando corresponda.
- No obligar al teléfono a descargar fotografías gigantes.

La imagen original y la imagen utilizada para el cliente podrán ser diferentes.

---

# 43. Carga de la carta

La carta pública debe ser tratada como una experiencia de alto rendimiento.

Debemos evitar consultas innecesarias.

Ejemplo:

```text id="it44gd"
QR
 ↓
Restaurante + mesa
 ↓
Datos esenciales
 ↓
Carta
```

No deberíamos realizar una docena de llamadas consecutivas para poder mostrar el menú.

---

# 44. Caché

La información que cambia poco puede beneficiarse de caching.

Ejemplos:

- Información del restaurante.
- Categorías.
- Productos.

Mientras que elementos dinámicos deben actualizarse:

- Pedidos.
- Solicitudes.
- Estados.

---

# 45. Realtime y performance

Realtime se utilizará únicamente en interfaces donde realmente se necesita actualización inmediata.

Principalmente:

```text id="h4zq5f"
MESERO
COCINA
PEDIDOS
SOLICITUDES
```

La carta pública no necesita mantener una conexión realtime permanente.

---

# 46. QR y rendimiento

El recorrido:

```text id="qhk5j4"
ESCANEAR
 ↓
ABRIR
 ↓
CARTA
```

es crítico.

El QR debe apuntar a una URL sencilla.

No debemos obligar al cliente a pasar por varias páginas antes de llegar al menú.

---

# 47. Mobile UX como requisito técnico

La optimización para móvil no será solamente visual.

También deberá reflejarse en:

- Tamaño de recursos.
- Consultas.
- JavaScript.
- Imágenes.
- Caching.
- Tiempo de respuesta.
- Uso de memoria.
- Interacciones táctiles.

---

# 48. Arquitectura de despliegue

Inicialmente:

```text id="xjp7rg"
GitHub
   ↓
Vercel
   ↓
Next.js
```

y:

```text id="t9w7dj"
Supabase
   ↓
PostgreSQL
Auth
Storage
Realtime
```

---

# 49. Ambientes

Inicialmente:

```text id="9p1ak8"
local
production
```

Cuando tengamos pilotos reales:

```text id="wr8vs8"
development
staging
production
```

---

# 50. Variables de entorno

Los secretos no se subirán al repositorio.

Ejemplo:

```text id="g5y4m4"
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Las claves privilegiadas estarán exclusivamente del lado servidor cuando correspondan.

---

# 51. Migraciones de base de datos

Todo cambio de estructura debe quedar registrado.

Ejemplo:

```text id="2k7sbb"
001_initial_schema.sql
002_add_products.sql
003_add_orders.sql
004_add_waiter_calls.sql
```

No dependeremos de modificaciones manuales imposibles de reproducir.

---

# 52. Testing

Se priorizarán las reglas críticas.

Especialmente:

```text id="xh9jrs"
No duplicar pedidos.

No aceptar dos veces.

No permitir cocina sobre pedidos pendientes.

No permitir cliente modificar estados.

No permitir acceso entre restaurantes.

No aceptar productos no disponibles.
```

---

# 53. Seguridad

Desde el MVP tendremos:

- RLS.
- Validación server-side.
- Roles.
- Permisos.
- Foreign keys.
- Constraints.
- Manejo seguro de secretos.
- Auditoría de acciones críticas.

---

# 54. Funciones fuera de la arquitectura inicial

No se implementarán todavía:

```text id="m0m6hj"
Microservicios
Kubernetes
Kafka
Redis obligatorio
App móvil nativa
Backend independiente
POS
Pagos
Facturación electrónica
Inventario avanzado
```

Podrán evaluarse cuando exista una necesidad real.

---

# 55. Objetivo de la arquitectura

La arquitectura debe permitir:

```text id="yje5na"
1 restaurante
       ↓
10 restaurantes
       ↓
100 restaurantes
       ↓
1000+ restaurantes
```

sin tener que reconstruir completamente la aplicación.

Pero tampoco se diseñará desde el principio como una infraestructura empresarial sobredimensionada.

---

# 56. Decisiones técnicas oficiales

```text id="4a6qlv"
✅ Next.js
✅ TypeScript
✅ Tailwind CSS
✅ shadcn/ui
✅ Supabase
✅ PostgreSQL
✅ Supabase Auth
✅ Supabase Storage
✅ Supabase Realtime
✅ Zod
✅ Vercel
✅ GitHub
✅ RLS
✅ Arquitectura modular
✅ Mobile First
✅ Performance First
```

---

# 57. Principios técnicos oficiales

## Performance First

La carta debe ser rápida.

## Mobile First

El cliente utiliza principalmente teléfono.

## Security by Default

Las reglas críticas deben validarse en servidor y base de datos.

## Simple Architecture

No construir infraestructura que todavía no necesitamos.

## Modular Code

Los dominios deben mantenerse separados.

## Explicit Business Rules

Las transiciones importantes deben ejecutarse mediante acciones específicas.

## Realtime Where Needed

Tiempo real únicamente donde aporte valor.

## Data Integrity

La base de datos debe proteger la consistencia.

## Evolvable

El sistema debe permitir agregar funciones posteriormente.

---

# 58. Estado del proyecto

```text
✅ IDEA
✅ PROBLEMA
✅ PROPUESTA
✅ ROLES
✅ FLUJOS
✅ UX CLIENTE
✅ UX MESERO
✅ UX COCINA
✅ UX ADMIN
✅ MAPA DE PANTALLAS
✅ WIREFRAMES
✅ REGLAS DE NEGOCIO
✅ MODELO DE DATOS CONCEPTUAL
✅ ARQUITECTURA
✅ MOBILE FIRST
✅ PERFORMANCE FIRST

⏳ MODELO DE DATOS DEFINITIVO
⏳ DIAGRAMA ER
⏳ SQL MIGRATIONS
⏳ RLS DEFINITIVO
⏳ DESIGN SYSTEM
⏳ UI FINAL
⏳ CREACIÓN DEL REPOSITORIO
⏳ DESARROLLO MVP
⏳ TESTING
⏳ DEMO
⏳ PILOTO
⏳ VENTA
```

---

# 59. Próxima fase oficial

El siguiente paso será:

# DATABASE DESIGN V1

Antes de escribir la aplicación debemos convertir el modelo conceptual en una estructura real.

Se definirá:

```text id="wqzcb4"
ER DIAGRAM
     ↓
TABLAS DEFINITIVAS
     ↓
COLUMNAS
     ↓
TIPOS
     ↓
PRIMARY KEYS
     ↓
FOREIGN KEYS
     ↓
UNIQUE
     ↓
INDEXES
     ↓
CHECK CONSTRAINTS
     ↓
ENUMS / STATUS
     ↓
RLS POLICIES
     ↓
TRIGGERS
     ↓
MIGRATIONS SQL
```

Después:

```text id="pmh2at"
DATABASE V1
     ↓
DESIGN SYSTEM
     ↓
CODEBASE SETUP
     ↓
NEXT.JS
     ↓
SUPABASE
     ↓
PRIMER CÓDIGO
```

# 60. Criterio de aceptación técnico

No consideraremos listo el MVP simplemente porque “funcione”.

Debe cumplir:

```text id="8crp2t"
RÁPIDO EN CELULAR
        +
FÁCIL DE USAR
        +
SEGURO
        +
CONSISTENTE
        +
MANTENIBLE
        +
PREPARADO PARA CRECER
```

El principio técnico central del proyecto será:

> **Primero velocidad y simplicidad para el cliente; después complejidad e infraestructura.**