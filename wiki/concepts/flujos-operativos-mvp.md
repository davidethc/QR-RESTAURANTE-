---
title: "Flujos Operativos del MVP"
type: "concept"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["Roles y flujo operativo — MVP.md"]
tags: ["mvp", "flujos", "operacion", "roles"]
---

# Flujos Operativos del MVP

El MVP implementa tres flujos operativos principales que coexisten en paralelo.

## Flujo A — Pedido Digital Completo

Cliente quiere consumir productos específicos.

```
CLIENTE
   ↓
Escanea QR (sin login)
   ↓
Consulta carta
   ↓
Selecciona productos
   ↓
Configura opciones
   ↓
Crea carrito
   ↓
Envía pedido
   ↓
PEDIDO #XXX PENDIENTE
   ↓
MESERO
   ↓
Recibe notificación
   ↓
Revisa pedido
   ↓
ACEPTAR o RECHAZAR
   ↓
Si ACEPTAR:
   ↓
PEDIDO → ACEPTADO
   ↓
COCINA
   ↓
Recibe pedido
   ↓
Prepara
   ↓
Marca LISTO
   ↓
MESERO
   ↓
Recibe notificación
   ↓
Recoge pedido
   ↓
Entrega a cliente
   ↓
Marca ENTREGADO
   ↓
CLIENTE
(Pedido finalizado)
```

## Flujo B — Llamada al Mesero

Cliente solo quiere atención, no hacer pedido digital.

```
CLIENTE
   ↓
Escanea QR
   ↓
Toca: 🛎️ Llamar al mesero
   ↓
SOLICITUD #XXX PENDIENTE
   ↓
MESERO
   ↓
Recibe notificación
   ↓
ACEPTAR o RECHAZAR
   ↓
Si ACEPTAR:
   ↓
Va a la mesa
   ↓
Marca ATENDIDO
   ↓
CLIENTE recibe confirmación
```

**Importante**: Una llamada al mesero es independiente de un pedido. No genera pedido automáticamente.

## Flujo C — Solicitud de Cuenta

Cliente quiere pedir la cuenta.

```
CLIENTE
   ↓
Toca: 💳 Solicitar cuenta
   ↓
SOLICITUD #XXX PENDIENTE
   ↓
MESERO
   ↓
Recibe notificación
   ↓
Acepta
   ↓
Va a la mesa
   ↓
Lleva cuenta
   ↓
Cliente paga
   ↓
Mesa se cierra
```

Nota: Integración de pagos puede quedar fuera del MVP.

## Estados del Pedido (Flujo A)

### PENDIENTE
- Cliente acaba de enviar
- Mesero aún no lo revisa
- Duración: hasta que mesero responda

### ACEPTADO
- Mesero revisó y aceptó
- Puede pasar a cocina
- Transición: PENDIENTE → ACEPTADO (después de acción de mesero)

### RECHAZADO
- Mesero decidió rechazar
- Ejemplo: producto agotado, problema con solicitud
- El cliente recibe: "No pudimos aceptar tu pedido. [Motivo]"
- Nunca llega a cocina

### EN PREPARACIÓN
- Cocina recibió pedido aceptado
- Está preparando
- Transición: ACEPTADO → EN PREPARACIÓN (cuando cocina lo visualiza)

### LISTO
- Cocina terminó de preparar
- Mesero recibe: "🔔 Pedido #XXX de Mesa Y está listo"
- Transición: EN PREPARACIÓN → LISTO (acción de cocina)

### ENTREGADO
- Mesero entregó al cliente
- Pedido finalizado
- Transición: LISTO → ENTREGADO (acción de mesero)

### CANCELADO
- Reservado para cancelaciones autorizadas
- Raramente usado en MVP
- Posible solo en estados tempranos

## Regla Crítica: Mesero es el Filtro

```
CLIENTE → PEDIDO → MESERO (ACEPTA/RECHAZA) → COCINA
```

