# PROYECTO — FASES UX, REGLAS DE NEGOCIO, DATOS Y ARQUITECTURA DEL MVP

## 1. Estado de la definición del producto

Con esta etapa quedan definidas las experiencias principales del MVP:

```text
CLIENTE ✅
MESERO ✅
COCINA ✅
ADMINISTRADOR ✅
```

También quedan definidas:

```text
MAPA DE PANTALLAS ✅
FLUJOS PRINCIPALES ✅
REGLAS OPERATIVAS ✅
MODELO DE DATOS CONCEPTUAL ✅
ARQUITECTURA TÉCNICA BASE ✅
```

---

# 2. Administrador del restaurante

## Objetivo

El administrador controla la configuración y operación general del restaurante.

Su función principal es:

> Configurar el restaurante, administrar la carta, las mesas, los empleados y supervisar la operación.

---

## Navegación

```text
LOGIN
  ↓
DASHBOARD
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

# 3. Dashboard del administrador

Debe proporcionar información general.

```text
LA CASA DEL SABOR

Hoy

Pedidos             38
Mesas ocupadas       8/12
Solicitudes          12

----------------------------

PEDIDOS ACTIVOS

#128  Mesa 07
#129  Mesa 03

----------------------------

SOLICITUDES

Mesa 04
Mesa 08
```

El MVP no necesita estadísticas avanzadas.

---

# 4. Productos

El administrador podrá:

- Crear productos.
- Editar productos.
- Activar productos.
- Desactivar productos.
- Marcar productos como agotados.
- Eliminar productos.
- Cambiar precios.
- Cambiar imágenes.
- Asignar categorías.

Ejemplo:

```text
PRODUCTOS

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

# 5. Crear producto

Campos iniciales:

```text
Nombre
Descripción
Precio
Categoría
Imagen
Disponible
```

Posteriormente:

```text
Variantes
Extras
Ingredientes
```

---

# 6. Categorías

Ejemplos:

```text
Entradas
Platos fuertes
Hamburguesas
Bebidas
Postres
```

El administrador podrá:

- Crear.
- Editar.
- Eliminar.
- Reordenar.
- Activar/desactivar.

---

# 7. Mesas

Cada mesa pertenece a un restaurante.

```text
Mesa 01
Mesa 02
Mesa 03
Mesa 04
Mesa 05
```

Cada mesa tendrá:

```text
ID
Número
Restaurante
Estado
QR
```

---

# 8. QR

El administrador podrá generar QR individuales.

```text
MESA 07

[ QR ]

[ DESCARGAR ]
[ IMPRIMIR ]
```

Y posteriormente generar varios:

```text
Mesas 01–10

[ GENERAR QR ]
```

---

# 9. Empleados

El administrador podrá administrar usuarios del restaurante.

```text
Juan Pérez
MESERO
Activo

Carlos Gómez
COCINA
Activo

Ana López
ADMIN
Activo
```

---

# 10. Roles

Roles iniciales:

```text
OWNER
ADMIN
WAITER
KITCHEN
```

Cada rol tendrá permisos diferentes.

---

# 11. Configuración

El administrador podrá gestionar:

```text
Información
Apariencia
Horario
Contacto
Redes sociales
```

---

# 12. Personalización

Cada restaurante podrá configurar:

- Nombre.
- Logo.
- Descripción.
- Imagen principal.
- Color principal.
- Color secundario.
- Datos de contacto.
- Horarios.

Esto permite que cada restaurante tenga una identidad visual propia.

---

# 13. Reglas generales del sistema

## Restaurante

Cada restaurante será independiente.

```text
RESTAURANTE
 ├── Usuarios
 ├── Mesas
 ├── Categorías
 ├── Productos
 ├── Pedidos
 └── Solicitudes
```

Los datos de un restaurante nunca deben mezclarse con los de otro.

---

# 14. Mesa

Cada mesa pertenece a un único restaurante.

Ejemplo:

```text
Restaurante A
 ├── Mesa 1
 ├── Mesa 2
 └── Mesa 3

Restaurante B
 ├── Mesa 1
 ├── Mesa 2
 └── Mesa 3
```

Aunque tengan el mismo número visible, internamente son mesas diferentes.

---

# 15. QR

Cada QR identifica:

```text
RESTAURANTE
+
MESA
```

El QR no dependerá únicamente del texto visible de la mesa.

---

# 16. Pedido

Cada pedido pertenece a:

```text
Restaurante
Mesa
Sesión/cliente
```

Contiene uno o varios productos.

---

# 17. Estados de pedido

Estados principales:

```text
PENDING
ACCEPTED
PREPARING
READY
DELIVERED
REJECTED
CANCELLED
```

Flujo principal:

```text
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

```text
PENDING
   ↓
