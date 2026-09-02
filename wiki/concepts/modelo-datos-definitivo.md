---
title: "Modelo de Datos Definitivo"
type: "concept"
created: "2026-09-02"
updated: "2026-09-02"
sources: ["raw/assets/DATABASE DESIGN V2 — SCHEMA SQL SEGURO DEL MVP (1).md"]
tags: ["database", "sql", "postgresql", "schema", "rls", "security", "multi-tenant", "mvp"]
aliases: ["modelo-datos-definitivo", "database-design-v2"]
---

# Modelo de Datos Definitivo

## Objetivo

Implementar la base de datos del sistema QR para restaurantes considerando:
- Multi-tenancy (aislamiento por restaurante)
- Clientes anónimos (sesiones de mesa sin autenticación)
- Pedidos con transiciones seguras
- Meseros, cocina, administradores
- Solicitudes de atención
- Row Level Security (RLS) en PostgreSQL
- Validaciones server-side
- Historial de precios
- Auditoría de acciones críticas
- Realtime
- Integridad de datos

**Prioridad**: SEGURA + RÁPIDA + SIMPLE + ESCALABLE

---

## Principio de Seguridad: No Acceso Directo desde Cliente

### ❌ Incorrecto
```
CLIENTE → INSERT orders (directo)
```

### ✅ Correcto
```
CLIENTE
  ↓
RPC segura (stored procedure)
  ↓
Validaciones (server-side)
  ↓
PostgreSQL
  ↓
ORDER creada
```

Se aplica para:
- Crear pedidos
- Crear solicitudes de atención
- Solicitar cuenta
- Cualquier operación crítica

---

## Arquitectura de Acceso: 3 Niveles

```
                  SUPABASE
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼
    ANON           AUTH         SERVICE
       │             │             │
       ▼             ▼             ▼
   CLIENTE       STAFF       OPERACIONES
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                PostgreSQL
                     │
                     ▼
                    RLS
```

**ANON**: Cliente (sin autenticación), acceso limitado  
**AUTH**: Staff (mesero, cocina, admin), acceso por rol  
**SERVICE**: Operaciones backend, acceso total

---

## ENUMs (Estados y Tipos)

### Estados Restaurante
```sql
ACTIVE, INACTIVE, SUSPENDED
```

### Roles de Miembro
```sql
OWNER, ADMIN, WAITER, KITCHEN
```

### Estados de Mesa
```sql
AVAILABLE, OCCUPIED, ATTENTION, BILL_REQUESTED, INACTIVE
```

### Estados de Sesión Mesa
```sql
ACTIVE, CLOSED, EXPIRED
```

### Estados de Pedido
```sql
PENDING, ACCEPTED, PREPARING, READY, DELIVERED, REJECTED, CANCELLED
```

### Tipos de Solicitud
```sql
WAITER, BILL
```

### Estados de Solicitud
```sql
PENDING, ACCEPTED, ATTENDED, REJECTED, CANCELLED
```

### Acciones de Auditoría
```sql
CREATE, UPDATE, DELETE, LOGIN, LOGOUT
ACCEPT_ORDER, REJECT_ORDER, START_PREPARING, MARK_ORDER_READY, MARK_ORDER_DELIVERED
CREATE_WAITER_CALL, HANDLE_WAITER_CALL
```

---

## Tablas Principales

### 1. PROFILES
Relaciona usuario Supabase Auth con información propia.

```sql
id (uuid, FK→auth.users)
full_name (text)
avatar_url (text)
created_at, updated_at (timestamptz)
```

### 2. RESTAURANTS
Información del restaurante.

```sql
id (uuid, PK)
name (text) — requerido
slug (text) — único, para URLs
description, logo_url, cover_image_url
phone, address
status (enum: ACTIVE/INACTIVE/SUSPENDED)
timezone (default: America/Guayaquil)
opening_hours (jsonb)
created_at, updated_at
```

### 3. RESTAURANT_MEMBERS
Relaciona usuarios con restaurantes y asigna roles.

