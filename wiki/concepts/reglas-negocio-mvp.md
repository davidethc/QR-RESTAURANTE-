---
title: "Reglas de Negocio MVP"
type: "concept"
created: "2026-09-01"
updated: "2026-09-01"
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
