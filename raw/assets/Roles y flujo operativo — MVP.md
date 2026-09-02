# Roles y flujo operativo — MVP

## 1. Roles principales

El sistema tendrá inicialmente cuatro roles operativos:

| Rol | Función principal |
|---|---|
| **Cliente** | Consultar la carta, realizar pedidos y solicitar atención |
| **Mesero** | Atender solicitudes, aceptar/rechazar pedidos y gestionar la atención |
| **Cocina** | Visualizar pedidos aceptados y marcar pedidos como listos |
| **Administrador** | Gestionar restaurante, carta, mesas, usuarios y configuración |

Además existirá un **Superadministrador** correspondiente al propietario de la plataforma, encargado de gestionar los restaurantes desde el sistema.

---

# 2. Principio operativo

La responsabilidad estará dividida de la siguiente manera:

```text
CLIENTE
   │
   ├── Consulta carta
   ├── Realiza pedido
   └── Solicita mesero
          │
          ▼
       MESERO
          │
          ├── Atiende llamada
          ├── Acepta pedido
          ├── Rechaza pedido
          └── Registra atención
                 │
                 ▼
              COCINA
                 │
                 └── Marca pedido como LISTO
```

La cocina **no aceptará ni rechazará pedidos**.

La cocina solamente trabajará con pedidos que ya hayan sido aceptados por un mesero.

---

# 3. Cliente

El cliente no necesita crear una cuenta para utilizar el sistema.

Accede mediante el QR ubicado en la mesa.

### Acciones principales

- Ver carta.
- Buscar productos.
- Consultar categorías.
- Ver información y fotografías de productos.
- Seleccionar productos.
- Configurar opciones o extras.
- Crear carrito.
- Enviar pedido.
- Consultar estado del pedido.
- Llamar al mesero.
- Solicitar la cuenta.

---

# 4. Flujo de pedido realizado por el cliente

## Flujo principal

```text
Cliente escanea QR
        ↓
Sistema identifica restaurante y mesa
        ↓
Cliente consulta carta
        ↓
Cliente selecciona productos
        ↓
Cliente revisa carrito
        ↓
Cliente confirma pedido
        ↓
Pedido llega al MESERO
        ↓
Mesero revisa pedido
        ↓
       ┌───────────────┐
       │               │
       ▼               ▼
   ACEPTAR          RECHAZAR
       │               │
       ▼               ▼
   Pedido pasa       Pedido
   a cocina          rechazado
       │
       ▼
    COCINA
       │
       ▼
  Prepara pedido
       │
       ▼
  Marca LISTO
       │
       ▼
    MESERO
       │
       ▼
Entrega al cliente
```

---

# 5. Estados del pedido

Para mantener el flujo sencillo, el pedido tendrá estados claros.

### PENDIENTE

El cliente acaba de enviar el pedido.

Todavía no ha sido procesado por un mesero.

```text
Cliente
   ↓
Pedido enviado
   ↓
PENDIENTE
```

---

### ACEPTADO

El mesero revisó el pedido y decidió aceptarlo.

En este momento el pedido puede pasar a cocina.

```text
PENDIENTE
    ↓
MESERO ACEPTA
    ↓
ACEPTADO
```

---

### RECHAZADO

El mesero determina que el pedido no puede ser procesado.

Por ejemplo:

- Producto no disponible.
- Problema con la solicitud.
- Error en el pedido.
- Restaurante no puede procesarlo en ese momento.

```text
PENDIENTE
    ↓
MESERO RECHAZA
    ↓
RECHAZADO
```

Idealmente, cuando se rechace un pedido se deberá registrar una razón.

Ejemplo:

> Pedido rechazado: producto no disponible.

---

### EN PREPARACIÓN

Una vez aceptado por el mesero, cocina comienza a trabajar.

```text
ACEPTADO
    ↓
COCINA LO VISUALIZA
    ↓
EN PREPARACIÓN
```

Este estado puede registrarse automáticamente al pasar el pedido a cocina o posteriormente mediante una acción de cocina.

---

### LISTO

Cocina terminó de preparar el pedido.

```text
EN PREPARACIÓN
      ↓
COCINA MARCA LISTO
      ↓
LISTO
```

El mesero recibe el aviso:

> Pedido #125 — Mesa 7 — LISTO.

---

### ENTREGADO

El mesero lleva el pedido al cliente.

```text
LISTO
  ↓
MESERO ENTREGA
  ↓
ENTREGADO
```

---

### CANCELADO

Estado reservado para situaciones donde el pedido deba cancelarse.

Por ejemplo:

- Cancelación autorizada.
- Problema operativo.
- Cliente solicita cancelación cuando todavía es posible.

Este estado deberá tener reglas específicas según el momento en que se encuentre el pedido.