REJECTED
```

---

# 18. Regla crítica del pedido

Los pedidos en estado:

```text
PENDING
```

solamente los verá el mesero.

El pedido llegará a cocina únicamente después de:

```text
MESERO
   ↓
ACEPTA
   ↓
ACCEPTED
```

---

# 19. Mesero

El mesero puede:

```text
PENDING
   ↓
ACCEPTED
```

o:

```text
PENDING
   ↓
REJECTED
```

Una vez procesado el pedido, no debe poder procesarse nuevamente.

---

# 20. Cocina

La cocina trabajará únicamente con pedidos aceptados.

Flujo:

```text
ACCEPTED
   ↓
PREPARING
   ↓
READY
```

La cocina:

- No acepta.
- No rechaza.
- No gestiona productos.
- No gestiona mesas.
- No gestiona usuarios.

Su función es preparar y marcar como listo.

---

# 21. Entrega

El mesero será responsable de la entrega.

```text
READY
   ↓
MESERO
   ↓
ENTREGA
   ↓
DELIVERED
```

Cocina no controla la entrega.

---

# 22. Solicitudes de atención

Las solicitudes serán independientes de los pedidos.

Ejemplo:

```text
Cliente
   ↓
Llamar mesero
   ↓
Solicitud
   ↓
Mesero
```

Estados:

```text
PENDING
ACCEPTED
ATTENDED
REJECTED
```

---

# 23. Tipos de solicitudes

Inicialmente:

```text
WAITER
BILL
```

Posteriormente:

```text
CUTLERY
DRINK
HELP
OTHER
```

---

# 24. Solicitud de cuenta

Flujo:

```text
CLIENTE
   ↓
SOLICITA CUENTA
   ↓
MESERO
   ↓
ATIENDE
```

El pago digital queda fuera del MVP.

---

# 25. Productos

Estados conceptuales:

```text
ACTIVE
OUT_OF_STOCK
INACTIVE
```

Un producto no disponible no debe poder añadirse a nuevos pedidos.

---

# 26. Validaciones

Antes de aceptar operaciones críticas se debe comprobar:

- Pedido todavía pendiente.
- Producto disponible.
- Mesa válida.
- Pedido no procesado previamente.
- Datos consistentes.

---

# 27. Concurrencia

Si dos meseros intentan aceptar el mismo pedido:

```text
MESERO A
   ↓
ACEPTAR ✅

MESERO B
   ↓
ACEPTAR ❌
```

El segundo recibirá una notificación indicando que el pedido ya fue procesado.

---

# 28. Pedidos duplicados

El cliente no debe poder crear accidentalmente múltiples pedidos por pulsaciones repetidas.

Flujo:

```text
ENVIAR
   ↓
PROCESANDO
   ↓
CONFIRMADO
```

El botón deberá bloquearse temporalmente.

---

# 29. Solicitudes duplicadas

Una misma mesa no debería tener múltiples solicitudes idénticas activas.

Ejemplo:

```text
Mesa 07
Solicitud: Llamar mesero
Estado: PENDIENTE
```

Si pulsa nuevamente:

```text
Ya existe una solicitud
pendiente para esta mesa.
```

---

# 30. Restaurante cerrado

El administrador podrá configurar horarios.

Cuando el restaurante esté cerrado, el comportamiento podrá ser:

```text
Mostrar carta
+
Desactivar pedidos
+
Desactivar solicitudes
```

La configuración exacta se terminará de definir durante la implementación.

---

# 31. Seguridad multi-restaurante

La plataforma será multi-tenant.

Conceptualmente:

```text
RESTAURANTE A
   ↓
restaurant_id = A

RESTAURANTE B
   ↓
restaurant_id = B
```

Todas las entidades críticas estarán relacionadas con un restaurante.

La seguridad deberá impedir que un usuario acceda a información de otro restaurante.

---

# 32. Auditoría

Las acciones importantes deben registrarse.

Ejemplo:

```text
Pedido #128

Acción:
Aceptado

Usuario:
Juan Pérez

Fecha:
01/09/2026

