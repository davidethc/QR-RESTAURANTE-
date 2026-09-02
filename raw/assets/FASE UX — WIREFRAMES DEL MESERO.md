# FASE UX — WIREFRAMES DEL MESERO

## 1. Objetivo

Diseñar la experiencia completa del mesero dentro de la plataforma.

El mesero será el principal intermediario entre:

```text
CLIENTE
   ↓
MESERO
   ↓
COCINA
```

El mesero será responsable de revisar y gestionar:

- Pedidos realizados por clientes.
- Solicitudes de atención.
- Solicitudes de cuenta.
- Estado de las mesas.
- Entrega de pedidos.

La interfaz deberá estar diseñada para **rapidez, claridad y operación durante horas de alta demanda**.

---

# 2. Principio operativo del mesero

El mesero será quien valide los pedidos antes de enviarlos a cocina.

```text
CLIENTE
   ↓
ENVÍA PEDIDO
   ↓
MESERO
   ↓
ACEPTAR / RECHAZAR
   ↓
COCINA
```

La cocina no recibe directamente pedidos pendientes.

---

# 3. Responsabilidades del mesero

El mesero podrá:

- Ver pedidos nuevos.
- Revisar detalles.
- Aceptar pedidos.
- Rechazar pedidos.
- Indicar motivo de rechazo.
- Ver pedidos aceptados.
- Ver pedidos en preparación.
- Ver pedidos listos.
- Marcar pedidos como entregados.
- Recibir solicitudes de atención.
- Aceptar solicitudes.
- Rechazar solicitudes.
- Marcar solicitudes como atendidas.
- Recibir solicitudes de cuenta.
- Gestionar mesas.
- Consultar el estado de las mesas.

---

# 4. Navegación principal

```text
LOGIN
  ↓
DASHBOARD
  ├── Pedidos
  │    ├── Nuevos
  │    ├── Aceptados
  │    ├── En preparación
  │    ├── Listos
  │    └── Entregados
  │
  ├── Solicitudes
  │
  └── Mesas
```

El acceso a cada módulo dependerá de los permisos asignados al usuario.

---

# 5. Pantalla 01 — Login

El mesero debe iniciar sesión.

```text
┌───────────────────────────┐
│          LOGO             │
│                           │
│      PANEL MESERO         │
│                           │
│ Correo                    │
│ [____________________]    │
│                           │
│ Contraseña                │
│ [____________________]    │
│                           │
│ [ INICIAR SESIÓN ]        │
│                           │
└───────────────────────────┘
```

## Estados

### Credenciales incorrectas

```text
Correo o contraseña incorrectos.
```

### Cuenta desactivada

```text
Tu cuenta está desactivada.

Contacta al administrador.
```

### Error de conexión

```text
No pudimos iniciar sesión.

[ REINTENTAR ]
```

---

# 6. Pantalla 02 — Dashboard

El dashboard debe mostrar inmediatamente las tareas que requieren atención.

Ejemplo:

```text
BUENAS TARDES

La Casa del Sabor

┌──────────────────┐
│ 3                │
│ PEDIDOS NUEVOS   │
└──────────────────┘

┌──────────────────┐
│ 2                │
│ SOLICITUDES      │
└──────────────────┘

┌──────────────────┐
│ 4                │
│ MESAS OCUPADAS   │
└──────────────────┘

----------------------------

PEDIDOS NUEVOS

#128  Mesa 07
#129  Mesa 03

----------------------------

SOLICITUDES

🔔 Mesa 04
🔔 Mesa 08
```

---

# 7. Prioridad visual del dashboard

La prioridad será:

```text
1. Pedidos nuevos
2. Solicitudes pendientes
3. Pedidos listos
4. Mesas con atención
5. Información secundaria
```

Lo urgente siempre debe estar más visible.

---

# 8. Notificación de pedido nuevo

Cuando llegue un pedido:

```text
🔔 NUEVO PEDIDO

Mesa 07

Pedido #128

2 Hamburguesas
1 Papas
2 Coca-Colas
```

El pedido debe llamar visualmente la atención.

Posteriormente puede añadirse sonido o notificación push.

---

# 9. Pantalla 03 — Pedidos nuevos

Lista de pedidos pendientes.