---

# 6. Responsabilidad del mesero

El mesero será la figura central de operación durante el MVP.

El mesero deberá visualizar:

### Pedidos pendientes

```text
NUEVOS PEDIDOS

#125
Mesa 7
----------------
2 Hamburguesas
1 Coca-Cola
1 Papas

[ ACEPTAR ]
[ RECHAZAR ]
```

Cuando el mesero acepta:

```text
Pedido #125
Mesa 7

Estado:
ACEPTADO
```

Y el pedido pasa a cocina.

---

# 7. El mesero también recibe llamadas

El cliente puede decidir no realizar un pedido digital.

Puede presionar:

> 🛎️ Llamar al mesero

El sistema registra:

```text
SOLICITUD DE ATENCIÓN

Mesa 7
Cliente solicita atención

[ ATENDER ]
[ RECHAZAR ]
```

En este caso **no existe cocina** involucrada.

El mesero simplemente atiende la solicitud.

---

# 8. El mesero puede aceptar o rechazar solicitudes

No todas las interacciones deben ser obligatoriamente aceptadas.

Ejemplo:

```text
Mesa 4
Solicita atención

[ ACEPTAR ]
[ RECHAZAR ]
```

Si acepta:

```text
Mesa 4
ATENCIÓN EN PROCESO
```

Después:

```text
ATENDIDO
```

Si rechaza:

```text
Solicitud rechazada
```

El sistema debería permitir registrar opcionalmente el motivo.

---

# 9. Diferencia entre PEDIDO y LLAMADA

Es importante mantenerlos separados.

## Pedido

El cliente quiere consumir determinados productos.

```text
Cliente
   ↓
Pedido
   ↓
Mesero
   ↓
Aceptar / Rechazar
   ↓
Cocina
```

## Llamada al mesero

El cliente solamente solicita atención.

```text
Cliente
   ↓
Solicitud
   ↓
Mesero
   ↓
Aceptar / Rechazar
   ↓
Atender
```

Una llamada al mesero **no genera un pedido automáticamente**.

---

# 10. Cocina

La cocina tendrá una interfaz muy sencilla.

## Cocina NO:

- No administra productos.
- No administra mesas.
- No acepta pedidos.
- No rechaza pedidos.
- No gestiona clientes.
- No gestiona usuarios.
- No modifica precios.

## Cocina SÍ:

- Visualiza pedidos aceptados.
- Consulta los productos del pedido.
- Consulta observaciones.
- Ve la mesa.
- Marca el pedido como listo.

---

# 11. Flujo de cocina

```text
MESERO ACEPTA PEDIDO
          ↓
       COCINA
          ↓
   Pedido aparece
          ↓
   EN PREPARACIÓN
          ↓
 Cocina prepara
          ↓
   MARCAR LISTO
          ↓
        LISTO
```

La interfaz de cocina debe estar enfocada únicamente en producción.

Ejemplo:

```text
┌─────────────────────────┐
│ PEDIDO #125             │
│ MESA 7                  │
│                         │
│ 2 × Hamburguesa         │
│ 1 × Papas               │
│ 1 × Coca-Cola           │
│                         │
│ Nota: una sin cebolla   │
│                         │
│ [ MARCAR LISTO ]        │
└─────────────────────────┘
```

---

# 12. ¿Cómo llega un pedido a cocina?

La regla es:

> **Cocina solamente recibe pedidos aceptados por un mesero.**

Nunca deberá ocurrir:

```text
CLIENTE → COCINA
```

El flujo correcto será:

```text
CLIENTE
   ↓
PEDIDO
   ↓
MESERO
   ↓
ACEPTA
   ↓
COCINA
```

Esto permite que exista una validación humana antes de enviar el pedido a preparación.

---

# 13. ¿Qué pasa si el mesero rechaza?

Ejemplo:

Cliente pide:

> Ceviche

Pero el restaurante se quedó sin ceviche.

El mesero visualiza:

```text
PEDIDO #130

Mesa 4

1 Ceviche
1 Cola

[ ACEPTAR ]
[ RECHAZAR ]
```

Selecciona:

**RECHAZAR**

Puede elegir:

```text
Motivo:

○ Producto agotado
○ No disponible
○ Error en pedido
○ Otro
```

El cliente recibe:

> No pudimos aceptar tu pedido. Producto no disponible.

El pedido **nunca llegará a cocina**.

---

# 14. ¿Qué pasa si el mesero acepta?

Ejemplo:

```text
PEDIDO #131

Mesa 6

1 Hamburguesa
1 Papas
2 Bebidas
```

Mesero:

**ACEPTAR**

Entonces:

```text
PEDIDO #131
Estado: ACEPTADO
```

Y cocina recibe:

