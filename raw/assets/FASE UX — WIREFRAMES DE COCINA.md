# FASE UX — WIREFRAMES DE COCINA

## 1. Objetivo

Diseñar una interfaz extremadamente sencilla para el personal de cocina.

La cocina no administrará el restaurante ni tomará decisiones sobre los pedidos.

Su única responsabilidad dentro del MVP será:

> **Visualizar pedidos aceptados por el mesero, prepararlos y marcar cuándo estén listos.**

---

# 2. Flujo operativo

```text id="j7q2me"
CLIENTE
   ↓
ENVÍA PEDIDO
   ↓
MESERO
   ↓
ACEPTA
   ↓
COCINA
   ↓
VISUALIZA PEDIDO
   ↓
PREPARA
   ↓
MARCA LISTO
   ↓
MESERO
   ↓
ENTREGA
```

La cocina nunca recibirá directamente un pedido en estado pendiente.

---

# 3. Responsabilidades de cocina

## Cocina podrá

- Iniciar sesión.
- Ver pedidos aceptados.
- Ver detalles del pedido.
- Ver mesa.
- Ver cantidades.
- Ver modificaciones.
- Ver observaciones.
- Marcar pedido como en preparación.
- Marcar pedido como listo.
- Consultar pedidos activos.
- Consultar pedidos listos, según necesidad operativa.

## Cocina no podrá

- Aceptar pedidos.
- Rechazar pedidos.
- Modificar productos.
- Cambiar precios.
- Gestionar mesas.
- Gestionar clientes.
- Gestionar empleados.
- Configurar el restaurante.
- Crear categorías.
- Crear productos.
- Administrar QR.

---

# 4. Principio de diseño

La interfaz de cocina debe cumplir:

> **Máxima información útil con el mínimo de interacción.**

El trabajador debe poder mirar la pantalla y comprender inmediatamente:

- Qué pedido debe preparar.
- Para qué mesa.
- Qué productos contiene.
- Qué modificaciones existen.
- Cuánto tiempo lleva esperando.
- Qué pedidos siguen pendientes.

---

# 5. Dispositivo recomendado

La interfaz deberá funcionar en:

- Tablet.
- Computador.
- Smartphone.

La prioridad para cocina será:

```text id="h7fjwx"
TABLET
   ↓
DESKTOP
   ↓
SMARTPHONE
```

Una tablet puede permanecer en un lugar visible de la cocina.

---

# 6. Pantalla 01 — Login

La cocina inicia sesión.

```text id="1b7bbv"
┌──────────────────────────┐
│           LOGO           │
│                          │
│        COCINA            │
│                          │
│ Correo                   │
│ [____________________]   │
│                          │
│ Contraseña               │
│ [____________________]   │
│                          │
│ [ INICIAR SESIÓN ]       │
│                          │
└──────────────────────────┘
```

---

# 7. Estados del login

## Credenciales incorrectas

```text id="m3a8d6"
Correo o contraseña incorrectos.
```

## Usuario sin permisos

```text id="2d5k3s"
Esta cuenta no tiene acceso
al panel de cocina.
```

## Cuenta desactivada

```text id="yf2h48"
Esta cuenta está desactivada.
Contacta al administrador.
```

## Error de conexión

```text id="c6v5hf"
No pudimos iniciar sesión.

[ REINTENTAR ]
```

---

# 8. Pantalla 02 — Panel de cocina

Esta es la pantalla principal.

Debe ser prácticamente autosuficiente.

Ejemplo:

```text id="6w7w9c"
COCINA

NUEVOS        EN PREPARACIÓN        LISTOS

   3                  2                 1

────────────────────────────────────────────

NUEVOS

┌──────────────────────┐
│ #128                 │
│ MESA 07              │
│ Hace 00:18           │
│                      │
│ 2 Hamburguesas       │
│ 1 Papas              │
│ 2 Coca-Colas         │
│                      │
│ Nota: una sin cebolla│
│                      │
│ [ PREPARAR ]         │
└──────────────────────┘
```

---

# 9. Columnas de trabajo

La interfaz puede organizarse en tres zonas:

```text id="jgj9s6"
┌─────────────┬───────────────┬───────────────┐
│   NUEVOS    │ PREPARACIÓN   │    LISTOS     │
├─────────────┼───────────────┼───────────────┤
│ #128        │ #125          │ #123          │
│ Mesa 7      │ Mesa 4        │ Mesa 2        │
│             │               │               │
│ #129        │ #126          │               │
│ Mesa 3      │ Mesa 8        │               │
└─────────────┴───────────────┴───────────────┘
```