```sql
id (uuid, PK)
restaurant_id (uuid, FK→restaurants)
user_id (uuid, FK→profiles)
role (enum: OWNER/ADMIN/WAITER/KITCHEN)
status (enum: ACTIVE/INACTIVE)
created_at, updated_at
UNIQUE (restaurant_id, user_id)
```

### 4. TABLES
Mesas del restaurante.

```sql
id (uuid, PK)
restaurant_id (uuid, FK→restaurants)
number (integer) — debe ser > 0
name (text)
status (enum: AVAILABLE/OCCUPIED/ATTENTION/BILL_REQUESTED/INACTIVE)
qr_token (uuid) — único, identifica la mesa
created_at, updated_at
UNIQUE (restaurant_id, number) — una mesa #1 por restaurante
```

### 5. TABLE_SESSIONS
Sesiones anónimas de cliente (resuelve cliente sin autenticación).

```sql
id (uuid, PK)
restaurant_id (uuid, FK→restaurants)
table_id (uuid, FK→tables)
session_token (uuid) — único, identifica la sesión
status (enum: ACTIVE/CLOSED/EXPIRED)
started_at (timestamptz)
last_activity_at (timestamptz)
closed_at (timestamptz, nullable)
```

**Propósito**: 
```
QR → MESA → SESIÓN → PEDIDOS
```

Permite rastrear acciones del cliente sin que se autentique.

### 6. CATEGORIES
Categorías de productos.

```sql
id (uuid, PK)
restaurant_id (uuid, FK→restaurants)
name (text)
description (text)
position (integer) — orden visual
active (boolean)
created_at, updated_at
```

### 7. PRODUCTS
Productos/platos del menú.

```sql
id (uuid, PK)
restaurant_id (uuid, FK→restaurants)
category_id (uuid, FK→categories)
name (text)
description (text)
price (decimal)
image_url (text)
available (boolean) — si está agotado
active (boolean) — si está en la carta
position (integer)
created_at, updated_at
```

### 8. ORDERS
Pedidos completos.

```sql
id (uuid, PK)
restaurant_id (uuid, FK→restaurants)
table_id (uuid, FK→tables)
table_session_id (uuid, FK→table_sessions)
status (enum: PENDING/ACCEPTED/PREPARING/READY/DELIVERED/REJECTED/CANCELLED)
subtotal (decimal)
total (decimal)
notes (text)
accepted_by (uuid, FK→profiles) — mesero que aceptó
accepted_at (timestamptz)
preparing_at (timestamptz)
ready_at (timestamptz)
delivered_at (timestamptz)
created_at, updated_at
```

### 9. ORDER_ITEMS
Ítems dentro de un pedido (snapshot de producto en el momento).

```sql
id (uuid, PK)
order_id (uuid, FK→orders)
product_id (uuid, FK→products)
product_name (text) — snapshot nombre
quantity (integer)
unit_price (decimal) — snapshot precio
subtotal (decimal)
notes (text) — especificaciones (sin cebolla, etc.)
created_at (timestamptz)
```

**Importante**: Se guarda snapshot del nombre y precio para que pedidos históricos no cambien.

### 10. WAITER_CALLS
Solicitudes de atención (independientes de pedidos).

```sql
id (uuid, PK)
restaurant_id (uuid, FK→restaurants)
table_id (uuid, FK→tables)
type (enum: WAITER/BILL)
status (enum: PENDING/ACCEPTED/ATTENDED/REJECTED/CANCELLED)
handled_by (uuid, FK→profiles) — mesero que atendió
created_at (timestamptz)
handled_at (timestamptz)
```

### 11. AUDIT_LOGS
Registro de acciones para auditoría.

```sql
id (uuid, PK)
restaurant_id (uuid, FK→restaurants)
user_id (uuid, FK→profiles, nullable) — puede ser NULL si es cliente anónimo
action (enum: CREATE/UPDATE/DELETE/LOGIN/LOGOUT/ACCEPT_ORDER/etc.)
entity_type (text) — "order", "product", "waiter_call"
entity_id (uuid)
metadata (jsonb) — datos adicionales de la acción
created_at (timestamptz)
```

---

## Índices Críticos para Performance

