---
title: "Reglas de Negocio MVP"
type: "concept"
created: "2026-09-01"
updated: "2026-09-24"
sources: ["PROYECTO — FASES UX, REGLAS DE NEGOCIO, DATOS Y ARQUITECTURA DEL MVP.md"]
tags: ["reglas", "negocio", "restricciones", "validacion"]
---

# Reglas de Negocio del MVP

Reglas operativas que el sistema debe enforzar.

## Reglas sobre Pedidos

### 1. Pedido = PENDING → Ve solo Mesero
- Clientes verán su estado
- Mesero ve en "PEDIDOS NUEVOS"
- Cocina NO ve

### 2. Pedido pasa a Cocina solo si ACCEPTED
```
PENDING → MESERO ACEPTA → ACCEPTED → COCINA
```
Nunca: PENDING → COCINA directamente

### 3. Mesero decide: Acepta o Rechaza (una vez)
- Una vez procesado no puede procesarse nuevamente
- Si otro mesero intenta aceptar: error "Ya fue aceptado"

### 4. Cocina solo ve ACCEPTED o PREPARING
- No ve PENDING
- No ve REJECTED
- No puede aceptar ni rechazar

### 5. Entrega es responsabilidad de Mesero
```
READY → MESERO ENTREGA → DELIVERED
```
Cocina no gestiona entrega.

---

## Reglas sobre Solicitudes

### 6. Solicitudes ≠ Pedidos
Completamente independientes. Una solicitud:
- No genera pedido automático
- No va a cocina
- Solo va a mesero

### 7. Tipos de Solicitud (MVP)
```
WAITER  ← Llamar mesero
BILL    ← Solicitar cuenta
```

Futuro:
```
CUTLERY, DRINK, HELP, OTHER
```

### 8. Solicitud duplicada = Bloqueo
Si mesa 7 ya tiene solicitud PENDING:
- No permitir crear otra idéntica
- Mostrar: "Ya existe una solicitud pendiente"

---

## Reglas sobre Productos

### 9. Producto Agotado = No pedir
Estados:
```
ACTIVE      ← Se puede pedir
OUT_OF_STOCK  ← Agotado (temporal)
INACTIVE    ← Desactivado (permanente)
```

Si está OUT_OF_STOCK o INACTIVE:
- No aparece en carrito
- Botón [AGREGAR] deshabilitado
- Mensaje: "Actualmente no disponible"

### 10. Cambio de Precio en Realtime
Si precio cambió mientras cliente estaba en carrito:
```
Cliente ve: $7.50
Admin cambia a: $8.50
Cliente intenta pedir
→ Validación: "Precio actualizado: $8.50. ¿Continuar?"
```

### 11. Producto Eliminado en Carrito
Si un producto fue eliminado:
```
Cliente tiene en carrito: Ceviche
Admin lo elimina
Cliente intenta pedir
→ Error: "Ceviche ya no está disponible"
```

---

## Reglas sobre Restaurante

### 12. Multi-Tenant: Datos Separados
Restaurante A y B no comparten datos:
```
Restaurant A
  ├── Usuarios
  ├── Mesas (Mesa 1, 2, 3)
  ├── Productos
  └── Pedidos

Restaurant B
  ├── Usuarios
  ├── Mesas (Mesa 1, 2, 3)
  ├── Productos
  └── Pedidos
```

Aunque tengan números idénticos, son independientes.

### 13. QR = Restaurante + Mesa
Cada QR identifica:
```
Restaurante XYZ
+
Mesa 07
```

No es un QR genérico. Cada mesa tiene su QR único.

### 14. Restaurante Cerrado
Admin configura horarios. Si está cerrado:
- Cliente ve: "Estamos cerrados. Horario: 11:00 - 22:00"
- Puede ver carta pero:
  - Pedidos desactivados
  - Solicitudes desactivadas

---

## Reglas sobre Usuarios y Acceso

### 15. Cliente = Sin Autenticación
```
QR → Acceso inmediato
```
No necesita crear cuenta ni login.

### 16. Staff (Mesero, Cocina, Admin) = Autenticación
```
Email + Contraseña → Login
```

### 17. Roles y Permisos
```
OWNER    ← Full access (propietario)
ADMIN    ← Gestión del restaurante
WAITER   ← Gestión de mesas y pedidos
KITCHEN  ← Solo preparación
```

### 18. Usuario solo ve su Restaurante
Si Juan es mesero de Restaurante A:
- Solo ve datos de Restaurante A
- No puede ver Restaurante B
- Error si intenta acceder a otro restaurante

---

## Reglas sobre Prevención de Errores

### 19. Pedido Duplicado
Si cliente hace doble clic [ENVIAR]:
```
Primer clic: Se deshabilita botón
Segundo clic: No tiene efecto
Resultado: UN pedido, no dos
```

### 20. Doble Aceptación de Pedido
Si dos meseros aceptan simultáneamente:
```
Mesero A: ACEPTA (éxito, ACCEPTED)
Mesero B: ACEPTA (error: "Ya fue aceptado")
```

Implementar con optimistic locking o check en DB.

### 21. Mesero Rechaza = Motivo Registrado
Motivos predefinidos:
```
○ Producto agotado
○ Problema con pedido
○ Restaurante no puede procesarlo
○ Otro (comentario libre)
```

El rechazo debe quedarse en log de auditoría.