Esto permitirá visualizar el flujo de trabajo de forma inmediata.

---

# 10. Pedido nuevo

Un pedido aceptado por el mesero aparecerá automáticamente en cocina.

Ejemplo:

```text id="qfuqjd"
┌─────────────────────────┐
│ PEDIDO #128             │
│ MESA 07                 │
│                         │
│ Hace 00:32              │
│                         │
│ 2 × Hamburguesa         │
│ 1 × Papas               │
│ 2 × Coca-Cola           │
│                         │
│ NOTA                    │
│ Una hamburguesa         │
│ sin cebolla             │
│                         │
│ [ PREPARAR ]            │
└─────────────────────────┘
```

---

# 11. ¿Qué significa "Preparar"?

Cuando cocina recibe el pedido puede indicar:

> Estoy comenzando este pedido.

Al pulsar:

```text id="8p4krh"
[ PREPARAR ]
```

el pedido pasa de:

```text id="97gc58"
ACEPTADO
```

a:

```text id="kzhqll"
EN PREPARACIÓN
```

---

# 12. Pedidos en preparación

Ejemplo:

```text id="syvt84"
EN PREPARACIÓN

┌─────────────────────────┐
│ #125                    │
│ MESA 04                 │
│                         │
│ 1 × Pizza               │
│ 2 × Jugos               │
│                         │
│ Hace 05:20              │
│                         │
│ [ MARCAR LISTO ]        │
└─────────────────────────┘
```

El tiempo puede ayudar a cocina y al restaurante a detectar demoras.

---

# 13. Marcar pedido como listo

Cuando el pedido termina:

```text id="by2s9p"
[ MARCAR LISTO ]
```

El sistema:

1. Actualiza el pedido.
2. Cambia el estado a `LISTO`.
3. Registra hora.
4. Registra usuario de cocina.
5. Informa al sistema.
6. El mesero recibe la actualización.

---

# 14. Pedido listo

Después de marcar:

```text id="cn3ltu"
✓ PEDIDO LISTO

#125
Mesa 04

El mesero ha sido notificado.
```

Puede permanecer temporalmente en la columna:

```text id="f8p94j"
LISTOS
```

---

# 15. Relación cocina → mesero

El flujo debe ser:

```text id="zmq9p3"
COCINA
   ↓
MARCA LISTO
   ↓
SISTEMA
   ↓
MESERO
   ↓
RECIBE AVISO
   ↓
RECOGE PEDIDO
   ↓
ENTREGA
```

Cocina no necesita preocuparse por la entrega.

---

# 16. Actualización en tiempo real

Cuando el mesero acepta un pedido:

```text id="z0wz0r"
MESERO
   ↓
ACEPTA PEDIDO #128
   ↓
SISTEMA
   ↓
COCINA
   ↓
PEDIDO APARECE
```

No debe requerir:

```text
Actualizar página
```

manualmente.

---

# 17. Nuevo pedido mientras cocina está ocupada

Ejemplo:

Cocina está preparando:

```text id="fnfhcr"
#125
#126
```

Llega:

```text id="oayqu2"
#127
```

La interfaz debe mostrarlo automáticamente en:

**NUEVOS**

El trabajador podrá decidir cuál preparar primero según la operación del restaurante.

---

# 18. Orden de prioridad

El sistema no debe asumir inicialmente que todos los restaurantes utilizan la misma lógica de prioridad.

Por defecto:

```text id="qv5o38"
Más antiguo
    ↓
Más reciente
```

Pero posteriormente podríamos permitir:

- Prioridad manual.
- Tipo de producto.
- Tiempo estimado.
- Delivery.
- Pedidos urgentes.

Esto queda fuera del MVP.

---

# 19. Detalle del pedido

Al seleccionar una tarjeta:

```text id="yytf3c"
PEDIDO #128

Mesa 07

-------------------------

2 × Hamburguesa Especial

Configuración:
1 normal
1 sin cebolla

-------------------------

1 × Papas

-------------------------

2 × Coca-Cola

-------------------------

NOTA:

Entregar una hamburguesa
sin cebolla.

-------------------------

[ MARCAR LISTO ]
```

El detalle debe ser legible desde cierta distancia.

---

# 20. Tamaño de información

Para cocina:

> **El contenido del pedido es más importante que los elementos decorativos.**

Debe priorizarse:

1. Número del pedido.
2. Mesa.
3. Productos.
4. Cantidades.
5. Modificaciones.
6. Observaciones.
7. Tiempo.
8. Acción.

---

# 21. Producto con modificaciones