**Nunca**:
```
CLIENTE → COCINA
```

La responsabilidad es clara:
- **Cliente**: Decide qué quiere
- **Mesero**: Valida que sea posible
- **Cocina**: Prepara lo aceptado
- **Mesero**: Entrega

## Diferencia entre Pedido y Solicitud

### Pedido
- Cliente selecciona productos específicos
- Flujo: Cliente → Mesero → Cocina → Mesero → Cliente
- Genera preparación

### Solicitud (Llamada/Cuenta)
- Cliente solicita atención
- Flujo: Cliente → Mesero → Atención
- No genera preparación
- No va a cocina

Mantener separados es fundamental para la simplicidad.

## Panel de Mesero — Lo Que Ve

### Sección 1: Pedidos Pendientes
```
NUEVOS PEDIDOS

#125 — Mesa 7
─────────────────
2 Hamburguesas
1 Coca-Cola
1 Papas

[ ACEPTAR ]  [ RECHAZAR ]
```

### Sección 2: Solicitudes Pendientes
```
SOLICITUDES

Mesa 4
Solicita atención

[ ACEPTAR ]  [ RECHAZAR ]
```

### Sección 3: Pedidos Listos
```
PEDIDOS LISTOS

#125 — Mesa 7
#126 — Mesa 3

[ MARCAR ENTREGADO ]
```

## Panel de Cocina — Lo Que Ve

Interfaz **extremadamente sencilla**. Enfocada solo en producción.

```
┌──────────────────────┐
│ PEDIDO #125          │
│ MESA 7               │
│                      │
│ 2 × Hamburguesa      │
│ 1 × Papas            │
│ 1 × Coca-Cola        │
│                      │
│ Nota: Una sin cebolla│
│                      │
│ [ MARCAR LISTO ]     │
└──────────────────────┘
```

Cocina **NO**:
- Acepta/Rechaza pedidos
- Administra productos
- Gestiona mesas
- Atiende clientes

Cocina **SÍ**:
- Ve pedidos aceptados
- Consulta productos y observaciones
- Ve la mesa
- Marca como listo

## Responsabilidades Claras

```
CLIENTE → Interacción
   ↓
MESERO → Control y validación
   ↓
COCINA → Preparación
   ↓
MESERO → Entrega
   ↓
CLIENTE → Satisfacción
```

Cada rol tiene una responsabilidad única y clara.

## Reglas Fundamentales (10 reglas)

1. Cliente consulta carta sin iniciar sesión
2. Cliente puede realizar pedido desde mesa
3. Todo pedido digital llega primero al mesero
4. Mesero decide si acepta o rechaza
5. Solo pedidos aceptados llegan a cocina
6. Cocina no acepta ni rechaza
7. Cocina solo prepara y marca listo
8. Mesero entrega pedido al cliente
9. Llamadas al mesero son independientes de pedidos
10. Solicitudes y pedidos asociados a mesa

## Evolución Futura (No en MVP)

- Asignación de meseros
- Prioridades de pedidos
- Tiempo estimado
- Notificaciones push
- Sonido en cocina
- Impresoras de cocina
- División de cuenta
- Pago online
- Propinas
- POS
- Facturación
- Inventario
- Estadísticas
- Reservaciones
- Fidelización

Pero estas no son necesarias para validar el producto.

## Conexiones en el Wiki

- [[Roles del Sistema]] — Describe detalladamente cada rol (Cliente, Mesero, Cocina, Admin)
- [[Pantallas del Cliente - Detalles]] — Cómo se implementan estos flujos en pantallas
- [[Reglas de Negocio MVP]] — Reglas que enfuerzan estos flujos
- [[Mapa de Pantallas - General]] — Vista general de todas las pantallas por flujo
- [[Proyecto QR - Visión General]] — Contexto general del proyecto

**Fuente Original**: Ver [[Fuentes Originales]] → Documento 2

---

**Fuentes**: Roles y flujo operativo — MVP.md