```text
PEDIDOS NUEVOS

┌───────────────────────────┐
│ #128                      │
│ Mesa 07                   │
│                           │
│ 2 × Hamburguesa           │
│ 1 × Papas                 │
│ 2 × Coca-Cola             │
│                           │
│ [ VER PEDIDO ]            │
└───────────────────────────┘

┌───────────────────────────┐
│ #129                      │
│ Mesa 03                   │
│                           │
│ 1 × Pizza                 │
│ 2 × Jugos                 │
│                           │
│ [ VER PEDIDO ]            │
└───────────────────────────┘
```

---

# 10. Pantalla 04 — Detalle del pedido

Al abrir un pedido:

```text
PEDIDO #128

Mesa 07

Cliente:
Mesa 07

----------------------------

2 × Hamburguesa Especial
   Sin cebolla

1 × Papas

2 × Coca-Cola

----------------------------

TOTAL: $19.00

[ ACEPTAR ]
[ RECHAZAR ]
```

Debe existir suficiente información para que el mesero tome una decisión.

---

# 11. Aceptar pedido

Cuando el mesero pulsa:

**ACEPTAR**

el sistema:

1. Valida nuevamente el pedido.
2. Registra quién lo aceptó.
3. Cambia el estado.
4. Envía el pedido a cocina.
5. Informa al cliente.

Flujo:

```text
PENDIENTE
    ↓
MESERO ACEPTA
    ↓
ACEPTADO
    ↓
COCINA
```

---

# 12. Confirmación de aceptación

No necesariamente se necesita una segunda confirmación para no ralentizar la operación.

Al pulsar:

```text
[ ACEPTAR ]
```

podría mostrarse temporalmente:

```text
✓ Pedido aceptado

Enviado a cocina.
```

El botón deberá quedar bloqueado durante el procesamiento.

---

# 13. Rechazar pedido

Si el mesero determina que el pedido no puede procesarse:

```text
PEDIDO #128

[ ACEPTAR ]
[ RECHAZAR ]
```

Al rechazar:

```text
RECHAZAR PEDIDO

Selecciona un motivo:

○ Producto agotado
○ Producto no disponible
○ Error en pedido
○ Restaurante no puede procesarlo
○ Otro

Comentario
[________________________]

[ CONFIRMAR RECHAZO ]
```

---

# 14. Motivo de rechazo

El motivo deberá quedar registrado.

Ejemplo:

```text
Pedido #128

RECHAZADO

Motivo:
Producto agotado

Mesero:
Juan Pérez

Hora:
14:23
```

Esto permitirá posteriormente analizar rechazos.

---

# 15. Rechazo comunicado al cliente

Después de confirmar el rechazo, el cliente deberá recibir una actualización.

Ejemplo:

```text
PEDIDO #128

Pedido rechazado.

Motivo:
Uno de los productos
no está disponible.

[ VOLVER A LA CARTA ]
```

El sistema no debe mostrar información interna innecesaria.

---

# 16. Validación antes de aceptar

Antes de enviar a cocina, el sistema debe validar:

- Que el pedido siga pendiente.
- Que los productos sigan disponibles.
- Que los precios sean consistentes.
- Que la mesa siga activa.
- Que el pedido no haya sido procesado previamente.

Si algo cambió:

```text
No se puede aceptar el pedido.

El pedido fue actualizado
o uno de los productos ya
no está disponible.
```

---

# 17. Pedido procesado por otro mesero

Puede ocurrir que dos meseros tengan abierta la misma pantalla.

Ejemplo:

Mesero A:

```text
[ACEPTAR]
```

Mesero B:

```text
[ACEPTAR]
```

Solo uno debe poder procesarlo.

El segundo deberá recibir:

```text
Este pedido ya fue procesado
por otro miembro del equipo.
```

Esto evita pedidos duplicados.

---

# 18. Pantalla de pedidos activos

Después de aceptar:

```text
PEDIDOS ACTIVOS

ACEPTADOS

#128
Mesa 07

#129
Mesa 03

EN PREPARACIÓN

#125
Mesa 05

LISTOS

#123
Mesa 02
```

---

# 19. Pedidos aceptados

Los pedidos aceptados ya fueron enviados a cocina.

Ejemplo:

```text
#128

Mesa 07

Estado:
ACEPTADO

Esperando preparación.
```