Ejemplo:

```text id="9gynm2"
2 × Hamburguesas

Hamburguesa #1
Normal

Hamburguesa #2
Sin cebolla
Extra queso
```

Las modificaciones deben distinguirse claramente.

Nunca deberían mezclarse de manera confusa con los demás productos.

---

# 22. Notas especiales

Ejemplo:

```text id="o6v6sx"
⚠️ NOTA

Una hamburguesa sin cebolla.
Cliente alérgico.
```

Las observaciones importantes deben tener alta visibilidad.

---

# 23. Producto agotado después de aceptar

Puede ocurrir:

1. Cliente solicita producto.
2. Mesero acepta.
3. Cocina recibe.
4. Cocina descubre un problema.

El manejo final de esta situación será una regla de negocio posterior.

Para el MVP:

> Cocina no tendrá botón de rechazo.

Deberá existir un canal de comunicación con el mesero.

Por ejemplo:

```text id="o7dnw5"
PROBLEMA CON PEDIDO

Comunica el inconveniente
al mesero.
```

No debemos permitir que cocina cancele silenciosamente un pedido.

---

# 24. Pedido cancelado mientras cocina lo prepara

Caso:

```text id="mms0if"
#128
EN PREPARACIÓN
```

El pedido puede ser cancelado desde otro módulo.

La cocina deberá recibir una actualización:

```text id="y7za3d"
⚠️ PEDIDO CANCELADO

#128
Mesa 07
```

El comportamiento físico del pedido deberá quedar definido posteriormente según el estado real de preparación.

---

# 25. Pedido modificado por el restaurante

El MVP debe evitar modificaciones complejas mientras cocina trabaja.

Si se necesita modificar un pedido:

```text id="8ok0u0"
PEDIDO ACTUALIZADO

#128
Mesa 07
```

La cocina deberá distinguir qué cambió.

Esta funcionalidad se especificará con mayor precisión durante las reglas de negocio.

---

# 26. Conexión perdida

Si la cocina pierde conexión:

```text id="kh5x5n"
⚠️ Sin conexión

Las actualizaciones pueden
estar temporalmente detenidas.
```

La interfaz no debe afirmar que una acción se guardó hasta tener confirmación.

---

# 27. Error al marcar listo

Si cocina pulsa:

```text id="2q7xbq"
MARCAR LISTO
```

y falla:

```text id="avibz1"
No pudimos actualizar
el pedido.

[ REINTENTAR ]
```

El pedido debe continuar visible como:

**EN PREPARACIÓN**

hasta que realmente se confirme el cambio.

---

# 28. Acción duplicada

Si se pulsa dos veces:

```text id="av7n7e"
MARCAR LISTO
```

el sistema debe procesar únicamente una acción.

El botón deberá quedar temporalmente bloqueado.

---

# 29. Pedido ya procesado

Si otra persona ya marcó el pedido como listo:

```text id="dx6wld"
Este pedido ya fue marcado
como listo.
```

La interfaz debe actualizarse.

---

# 30. Múltiples personas en cocina

El sistema debe permitir:

```text id="4e7hwf"
COCINA
   ├── Usuario A
   ├── Usuario B
   └── Usuario C
```

Todos pueden visualizar los pedidos permitidos.

Sin embargo, las acciones críticas deben gestionarse para evitar estados inconsistentes.

---

# 31. Historial

El historial de pedidos de cocina no debe ocupar la pantalla principal.

Puede existir una sección secundaria:

```text id="k8hsib"
HISTORIAL

#120
LISTO

#121
LISTO

#122
LISTO
```

La prioridad del MVP es trabajar sobre pedidos activos.

---

# 32. Estado vacío

Si no hay pedidos:

```text id="8y2qls"
NO HAY PEDIDOS

Todo está al día ✓
```

La interfaz debe transmitir tranquilidad y no error.

---

# 33. Estado de muchos pedidos

Cuando haya alta demanda:

```text id="cwvfr3"
NUEVOS (8)

#128
#129
#130
#131
#132
#133
#134
#135
```

La interfaz debe permitir desplazarse cómodamente.

Posteriormente podremos añadir:

- Filtros.
- Prioridades.
- Búsqueda.
- Agrupación.

---

# 34. Temporizador

Cada pedido puede mostrar:

```text id="0n2dz8"
Hace:
05:32
```

Esto permite detectar rápidamente pedidos demorados.

En fases posteriores se pueden establecer indicadores:

```text id="9zrb77"
Normal
Atención
Demorado
```

---

# 35. Sonido y notificaciones

