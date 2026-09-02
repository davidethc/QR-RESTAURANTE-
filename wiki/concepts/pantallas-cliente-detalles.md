---
title: "Pantallas del Cliente - Detalles"
type: "concept"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["MAPA DE PANTALLAS — MVP.md"]
tags: ["pantallas", "cliente", "ux", "mobile-first"]
---

# Pantallas del Cliente — Detalles

Especificación detallada de las 11 pantallas de la experiencia del cliente. Mobile-first.

## 1. Entrada por QR (Validación)

**Objetivo**: Identificar restaurante, mesa y estado del restaurante.

### Caso Exitoso
```
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

Transición a: **Pantalla de Carta**

### QR Inválido
```
QR no válido

Este código no corresponde
a una mesa activa.

[ Volver ]
```

### Mesa Desactivada
```
Mesa no disponible.

Consulta con el personal
del restaurante.
```

### Restaurante Cerrado
```
Restaurante cerrado.

Horario:
11:00 – 22:00
```

---

## 2. Carta Principal (Inicio)

**Objetivo**: Pantalla principal. Probablemente la más importante visualmente.

### Layout
```
┌───────────────────────┐
│ ← [LOGO]              │
│                       │
│ La Casa del Sabor     │
│ Comida tradicional    │
│ con sabor casero      │
│                       │
│ [ 🔎 Buscar ]         │
│                       │
│ [Entradas] [Platos]   │
│ [Bebidas] [Postres]   │
│                       │
│ DESTACADOS            │
│                       │
│ ┌─────────────────┐   │
│ │   FOTO          │   │
│ │ Hamburguesa     │   │
│ │ $7.50      [+]  │   │
│ └─────────────────┘   │
│                       │
│ 🛎️ Llamar mesero      │
│ 💳 Solicitar cuenta   │
│                       │
│ 🛒 Carrito (2)        │
└───────────────────────┘
```

### Elementos visibles
- Logo
- Nombre del restaurante
- Descripción
- Buscador
- Categorías (tabs/botones)
- Productos destacados
- Botón flotante: Carrito
- Botón: Llamar mesero
- Botón: Solicitar cuenta

### Interacciones
- Click en categoría → Pantalla de Categoría
- Click en producto → Pantalla de Detalle
- Click en [+] en producto → Agregar directamente al carrito
- Click en Carrito → Pantalla de Carrito
- Click en 🛎️ → Pantalla Llamar mesero
- Click en 💳 → Pantalla Solicitar cuenta

---

## 3. Pantalla de Categoría

**Objetivo**: Listar productos de una categoría específica.

### Layout
```
ENTRADAS

← Volver

┌──────────────────────┐
│ FOTO                 │
│ Patacones            │
│ Con queso y salsa    │
│ $4.00            [+] │
└──────────────────────┘

┌──────────────────────┐
│ FOTO                 │
│ Ceviche              │
│ Ceviche de camarón   │
│ $6.00            [+] │
└──────────────────────┘
```

### Información por producto (card)
- Foto
- Nombre
- Descripción breve
- Precio
- Botón [+] para agregar rápido

### Interacciones
- Click en card → Pantalla de Detalle
- Click en [+] → Agregar al carrito (con confirmación de cantidad)
- ← Volver → Pantalla de Carta

---

## 4. Detalle de Producto

**Objetivo**: Mostrar todos los detalles y permitir configuración.

### Layout
```
┌───────────────────────┐
│ ←                     │
│                       │
│     FOTO PRODUCTO     │
│                       │
│ Hamburguesa Especial  │
│ $7.50                 │
│                       │
│ Carne artesanal,      │
│ queso, lechuga y      │
│ salsa de casa.        │
│                       │
│ Tamaño                │
│ ○ Normal              │
│ ○ Grande +$2          │
│                       │
│ Extras                │
│ □ Queso +$1           │
│ □ Tocino +$1.50       │
│                       │
│ Sin ingredientes      │
│ □ Cebolla             │
│                       │
│ Observaciones         │
│ [_________________]   │
│                       │
│ Cantidad              │
│ [-] 1 [+]             │
│                       │
│ [ AGREGAR AL PEDIDO ] │
└───────────────────────┘
```

### Campos
- Foto (grande)
- Nombre
- Precio base
- Descripción completa
- Tamaño (si aplica)
- Extras (checkboxes con precio)
- Ingredientes a remover (checkboxes)
- Observaciones (texto libre)
- Cantidad (+-1)
- Precio total actualizado

### Producto Agotado
```
Hamburguesa Especial

Actualmente no disponible.

[ AGREGAR AL PEDIDO ] (DESHABILITADO)
```

### Interacciones
- Cambiar cantidad → Actualizar precio
- Seleccionar extras → Actualizar precio
- Escribir observación → Guardar
- Click [AGREGAR] → Confirmación y carrito

---

## 5. Carrito

**Objetivo**: Revisar los productos seleccionados antes de enviar.

### Layout
```
MI PEDIDO

Mesa 07

2 × Hamburguesa Especial
$15.00

1 × Coca-Cola
$2.00

────────────────

Subtotal
$17.00

[ + Agregar más productos ]

[ CONTINUAR ]
```

### Información
- Título "MI PEDIDO"
- Número de mesa (importante)
- Lista de productos con cantidad y subtotal
- Subtotal general
- Opción para agregar más

### Interacciones
- Click en producto → Editar (volver a detalle)
- Click en producto → Opción de eliminar
- [+] Agregar más → Volver a Carta
- [CONTINUAR] → Pantalla de Confirmación

---

## 6. Confirmación de Pedido

**Objetivo**: Última oportunidad para revisar antes de enviar.

### Layout
```
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