Hora:
14:32
```

Esto será importante para:

- Soporte.
- Seguridad.
- Seguimiento.
- Resolución de errores.

---

# 33. Modelo de datos conceptual

## restaurants

```text
id
name
slug
logo
description
cover_image
phone
address
status
opening_hours
created_at
updated_at
```

---

## users

```text
id
name
email
created_at
```

La autenticación será gestionada mediante el sistema de autenticación seleccionado.

---

## restaurant_members

Relaciona usuarios con restaurantes.

```text
id
restaurant_id
user_id
role
status
created_at
```

---

## tables

```text
id
restaurant_id
name
number
status
qr_token
created_at
updated_at
```

---

## categories

```text
id
restaurant_id
name
description
position
active
created_at
updated_at
```

---

## products

```text
id
restaurant_id
category_id
name
description
price
image_url
available
position
created_at
updated_at
```

---

## product_options

Para variantes y extras.

```text
id
product_id
name
type
required
```

Esta parte podrá simplificarse en el primer MVP si necesitamos reducir complejidad.

---

## orders

```text
id
restaurant_id
table_id
status
subtotal
total
notes
accepted_by
accepted_at
ready_at
delivered_at
created_at
updated_at
```

---

## order_items

```text
id
order_id
product_id
product_name
quantity
unit_price
subtotal
notes
```

Se conservarán el nombre y precio del producto al momento de realizar el pedido.

Esto evitará que los pedidos históricos cambien cuando posteriormente se modifique un producto.

---

## waiter_calls

```text
id
restaurant_id
table_id
type
status
handled_by
handled_at
created_at
```

---

## audit_logs

```text
id
restaurant_id
user_id
action
entity_type
entity_id
metadata
created_at
```

---

# 34. Relaciones principales

```text
RESTAURANT
   │
   ├── USERS
   ├── TABLES
   ├── CATEGORIES
   ├── PRODUCTS
   ├── ORDERS
   └── WAITER CALLS
```

Y:

```text
CATEGORY
   ↓
PRODUCT

TABLE
   ↓
ORDER

ORDER
   ↓
ORDER ITEMS

ORDER ITEM
   ↓
PRODUCT
```

---

# 35. Arquitectura técnica propuesta

## Frontend

```text
Next.js
TypeScript
```

## UI

```text
Tailwind CSS
shadcn/ui
```

## Backend / datos

```text
Supabase
```

## Base de datos

```text
PostgreSQL
```

## Autenticación

```text
Supabase Auth
```

## Storage

```text
Supabase Storage
```

## Realtime

```text
Supabase Realtime
```

## Deploy

```text
Vercel
```

## Control de versiones

```text
Git
GitHub
```

---

# 36. Arquitectura conceptual

```text
                         INTERNET
                            │
                            ▼
                         VERCEL
                            │
                    ┌───────┴────────┐
                    │                │
                    ▼                ▼
               EXPERIENCIA       PANEL STAFF
                CLIENTE          MESERO/COCINA
                    │                │
                    └───────┬────────┘
                            ▼
                         NEXT.JS
                            │
                            ▼
                         SUPABASE
                    ┌───────┼────────┐
                    │       │        │
                    ▼       ▼        ▼
               POSTGRESQL  AUTH   STORAGE
                    │
                    ▼
                 REALTIME
```

---

# 37. Flujo Realtime

## Nuevo pedido

```text
CLIENTE
   ↓
CREA PEDIDO
   ↓
DATABASE
   ↓
REALTIME
   ↓
MESERO
```

## Pedido aceptado

```text
MESERO
   ↓
ACEPTA
   ↓
DATABASE
   ↓
REALTIME
   ↓
COCINA
```

## Pedido listo

```text
COCINA
   ↓
MARCA LISTO
   ↓
DATABASE
   ↓
REALTIME
   ↓
MESERO
```

## Nueva solicitud

```text
CLIENTE
   ↓
SOLICITA MESERO
   ↓
DATABASE
   ↓
REALTIME
   ↓
MESERO
```

---

# 38. Aplicaciones

No se desarrollarán inicialmente aplicaciones móviles nativas.

El sistema será web.

El cliente podrá utilizar:

```text
QR
 ↓
Safari / Chrome
 ↓
Carta
```

El personal podrá utilizar:

```text
Smartphone
Tablet
Computador
```

---

# 39. Lo que no entra inicialmente

Queda fuera del primer MVP:

```text
App iOS
App Android
Pagos online
Facturación electrónica
POS
Inventario avanzado
Contabilidad
Delivery
Reservaciones
Programa de puntos
IA
Integraciones complejas
```

Estas funciones podrán agregarse después.

---

# 40. Orden de desarrollo

## Sprint 1 — Infraestructura

```text
Crear proyecto
↓
GitHub
↓
Supabase
↓
Base de datos
↓
Auth
↓
Roles
```

---

## Sprint 2 — Administrador

```text
Productos
Categorías
Mesas
QR
Configuración
```

---

## Sprint 3 — Cliente

```text
QR
↓
Carta
↓
Categoría
↓
Producto
↓
Carrito
```

---

## Sprint 4 — Pedidos

```text
Carrito
↓
Confirmación
↓
Pedido
↓
Estado
```

---

## Sprint 5 — Mesero

```text
Dashboard
↓
Pedidos
↓
Aceptar
↓
Rechazar
↓
Solicitudes
↓
Mesas
```

---

## Sprint 6 — Cocina

```text
Pedidos aceptados
↓
Preparar
↓
Listo
```

---

## Sprint 7 — Integración

```text
CLIENTE
   ↓