### 22. Conexión Perdida = Mensajes Claros
NO mostrar errores técnicos:
```
❌ "Error 500"
❌ "Connection refused"

✅ "No pudimos conectar con el servidor.
   Comprueba tu conexión e inténtalo nuevamente.
   [REINTENTAR]"
```

### 23. Sesión Expirada = Redirigir a Login
```
Usuario intenta acción
Sesión expirada
→ "Tu sesión ha expirado. [INICIAR SESIÓN]"
```

### 24. Sin Permisos = Bloquear
```
Usuario intenta acceder a sección restringida
→ "No tienes permiso para acceder a esta sección."
```

---

## Reglas sobre Acceso del Cliente (QR de mesa vs. link de carta)

Decisión del 2026-09-24. Hay **dos puertas** a la misma carta digital, y cada una permite cosas distintas.

### 24. QR de mesa = pedir a cocina, por 1 h 30 min
- El QR impreso en cada mesa apunta a `/scan/<token>` y abre una **sesión de mesa en ese celular**.
- Con sesión activa el cliente: pide a cocina (el pedido entra al panel del mesero), llama al mesero y pide la cuenta.
- La sesión del celular dura **1 h 30 min desde el escaneo** (absoluta, no por inactividad). Pasado ese tiempo se asume que el cliente se fue: la pantalla cambia sola a modo carta (solo WhatsApp) y ya no puede pedir a esa mesa.
- Volver a escanear el QR de la mesa renueva la sesión otros 90 min (si sigue sentado, basta con escanear de nuevo).
- **Solo el escaneo habilita pedir a cocina.** La mesa la decide el escaneo (cookie del celular), nunca el número en la URL: si alguien comparte `/r/<slug>/1`, quien lo abre ve la carta en modo WhatsApp. Si ya está sentado en otra mesa, se le lleva a la suya.
- El link del QR (`/scan/<token>`) **no se muestra ni se copia** en el panel: solo debe llegar al cliente impreso en la mesa. La raíz del sitio lleva a la carta (modo WhatsApp), no a ninguna mesa.
- Red de seguridad: todo pedido del cliente llega **pendiente** y el mesero lo acepta; un pedido a una mesa vacía se rechaza ahí.

### 25. Link de carta = ver la carta y pedir solo por WhatsApp
- Link público `/r/<slug>` (panel → Mesas → "Link de carta"), pensado para Instagram, Google Maps o para mandar a quien está fuera del local.
- Muestra la misma carta, pero **nunca** abre sesión de mesa: el pedido se arma y se envía por WhatsApp al número de Configuración. No llega a cocina ni a ninguna mesa.
- Aunque quien lo abra tenga una sesión de mesa viva, este link sigue siendo solo-WhatsApp.
- Sin número de WhatsApp en Configuración, el link muestra la carta pero no permite pedir (el panel lo avisa).

### 26. La cuenta de la mesa no se cierra sola a los 90 min
- Lo que vence a los 90 min es la sesión **del celular**, no la cuenta de la mesa en la base. Los pedidos hechos siguen en la cuenta de la mesa hasta que el mesero la libera ("Liberar mesa").
- La sesión de mesa en la base sigue expirando tras 4 h sin actividad (red de seguridad si nadie la libera).
- Motivo: cerrar la cuenta automáticamente borraría de la vista pedidos todavía sin cobrar.

---

## Reglas sobre Datos Históricos

### 25. Snapshot de Producto en Pedido
Cuando se crea un pedido:
```
order_item:
  product_name = "Hamburguesa Especial"  (snapshot)
  unit_price = 7.50  (snapshot)
  quantity = 2
```

Aunque después se edite el producto:
- El pedido histórico NO cambia
- Siempre muestra lo que cliente pidió al momento

---

## Reglas sobre Auditoría

### 26. Log de Acciones Críticas
Registrar:
```
Pedido aceptado
Pedido rechazado
Pedido marcado listo
Solicitud atendida
Producto creado/modificado
Precio cambiado
Usuario creado/modificado
```

Con: usuario, timestamp, restaurante, detalles.

---

## Resumen de Restricciones Clave

| Restricción | Enforcement |
|------------|------------|
| Un pedido solo puede aceptarse una vez | DB + Backend |
| Producto no disponible no puede pedirse | Frontend + Backend |
| Usuario solo accede su restaurante | DB (RLS) + Backend |
| Cliente sin auth accede solo por QR | Frontend + Backend |
| Solicitud duplicada bloqueada | Backend |
| Pedido duplicado por doble clic bloqueado | Frontend + Backend |
| Mesero y Cocina ven diferentes estados | Backend (query) |
| Datos históricos no se alteran | DB (snapshot) |

## Conexiones en el Wiki

- [[Flujos Operativos del MVP]] — Flujos que estas reglas enfuerzan
- [[Arquitectura Técnica MVP]] — Cómo estas reglas se implementan en DB y backend
- [[Roles del Sistema]] — Restricciones de permisos por rol
- [[MVP - Alcance y Especificaciones]] — Funcionalidad limitada por estas reglas
- [[Pantallas del Cliente - Detalles]] — Reglas aplicadas en pantallas de cliente (producto agotado, etc.)

**Fuente Original**: Ver [[Fuentes Originales]] → Documento 4

---

**Fuentes**: PROYECTO — FASES UX, REGLAS DE NEGOCIO, DATOS Y ARQUITECTURA DEL MVP.md