El mesero no necesita volver a aceptar.

---

# 20. Pedidos en preparación

Cuando cocina empieza:

```text
#128
Mesa 07

EN PREPARACIÓN
```

El mesero puede consultar el pedido.

---

# 21. Pedido listo

Cuando cocina pulsa:

**MARCAR LISTO**

el mesero recibe:

```text
🔔 PEDIDO LISTO

#128
Mesa 07

2 Hamburguesas
1 Papas
2 Coca-Colas
```

Este pedido deberá tener una prioridad alta.

---

# 22. Pedido listo — Acción del mesero

El mesero puede abrir:

```text
PEDIDO #128

Mesa 07

✓ Listo

[ MARCAR ENTREGADO ]
```

---

# 23. Pedido entregado

Después de entregar:

```text
PEDIDO #128

Estado:
ENTREGADO ✓
```

El pedido queda registrado como completado.

---

# 24. La entrega no debe hacerla cocina

Responsabilidad:

```text
COCINA
   ↓
PREPARA
   ↓
MARCA LISTO
   ↓
MESERO
   ↓
RECOGE
   ↓
ENTREGA
```

Cocina no tendrá control de entrega.

---

# 25. Pantalla 05 — Solicitudes

El mesero tendrá una sección independiente para solicitudes.

Ejemplo:

```text
SOLICITUDES

🔔 Mesa 04
Solicita atención

Hace 00:32

[ ATENDER ]
[ RECHAZAR ]

---------------------

💳 Mesa 08
Solicita cuenta

Hace 01:15

[ ATENDER ]
[ RECHAZAR ]
```

---

# 26. Tipos de solicitudes

Inicialmente:

### Llamar mesero

```text
🛎️
Mesa 04 solicita atención
```

### Solicitar cuenta

```text
💳
Mesa 08 solicita cuenta
```

Posteriormente:

- Cubiertos.
- Bebidas.
- Ayuda.
- Otros.

---

# 27. Aceptar solicitud de atención

Cuando el mesero pulsa:

**ATENDER**

```text
Mesa 04

ATENCIÓN EN PROCESO

Mesero asignado:
Juan Pérez
```

Después de atender:

```text
[ MARCAR ATENDIDA ]
```

---

# 28. Rechazar solicitud

Si no puede atenderse:

```text
RECHAZAR SOLICITUD

Motivo:

○ No disponible
○ Solicitud duplicada
○ Otro

[ CONFIRMAR ]
```

Se registra el motivo.

---

# 29. Solicitud de cuenta

Flujo:

```text
CLIENTE
   ↓
SOLICITA CUENTA
   ↓
MESERO
   ↓
ACEPTA
   ↓
LLEVA CUENTA
   ↓
MARCA ATENDIDA
```

El pago queda fuera del alcance inicial.

---

# 30. Solicitud duplicada

Si el cliente intenta pulsar varias veces:

```text
Ya existe una solicitud
pendiente para esta mesa.
```

El mesero verá una sola solicitud activa.

---

# 31. Solicitud atendida

Después de solucionar:

```text
Mesa 04

Solicitud:
Llamar mesero

Estado:
ATENDIDA ✓
```

Queda en historial.

---

# 32. Pantalla 06 — Mesas

El mesero podrá visualizar las mesas.

```text
MESAS

┌──────┐ ┌──────┐ ┌──────┐
│ M01  │ │ M02  │ │ M03  │
│ 🟢   │ │ 🔴   │ │ 🟡   │
└──────┘ └──────┘ └──────┘

┌──────┐ ┌──────┐ ┌──────┐
│ M04  │ │ M05  │ │ M06  │
│ 🟢   │ │ 🔴   │ │ 🟢   │
└──────┘ └──────┘ └──────┘
```

---

# 33. Información de mesa

Al seleccionar:

```text
MESA 07

Estado:
OCUPADA

Pedidos activos:
#128
#130

Solicitudes:
Ninguna

Total:
$28.00
```

---

# 34. Información que el mesero necesita

El detalle de mesa debe permitir saber rápidamente:

- Estado.
- Pedidos.
- Solicitudes.
- Total.
- Pedidos pendientes.
- Pedidos listos.

No debe mostrar información administrativa innecesaria.

---

# 35. Colores de estados

Los estados pueden utilizar señales visuales consistentes.