```text
NUEVO PEDIDO

#131
Mesa 6

1 Hamburguesa
1 Papas
2 Bebidas
```

---

# 15. ¿Qué pasa si cocina todavía no lo ha preparado?

El pedido permanecerá visible en cocina.

Ejemplo:

```text
PEDIDOS EN PREPARACIÓN

#131 — Mesa 6
Hace 03:24

#132 — Mesa 3
Hace 01:10
```

Cuando termina:

**MARCAR LISTO**

---

# 16. ¿Qué ocurre cuando cocina marca LISTO?

El sistema actualiza:

```text
PEDIDO #131

LISTO
```

El mesero recibe la actualización:

> 🔔 Pedido #131 de Mesa 6 está listo.

El mesero recoge el pedido y lo lleva al cliente.

Posteriormente:

**MARCAR ENTREGADO**

---

# 17. Flujo completo de atención

El sistema tendrá tres flujos operativos principales.

## FLUJO A — Pedido digital

```text
CLIENTE
   ↓
Selecciona productos
   ↓
Envía pedido
   ↓
MESERO
   ↓
Aceptar / Rechazar
   ↓
COCINA
   ↓
Preparar
   ↓
Marcar listo
   ↓
MESERO
   ↓
Entregar
   ↓
CLIENTE
```

---

## FLUJO B — Llamar al mesero

```text
CLIENTE
   ↓
Llamar mesero
   ↓
MESERO
   ↓
Aceptar / Rechazar
   ↓
Atención
   ↓
Atendido
```

---

## FLUJO C — Solicitar cuenta

```text
CLIENTE
   ↓
Solicitar cuenta
   ↓
MESERO
   ↓
Aceptar
   ↓
Lleva cuenta
   ↓
Cliente paga
   ↓
Mesa puede cerrarse
```

La integración de pagos puede quedar fuera del MVP.

---

# 18. Reglas fundamentales del MVP

### Regla 1

El cliente puede consultar la carta sin iniciar sesión.

### Regla 2

El cliente puede realizar un pedido desde la mesa.

### Regla 3

Todo pedido digital llega primero al mesero.

### Regla 4

El mesero decide si acepta o rechaza.

### Regla 5

Solamente los pedidos aceptados llegan a cocina.

### Regla 6

Cocina no acepta ni rechaza pedidos.

### Regla 7

Cocina solamente prepara y marca como listo.

### Regla 8

El mesero entrega el pedido al cliente.

### Regla 9

Las llamadas al mesero son independientes de los pedidos.

### Regla 10

Las solicitudes y pedidos deben estar asociados a una mesa.

---

# 19. Ejemplo de funcionamiento real

Supongamos:

**Mesa 8**

Cliente escanea QR.

↓

Selecciona:

2 Hamburguesas

1 Papas

2 Jugos

↓

Envía:

**Pedido #250**

↓

Mesero recibe:

```text
NUEVO PEDIDO
Mesa 8

2 Hamburguesas
1 Papas
2 Jugos

[ACEPTAR]
[RECHAZAR]
```

↓

Mesero acepta.

↓

Cocina recibe:

```text
PEDIDO #250
MESA 8

2 Hamburguesas
1 Papas
2 Jugos

[MARCAR LISTO]
```

↓

Cocina termina.

↓

Marca:

**LISTO**

↓

Mesero recibe:

> Pedido #250 listo.

↓

Entrega.

↓

Marca:

**ENTREGADO**

↓

Pedido finalizado.

---

# 20. Objetivo de esta arquitectura operativa

La división busca evitar confusión.

```text
CLIENTE
Interacción
     ↓
MESERO
Control y validación
     ↓
COCINA
Preparación
     ↓
MESERO
Entrega
     ↓
CLIENTE
```

Cada rol tiene una responsabilidad clara.

Esto permite que el MVP sea:

- Simple.
- Fácil de aprender.
- Fácil de desarrollar.
- Fácil de probar.
- Fácil de vender.
- Fácil de ampliar posteriormente.

---

# 21. Evolución futura

Una vez validado el MVP podremos agregar:

- Asignación de meseros.
- Prioridades.
- Tiempo estimado.
- Notificaciones push.
- Sonido en cocina.
- Impresoras de cocina.
- División de cuenta.
- Pago online.
- Propinas.
- POS.
- Facturación.
- Inventario.
- Estadísticas.
- Reservaciones.
- Fidelización.

Pero estas funciones **no son necesarias para la primera versión**.

La primera versión debe concentrarse en este ciclo:

```text
ESCANEAR
   ↓
VER CARTA
   ↓
PEDIR / LLAMAR MESERO
   ↓
MESERO GESTIONA
   ↓
COCINA PREPARA
   ↓
LISTO
   ↓
MESERO ENTREGA
```