MESERO
   ↓
COCINA
   ↓
MESERO
   ↓
CLIENTE
```

---

# 41. Prueba principal del MVP

Se deberá poder realizar este recorrido completamente:

```text
Crear restaurante
      ↓
Crear mesas
      ↓
Crear categorías
      ↓
Crear productos
      ↓
Generar QR
      ↓
Escanear QR
      ↓
Cliente consulta carta
      ↓
Cliente realiza pedido
      ↓
Mesero recibe
      ↓
Mesero acepta
      ↓
Cocina recibe
      ↓
Cocina prepara
      ↓
Cocina marca listo
      ↓
Mesero recibe actualización
      ↓
Mesero entrega
      ↓
Pedido finalizado
```

---

# 42. Pruebas de errores

Se deberá comprobar:

```text
QR inválido
Mesa desactivada
Restaurante cerrado
Producto agotado
Pedido duplicado
Doble aceptación
Pedido rechazado
Conexión perdida
Solicitud duplicada
Usuario sin permisos
Sesión expirada
Producto eliminado
Precio cambiado
Pedido cancelado
Error Realtime
```

---

# 43. Demo comercial

La primera demo deberá contar con:

```text
1 restaurante
10 mesas
Varias categorías
Productos con fotografías
QR
Panel administrador
Panel mesero
Panel cocina
```

La demostración ideal:

```text
CELULAR 1
Cliente
↓
Escanea
↓
Pide


TABLET
Mesero
↓
Acepta


TABLET 2
Cocina
↓
Prepara
↓
Marca listo


TABLET
Mesero
↓
Ve "LISTO"
```

---

# 44. Objetivo de la demo

La persona que observa la demostración debe entender en pocos minutos:

> “El cliente escanea el QR, hace el pedido, el mesero lo valida, cocina lo prepara y el mesero lo entrega.”

No será necesario explicar arquitectura técnica al restaurante.

---

# 45. Estrategia de validación

Después de tener la demo:

```text
DEMO
 ↓
3–5 RESTAURANTES
 ↓
USO REAL
 ↓
OBSERVACIÓN
 ↓
FEEDBACK
 ↓
MEJORAS
 ↓
V2
```

No se recomienda lanzar inicialmente a decenas de restaurantes.

Los primeros usuarios servirán para descubrir problemas reales.

---

# 46. Estado general del proyecto

```text
✅ IDEA
✅ PROBLEMA
✅ PROPUESTA DE VALOR
✅ PÚBLICO OBJETIVO
✅ ROLES
✅ FLUJOS
✅ CLIENTE UX
✅ MESERO UX
✅ COCINA UX
✅ ADMINISTRADOR UX
✅ MAPA DE PANTALLAS
✅ REGLAS DE NEGOCIO
✅ MODELO DE DATOS CONCEPTUAL
✅ ARQUITECTURA BASE

⏳ UI DESIGN SYSTEM
⏳ DISEÑO VISUAL
⏳ MODELO DE DATOS DEFINITIVO
⏳ SQL
⏳ CONFIGURACIÓN DEL PROYECTO
⏳ DESARROLLO
⏳ TESTING
⏳ DEMO
⏳ PILOTO
⏳ VENTA
```

---

# 47. Próxima fase oficial

# UI DESIGN SYSTEM

Antes de comenzar a programar, se definirá:

```text
Colores
Tipografías
Espaciado
Botones
Cards
Inputs
Navbar
Bottom navigation
Modales
Toast
Loading
Skeletons
Iconos
Estados
Responsive
```

La prioridad será:

```text
1. CLIENTE MOBILE
2. MESERO
3. COCINA
4. ADMINISTRADOR
```

El objetivo será convertir los wireframes conceptuales en una **interfaz visual coherente, moderna y comercialmente atractiva**.

Después:

```text
UI DESIGN SYSTEM
        ↓
MODELO DE DATOS DEFINITIVO
        ↓
SQL
        ↓
SUPABASE
        ↓
ESTRUCTURA NEXT.JS
        ↓
DESARROLLO DEL MVP
```

# 48. Principio de dirección del proyecto

Durante el desarrollo se mantendrá la siguiente prioridad:

> **Primero valor para el restaurante, después complejidad técnica.**

Y:

> **Primero una experiencia sencilla que funcione, después funcionalidades adicionales.**

El objetivo inicial no es construir una plataforma gigantesca.

El objetivo es conseguir:

```text
PRODUCTO FUNCIONANDO
        ↓
RESTAURANTE REAL
        ↓
CLIENTES REALES
        ↓
PRIMER INGRESO
        ↓
MEJORA CONTINUA
```