Ejemplo:

```text
🟢 Disponible
🟡 Atención
🔴 Ocupada / urgente
🔵 Pedido en proceso
```

La interfaz no debe depender únicamente del color.

También debe utilizar texto o iconos.

---

# 36. Acciones rápidas

El mesero trabaja bajo presión.

Por ello algunas acciones deben estar disponibles rápidamente:

```text
[ PEDIDOS ]
[ SOLICITUDES ]
[ MESAS ]
```

Y desde el dashboard:

```text
[ PEDIDO NUEVO ]
[ SOLICITUD ]
[ PEDIDO LISTO ]
```

---

# 37. Pedido urgente

Un pedido que lleva demasiado tiempo pendiente debe poder diferenciarse.

Ejemplo:

```text
#128
Mesa 07

Pendiente
⏱ 05:32
```

Posteriormente podremos implementar indicadores de demora.

---

# 38. Solicitud urgente

Una solicitud pendiente durante demasiado tiempo:

```text
Mesa 04

Solicita atención

⏱ 03:45
```

Puede destacarse visualmente.

Esto será útil especialmente cuando el restaurante esté lleno.

---

# 39. Sesión del mesero

Mientras el mesero esté trabajando:

```text
Usuario:
Juan Pérez

Rol:
Mesero

Restaurante:
La Casa del Sabor
```

Debe poder cerrar sesión.

---

# 40. Cambio de estado en tiempo real

Cuando ocurra algo importante, el panel debería actualizarse.

Ejemplo:

```text
COCINA
   ↓
Marca pedido LISTO
   ↓
SISTEMA
   ↓
MESERO recibe actualización
```

El mesero no debería tener que recargar manualmente la página.

---

# 41. Ejemplo completo — Pedido normal

```text
CLIENTE
   ↓
Mesa 7
   ↓
Envía pedido #128
   ↓
MESERO recibe
   ↓
Revisa
   ↓
ACEPTA
   ↓
COCINA recibe
   ↓
Prepara
   ↓
MARCA LISTO
   ↓
MESERO recibe notificación
   ↓
Recoge pedido
   ↓
Entrega
   ↓
MARCA ENTREGADO
```

---

# 42. Ejemplo completo — Pedido rechazado

```text
CLIENTE
   ↓
Envía pedido
   ↓
MESERO recibe
   ↓
Producto no disponible
   ↓
RECHAZA
   ↓
Selecciona motivo
   ↓
SISTEMA registra rechazo
   ↓
CLIENTE recibe aviso
   ↓
Pedido finalizado como RECHAZADO
```

No llega a cocina.

---

# 43. Ejemplo completo — Llamar al mesero

```text
CLIENTE
   ↓
Pulsa "Llamar mesero"
   ↓
MESERO recibe solicitud
   ↓
ACEPTAR / ATENDER
   ↓
Mesero va a la mesa
   ↓
Resuelve solicitud
   ↓
MARCA ATENDIDA
```

No interviene cocina.

---

# 44. Ejemplo completo — Solicitar cuenta

```text
CLIENTE
   ↓
Solicita cuenta
   ↓
MESERO recibe
   ↓
ATENDER
   ↓
Mesero lleva cuenta
   ↓
MARCAR ATENDIDA
```

El proceso de pago se manejará posteriormente.

---

# 45. Errores que el mesero debe poder manejar

El sistema debe contemplar:

- Pedido ya aceptado por otro mesero.
- Pedido ya rechazado.
- Pedido cancelado.
- Producto agotado.
- Mesa desactivada.
- Error de conexión.
- Sesión expirada.
- Falta de permisos.
- Solicitud duplicada.
- Pedido que ya fue entregado.
- Pedido marcado listo pero no encontrado.
- Error al actualizar estado.

---

# 46. Error de conexión

Si el mesero intenta aceptar:

```text
No pudimos actualizar el pedido.

Comprueba tu conexión
e inténtalo nuevamente.
```

No debe mostrar:

> Pedido aceptado

hasta que el servidor confirme.

---

# 47. Acción duplicada

Si el mesero pulsa dos veces:

```text
[ ACEPTAR ]
```

El sistema debe procesar únicamente una acción.

El botón deberá deshabilitarse durante el proceso.

---

# 48. Pedido eliminado o cambiado