Para el MVP puede existir una notificación visual.

Posteriormente podemos implementar:

- Sonido.
- Vibración en dispositivos compatibles.
- Notificaciones push.
- Alertas persistentes.

La prioridad será primero asegurar que la actualización visual sea confiable.

---

# 36. Diseño visual

La interfaz debe evitar elementos innecesarios.

Debe predominar:

- Pedidos grandes.
- Texto legible.
- Botones claros.
- Estados visibles.
- Alto contraste.
- Poco desplazamiento.
- Acciones grandes.

La cocina debe poder utilizar la interfaz rápidamente incluso durante períodos de mucha actividad.

---

# 37. Navegación

La navegación debe ser mínima:

```text id="yg4w1d"
COCINA
 │
 ├── Pedidos
 └── Historial
```

No necesitamos un menú administrativo.

---

# 38. Flujo de un pedido

```text id="vq9t1r"
MESERO ACEPTA
      ↓
PEDIDO APARECE EN COCINA
      ↓
COCINA VE DETALLE
      ↓
PREPARAR
      ↓
EN PREPARACIÓN
      ↓
MARCAR LISTO
      ↓
LISTO
      ↓
MESERO AVISADO
```

---

# 39. Regla central

La regla más importante de cocina será:

> **Cocina no toma decisiones comerciales sobre el pedido.**

La cocina produce.

El mesero gestiona la relación con el cliente.

El administrador gestiona el restaurante.

---

# 40. Matriz de responsabilidades

| Acción | Cliente | Mesero | Cocina | Admin |
|---|---:|---:|---:|---:|
| Ver carta | ✅ | — | — | ✅ |
| Crear pedido | ✅ | — | — | — |
| Aceptar pedido | — | ✅ | ❌ | Opcional |
| Rechazar pedido | — | ✅ | ❌ | Opcional |
| Ver pedido aceptado | — | ✅ | ✅ | ✅ |
| Preparar pedido | — | — | ✅ | — |
| Marcar listo | — | — | ✅ | — |
| Entregar pedido | — | ✅ | ❌ | — |
| Llamar mesero | ✅ | ✅ | — | — |
| Gestionar productos | — | — | ❌ | ✅ |
| Gestionar mesas | — | ✅ | ❌ | ✅ |

---

# 41. Estado del pedido frente a cocina

La cocina recibirá solamente:

```text id="db3qj9"
ACEPTADO
```

Después:

```text id="gip2ny"
EN PREPARACIÓN
```

Después:

```text id="x5r7lz"
LISTO
```

Nunca:

```text id="4pv2uj"
PENDIENTE
```

ni:

```text id="u1p0am"
RECHAZADO
```

---

# 42. Objetivo UX

La experiencia ideal para cocina será:

> “Veo qué preparar, preparo el pedido y marco cuando está listo.”

Nada más.

El sistema no debe convertirse en una herramienta administrativa para cocina.

---

# 43. Resultado de la fase

Con esta fase quedan definidos:

- Login.
- Panel de cocina.
- Pedidos nuevos.
- Pedidos en preparación.
- Pedidos listos.
- Detalle de pedido.
- Modificaciones.
- Notas.
- Temporizadores.
- Errores.
- Actualizaciones.
- Concurrencia.
- Estados vacíos.
- Alta demanda.

---

# 44. Estado del proyecto

```text id="7ekj6x"
✅ Idea
✅ Problema
✅ Propuesta de valor
✅ Público objetivo
✅ Roles
✅ Flujo operativo
✅ Mapa de pantallas
✅ UX Cliente
✅ Wireframes Cliente
✅ UX Mesero
✅ Wireframes Mesero
✅ UX Cocina
✅ Wireframes Cocina

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

# 45. Próxima fase

La siguiente fase será:

# WIREFRAMES UX — ADMINISTRADOR

Se definirá la interfaz que utilizará el dueño o administrador del restaurante para controlar:

```text id="3l2n7f"
DASHBOARD
   │
   ├── Productos
   ├── Categorías
   ├── Mesas
   ├── QR
   ├── Pedidos
   ├── Empleados
   ├── Configuración
   └── Personalización
```

Esta será la última gran experiencia del MVP.

Después de terminar administrador podremos cerrar todo el UX y pasar a:

```text id="o8t5mx"
CLIENTE ✅
MESERO ✅
COCINA ✅
ADMINISTRADOR ⏳
       ↓
REGLAS DE NEGOCIO
       ↓
MODELO DE DATOS
       ↓
ARQUITECTURA
       ↓
UI
       ↓
DESARROLLO
```