```sql
-- Búsqueda rápida de pedidos
CREATE INDEX idx_orders_restaurant_status
  ON public.orders (restaurant_id, status);

-- Búsqueda de productos por categoría
CREATE INDEX idx_products_category_restaurant
  ON public.products (category_id, restaurant_id);

-- Búsqueda de mesa por QR token
CREATE INDEX idx_tables_qr_token
  ON public.tables (qr_token);

-- Búsqueda de usuario en restaurante
CREATE INDEX idx_members_restaurant_user
  ON public.restaurant_members (restaurant_id, user_id);

-- Búsqueda de sesiones activas
CREATE INDEX idx_table_sessions_status
  ON public.table_sessions (status);

-- Búsqueda de solicitudes
CREATE INDEX idx_waiter_calls_status
  ON public.waiter_calls (restaurant_id, status);
```

---

## Row Level Security (RLS)

**Principio**: La base de datos también valida permisos, no solo el frontend.

### Ejemplo RLS para ORDERS

```sql
-- Cliente anónimo ve solo sus pedidos (a través de session)
SELECT * FROM orders 
WHERE restaurant_id = current_restaurant_id 
  AND table_session_id = current_session_id;

-- Mesero ve pedidos de su restaurante
SELECT * FROM orders 
WHERE restaurant_id = current_restaurant_id;

-- Admin ve todo
-- (role OWNER/ADMIN sin restricción)
```

---

## Validaciones Server-Side

Nunca confiar en frontend para operaciones críticas:

1. **Crear pedido**: Verificar mesa válida, restaurante válido, productos disponibles
2. **Aceptar pedido**: Verificar que está PENDING, que no fue ya aceptado
3. **Rechazar pedido**: Verificar que sigue en PENDING
4. **Marcar listo**: Verificar que está en PREPARING
5. **Entregar**: Verificar que está READY
6. **Crear solicitud**: Verificar que no existe otra PENDING para esa mesa

---

## Transiciones Seguras de Pedidos

Solo transiciones válidas permitidas:

```
PENDING   → ACCEPTED (mesero)
PENDING   → REJECTED (mesero)
PENDING   → CANCELLED (cliente o mesero)

ACCEPTED  → PREPARING (cocina)
ACCEPTED  → CANCELLED (mesero)

PREPARING → READY (cocina)
PREPARING → CANCELLED (mesero)

READY     → DELIVERED (mesero)
```

**Todas las demás transiciones son rechazadas por la DB** (CHECK constraints + RLS).

---

## Manejo de Sesiones Anónimas

```
Cliente escanea QR
       ↓
Identifica: RESTAURANT + TABLE
       ↓
Crea: TABLE_SESSION (con session_token)
       ↓
Cliente se identifica por: session_token
       ↓
Puede crear pedidos, solicitar mesero, etc.
       ↓
Sesión expira después de X horas (CLOSED/EXPIRED)
```

No necesita login/registro.

---

## Auditoría Detallada

Todas las acciones críticas quedan registradas:

```sql
INSERT INTO audit_logs 
  (restaurant_id, user_id, action, entity_type, entity_id, metadata, created_at)
VALUES
  (?, ?, 'ACCEPT_ORDER', 'order', order_id, {...}, now());
```

Permite:
- Investigar operaciones sospechosas
- Cumplimiento regulatorio
- Análisis de comportamiento

---

## Próximas Fases

1. **Migrations SQL** — Archivos versionados de DB
2. **RLS Policies** — Definiciones completas de RLS
3. **Stored Procedures** — RPCs seguras para operaciones críticas
4. **Índices Adicionales** — Optimización según usage patterns reales
5. **Auditoría Extendida** — Triggers para rastreo automático

---

## Véase También

- [[Arquitectura Técnica MVP]] — Stack tecnológico que soporta este diseño
- [[Reglas de Negocio MVP]] — Validaciones implementadas en esta DB
- [[Flujos Operativos del MVP]] — Cómo se usan estas tablas
- [[Roles del Sistema]] — Mapeo de roles a niveles de acceso

**Fuentes Originales**: [[Fuentes Originales]] → DATABASE DESIGN V2