### Elementos
- Resumen compacto
- Total destacado
- Advertencia
- Botón de confirmación destacado

### Interacciones
- [VOLVER] → Editar en carrito
- [ENVIAR PEDIDO] → Procesar y pantalla "Pedido Enviado"

---

## 7. Pedido Enviado

**Objetivo**: Confirmación de que el pedido fue recibido.

### Layout
```
✓ PEDIDO ENVIADO

Pedido #128

Mesa 07

El restaurante recibió
tu pedido.

[ VER ESTADO ]
[ VOLVER A LA CARTA ]
```

### Elementos
- Confirmación visual (✓)
- Número de pedido (crítico)
- Mesa
- Mensaje de confirmación
- Opción para ver estado
- Opción para volver a pedir

### Interacciones
- [VER ESTADO] → Pantalla de Estado del Pedido
- [VOLVER A CARTA] → Pantalla de Carta (carrito reseteado)

---

## 8. Estado del Pedido

**Objetivo**: Seguimiento en tiempo real del pedido.

### Layout
```
PEDIDO #128

Mesa 07

✓ Pedido recibido
✓ Pedido aceptado
● Preparando
○ Listo
○ Entregado
```

### Estados visuales
- ✓ Completado
- ● En progreso
- ○ Pendiente

### Estados del pedido
1. Pedido recibido (mesero recibió)
2. Pedido aceptado (mesero aceptó)
3. Preparando (cocina está haciendo)
4. Listo (listo para ser entregado)
5. Entregado (cliente recibió)

### Interacciones
- Actualización automática en tiempo real (WebSocket)
- El cliente puede ver este estado en cualquier momento
- No requiere botones de acción

### Futuro (Post-MVP)
- Tiempo estimado: "Aprox. 15 min"
- Notificaciones push

---

## 9. Llamar al Mesero

**Objetivo**: Solicitar atención sin hacer pedido.

### Flujo

**Paso 1**: Click en botón 🛎️
```
¿Necesitas ayuda?

🛎️ Solicitar atención

Mesa 07

[ CONFIRMAR ]
[ CANCELAR ]
```

**Paso 2**: Después de confirmar
```
✓ SOLICITUD ENVIADA

Un mesero ha sido avisado.

Mesa 07

[ VOLVER ]
```

**Paso 3**: Cuando es atendido
```
✓ ATENCIÓN CONFIRMADA

El mesero atenderá tu mesa.
```

### Interacciones
- [CONFIRMAR] → Enviar solicitud
- [CANCELAR] → Cerrar modal
- [VOLVER] → Volver a Carta

### Nota
El cliente no necesita esperar confirmación. El mesero la atiende desde su panel.

---

## 10. Solicitar Cuenta

**Objetivo**: Pedir la cuenta sin llamar mesero.

### Flujo

**Paso 1**: Click en botón 💳
```
💳 SOLICITAR CUENTA

Mesa 07

¿Deseas solicitar la cuenta?

[ SOLICITAR ]
[ CANCELAR ]
```

**Paso 2**: Después de confirmar
```
✓ SOLICITUD ENVIADA

El mesero llevará tu cuenta.
```

### Interacciones
- [SOLICITAR] → Enviar solicitud
- [CANCELAR] → Cerrar modal

### Nota
No incluye pago digital en MVP. Solo es una solicitud de atención.

---

## 11. Estados de Error

**Objetivo**: Manejar situaciones fallidas sin confundir al cliente.

### Error de Conexión
```
No pudimos conectar con el servidor.

Comprueba tu conexión
e inténtalo nuevamente.

[ REINTENTAR ]
```

### Página Inexistente
```
Página no encontrada.

[ VOLVER ]
```

### Sesión Expirada
```
Tu sesión ha expirado.

[ INICIAR SESIÓN ]
```

### Producto Eliminado Mientras Estaba en Carrito
```
Algunos productos ya no están disponibles.

⚠️ Revisa tu carrito.

El producto "Ceviche" fue eliminado.

[ ACTUALIZAR CARRITO ]
```

### Precio Cambió Mientras Estaba en Carrito
```
Los precios han sido actualizados.

Nuevo total: $18.50

¿Deseas continuar?

[ VOLVER ]
[ CONTINUAR ]
```

---

## Principios de Diseño de Cliente

1. **Mobile-First**: Diseño para teléfono pequeño primero
2. **Sin Login**: Acceso inmediato
3. **Visual**: Muchas fotos, pocas palabras
4. **Rápido**: Máximo 3-4 clics para hacer pedido
5. **Claro**: Mensajes simples, sin jerga
6. **Intuitivo**: No requiere explicación
7. **Confiable**: Acciones claras, sin error
8. **Responsive**: Funciona en cualquier dispositivo

## Conexiones en el Wiki

- [[Mapa de Pantallas - General]] — Vista general de todas las pantallas del sistema
- [[Flujos Operativos del MVP]] — El flujo A (Pedido Digital) que estas pantallas implementan
- [[Roles del Sistema]] — El rol Cliente que usa estas pantallas
- [[MVP - Alcance y Especificaciones]] — Estas pantallas definen la experiencia del MVP cliente
- [[Fase UX — Wireframes (Síntesis)]] — Wireframes detallados de estas pantallas
- [[Reglas de Negocio MVP]] — Reglas aplicadas en estas pantallas (producto agotado, precio, etc.)

**Fuente Original**: Ver [[Fuentes Originales]] → Documentos 3 y 5

---

**Fuentes**: MAPA DE PANTALLAS — MVP.md