Si el administrador modifica información mientras el mesero está viendo un pedido:

El sistema debe validar antes de realizar una acción crítica.

Ejemplo:

```text
Este pedido cambió.

Actualiza la información
antes de continuar.

[ ACTUALIZAR ]
```

---

# 49. Estados visuales de pedidos

El mesero deberá poder distinguir:

```text
PENDIENTE
ACEPTADO
EN PREPARACIÓN
LISTO
ENTREGADO
RECHAZADO
CANCELADO
```

Se recomienda utilizar:

- Texto.
- Iconos.
- Indicadores visuales.
- Tiempo transcurrido.

---

# 50. Historial de pedidos

Aunque no será una prioridad visual, el sistema deberá conservar historial.

Ejemplo:

```text
PEDIDOS ANTERIORES

#120
Mesa 3
ENTREGADO

#121
Mesa 5
RECHAZADO

#122
Mesa 2
ENTREGADO
```

Esto servirá posteriormente para estadísticas y soporte.

---

# 51. Principio de operación

El mesero debe poder resolver la mayoría de sus tareas sin navegar por muchas pantallas.

Objetivo:

```text
PEDIDO NUEVO
   ↓
VER
   ↓
ACEPTAR / RECHAZAR
```

Y:

```text
SOLICITUD
   ↓
ATENDER
   ↓
ATENDIDA
```

Y:

```text
PEDIDO LISTO
   ↓
VER
   ↓
ENTREGADO
```

---

# 52. Prioridad en dispositivos

La interfaz del mesero podrá funcionar en:

- Smartphone.
- Tablet.
- Computador.

La recomendación inicial es:

> **Diseñarla primero para tablet y smartphone.**

Esto permite que un restaurante utilice un dispositivo disponible sin comprar hardware específico.

---

# 53. Diseño para alta demanda

Cuando existan muchos pedidos simultáneamente, la interfaz debe:

- Separar estados.
- Priorizar pendientes.
- Mostrar tiempos.
- Evitar información innecesaria.
- Permitir acciones rápidas.
- Evitar recargas manuales.

Ejemplo:

```text
NUEVOS (4)

#128 Mesa 7
#129 Mesa 2
#130 Mesa 9
#131 Mesa 4
```

---

# 54. Objetivo UX del mesero

La experiencia ideal será:

> **“Abro el panel y sé inmediatamente qué necesita mi atención.”**

Al entrar, el mesero debe identificar rápidamente:

```text
¿Qué pedidos llegaron?
¿Qué pedidos debo aceptar?
¿Qué solicitudes existen?
¿Qué pedidos están listos?
¿Qué mesas requieren atención?
```

---

# 55. Resultado de la fase

Al finalizar esta fase tendremos definido:

- Login.
- Dashboard.
- Pedidos.
- Aceptación.
- Rechazo.
- Solicitudes.
- Cuenta.
- Mesas.
- Pedidos listos.
- Entrega.
- Estados.
- Errores.
- Actualizaciones en tiempo real.
- Casos especiales.

---

# 56. Estado del proyecto

```text
✅ Idea
✅ Problema
✅ Propuesta de valor
✅ Público objetivo
✅ Roles
✅ Flujo operativo
✅ Mapa de pantallas
✅ UX Cliente
✅ Wireframes conceptuales Cliente
✅ UX Mesero
✅ Wireframes conceptuales Mesero

⏳ UX Cocina
⏳ UX Administrador
⏳ Reglas de negocio definitivas
⏳ Modelo de datos
⏳ Arquitectura técnica
⏳ UI visual
⏳ Desarrollo
⏳ Demo
⏳ Piloto
⏳ Venta
```

---

# 57. Próxima fase

La siguiente fase oficial será:

# WIREFRAMES UX — COCINA

La cocina tendrá una experiencia mucho más sencilla:

```text
LOGIN
 ↓
PANEL COCINA
 ↓
PEDIDOS ACEPTADOS
 ↓
EN PREPARACIÓN
 ↓
MARCAR LISTO
```

La cocina:

- No aceptará pedidos.
- No rechazará pedidos.
- No administrará productos.
- No administrará mesas.
- No administrará usuarios.

Su única responsabilidad será:

> **Preparar pedidos aceptados por el mesero y marcar cuándo estén listos.**