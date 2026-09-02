---
title: "Arquitectura Técnica MVP"
type: "concept"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["raw/assets/FASE TÉCNICA — ARQUITECTURA, CÓDIGO Y BASE DE DATOS DEL MVP.md", "raw/assets/PROYECTO — FASES UX, REGLAS DE NEGOCIO, DATOS Y ARQUITECTURA DEL MVP.md"]
tags: ["arquitectura", "tecnica", "stack", "infraestructura", "mobile-first", "performance", "modular-monolith", "postgresql", "supabase", "nextjs"]
aliases: ["arquitectura-tecnica-mvp"]
---

# Arquitectura Técnica MVP

## Objetivo General

Definir la arquitectura técnica, estructura del código y modelo de datos que soportarán el MVP con énfasis en:
- Rapidez
- Simplicidad  
- Seguridad
- Escalabilidad razonable
- Mantenimiento
- Experiencia Mobile First
- Desarrollo rápido
- Capacidad de evolucionar posteriormente

---

## Restricciones Principales del Proyecto

Estas decisiones son **obligatorias** para todo el desarrollo.

### 1. Mobile First ✅
La experiencia del cliente se diseña y optimiza **primero para**:
- Smartphones
- Pantallas pequeñas
- Uso táctil
- Uso con una sola mano
- Conexiones móviles variables

La experiencia Desktop será **secundaria** para el cliente.

### 2. Performance ⚡
La carta digital debe ser **extremadamente rápida**.

**Objetivo crítico:**
```
ESCANEAR QR → ABRIR CARTA → VER PRODUCTOS
```
Con la **menor fricción posible**.

No debemos enviar al celular información innecesaria.

### 3. Consumo Reducido de Datos 📊
El cliente puede utilizar datos móviles, por ello:
- Imágenes optimizadas
- JavaScript limitado al necesario
- Carga progresiva cuando corresponda
- Consultas pequeñas
- Evitar descargar todo el catálogo innecesariamente

### 4. Interfaz Rápida 🎯
Las acciones importantes deben proporcionar respuesta inmediata.

```
Agregar producto → Producto agregado ✓
Enviar pedido → Enviando... → Pedido #128
```

No crear interfaces que se sientan congeladas.

---

## Stack Tecnológico Definitivo

### Frontend / Full-stack Web
- **Next.js** + TypeScript
  - SSR (Server-Side Rendering)
  - API Routes (Server Actions)
  - Optimizado para performance
  - Deploy fácil en Vercel

### UI/Componentes
- **Tailwind CSS** (utilidades)
- **shadcn/ui** (componentes pre-construidos)
- Desarrollo rápido y consistente

### Backend / Database Platform
- **Supabase** (Backend-as-a-Service)
  - PostgreSQL integrado
  - Autenticación integrada
  - Storage integrado
  - Realtime integrado

### Base de Datos
- **PostgreSQL** (modelo relacional)
  - Relaciones complejas
  - RLS (Row Level Security)
  - Constraints y triggers
  - Índices optimizados

### Autenticación
- **Supabase Auth**
  - Gestión segura de usuarios
  - OAuth/Social login (futuro)
  - 2FA (futuro)

### Almacenamiento
- **Supabase Storage**
  - Archivos e imágenes
  - CDN integrado
  - Control de acceso

### Realtime
- **Supabase Realtime** (WebSocket)
  - Solo donde aporte valor
  - Notificaciones de pedidos
  - Actualizaciones de estado
  - Solicitudes de atención

### Validación
- **Zod**
  - Schemas de datos
  - Validación servidor y cliente
  - Type inference automático

### Control de Versiones
- **Git + GitHub**
  - Versionamiento
  - CI/CD ready
  - Colaboración

### Hosting / Deployment
- **Vercel**
  - Deploy automático desde GitHub
  - Optimizado para Next.js
  - Performance monitoring
  - Edge functions (futuro)

---

## Arquitectura Conceptual

```
                         INTERNET
                            │
                            ▼
                         VERCEL
                            │
                    ┌───────┴────────┐
                    │                │
                    ▼                ▼
               CLIENTE           STAFF
               (Mobile)      (Mesero/Cocina)
                    │                │
                    └───────┬────────┘
                            ▼
                         NEXT.JS
                    (Frontend + API)
                            │
                            ▼
                         SUPABASE
                    ┌───────┼────────┐
                    │       │        │
                    ▼       ▼        ▼
               PostgreSQL  AUTH   STORAGE
                    │
                    ▼
                 REALTIME
              (WebSocket)
```

### Flujo de Datos

**Nuevo pedido:**
```
CLIENTE → Crea pedido → PostgreSQL → Realtime → MESERO
```

**Pedido aceptado:**
```
MESERO → Acepta → PostgreSQL → Realtime → COCINA
```

**Pedido listo:**
```
COCINA → Marca listo → PostgreSQL → Realtime → MESERO
```

**Nueva solicitud:**
```
CLIENTE → Solicita → PostgreSQL → Realtime → MESERO
```

---

## Modelo de Datos Conceptual

### Tabla: restaurants
Información básica del restaurante.

```
id              uuid (primary key)
name            string
slug            string (único, para URL)
logo            string (URL)
description     text
cover_image     string (URL)
phone           string
address         string
status          enum (active, inactive, suspended)
opening_hours   json
created_at      timestamp
updated_at      timestamp
```

---

### Tabla: users
Usuarios de la plataforma.

```
id              uuid (primary key)
name            string
email           string (único)
created_at      timestamp
```

Nota: Autenticación gestionada por Supabase Auth (contraseña, etc.)

---

### Tabla: restaurant_members
Relación entre usuarios y restaurantes (con roles).

```
id              uuid (primary key)
restaurant_id   uuid (foreign key)
user_id         uuid (foreign key)
role            enum (OWNER, ADMIN, WAITER, KITCHEN)
status          enum (active, inactive)
created_at      timestamp
```

---

### Tabla: tables
Mesas del restaurante.

```
id              uuid (primary key)
restaurant_id   uuid (foreign key)
name            string
number          integer
status          enum (available, occupied, maintenance)
qr_token        string (único, identifica la mesa)
created_at      timestamp
updated_at      timestamp
```

---

### Tabla: categories
Categorías de productos.

```
id              uuid (primary key)
restaurant_id   uuid (foreign key)
name            string
description     text
position        integer (orden visual)
active          boolean
created_at      timestamp
updated_at      timestamp
```

---

### Tabla: products
Productos/platos del menú.

```
id              uuid (primary key)
restaurant_id   uuid (foreign key)
category_id     uuid (foreign key)
name            string
description     text
price           decimal
image_url       string
available       boolean (si está agotado o no)
position        integer (orden dentro categoría)
created_at      timestamp
updated_at      timestamp
```

---

### Tabla: product_options
Variantes y extras de productos (Futuro, puede simplificarse en MVP).

```
id              uuid (primary key)
product_id      uuid (foreign key)
name            string (e.g., "Tamaño", "Extras")
type            enum (size, extra, topping, removal)
required        boolean
```

---

### Tabla: orders
Pedidos completos.

```
id              uuid (primary key)
restaurant_id   uuid (foreign key)
table_id        uuid (foreign key)
status          enum (PENDING, ACCEPTED, PREPARING, READY, DELIVERED, REJECTED, CANCELLED)
subtotal        decimal
total           decimal
notes           text
accepted_by     uuid (user_id del mesero que aceptó)
accepted_at     timestamp
ready_at        timestamp
delivered_at    timestamp
created_at      timestamp
updated_at      timestamp
```

---

### Tabla: order_items
Ítems dentro de un pedido.

```
id              uuid (primary key)
order_id        uuid (foreign key)
product_id      uuid (foreign key)
product_name    string (snapshot del nombre)
quantity        integer
unit_price      decimal (snapshot del precio)
subtotal        decimal
notes           text (especificaciones: sin cebolla, etc.)
```

**Importante**: Se guarda snapshot de nombre y precio para que pedidos históricos no cambien cuando se edita un producto.

---

### Tabla: waiter_calls
Solicitudes de atención (independientes de pedidos).

```
id              uuid (primary key)
restaurant_id   uuid (foreign key)
table_id        uuid (foreign key)
type            enum (WAITER, BILL, CUTLERY, DRINK, HELP, OTHER)
status          enum (PENDING, ACCEPTED, ATTENDED, REJECTED)
handled_by      uuid (user_id del mesero)
handled_at      timestamp
created_at      timestamp
```

---

### Tabla: audit_logs
Registro de acciones para auditoría.

```
id              uuid (primary key)
restaurant_id   uuid (foreign key)
user_id         uuid (foreign key)
action          string (e.g., "order_accepted", "product_created")
entity_type     string (e.g., "order", "product")
entity_id       uuid
metadata        json (datos adicionales de la acción)
created_at      timestamp
```

---

## Relaciones Principales

```
RESTAURANT (1)
   │
   ├──→ (N) USERS (through restaurant_members)
   ├──→ (N) TABLES
   ├──→ (N) CATEGORIES
   ├──→ (N) PRODUCTS
   ├──→ (N) ORDERS
   ├──→ (N) WAITER_CALLS
   └──→ (N) AUDIT_LOGS

CATEGORY (1)
   └──→ (N) PRODUCTS

TABLE (1)
   └──→ (N) ORDERS

ORDER (1)
   ├──→ (N) ORDER_ITEMS
   └──→ (1) USER (aceptado por mesero)

PRODUCT (1)
   ├──→ (N) ORDER_ITEMS
   └──→ (N) PRODUCT_OPTIONS
```

---

## Índices Críticos

Para performance:

```sql
-- Búsqueda rápida de pedidos por restaurante y estado
INDEX ON orders(restaurant_id, status)

-- Búsqueda de productos por categoría
INDEX ON products(category_id, restaurant_id)

-- Búsqueda de mesa
INDEX ON tables(qr_token)

-- Búsqueda de usuario en restaurante
INDEX ON restaurant_members(restaurant_id, user_id)
```

---

## Estados de Datos

### Estados del Pedido

```
PENDING    ← Cliente crea, mesero aún no lo ve
ACCEPTED   ← Mesero acepta, cocina lo ve
PREPARING  ← Cocina está preparando
READY      ← Cocina terminó
DELIVERED  ← Mesero entregó
REJECTED   ← Mesero rechazó
CANCELLED  ← Pedido cancelado
```

**Flujo principal:**
```
PENDING → ACCEPTED → PREPARING → READY → DELIVERED
```

**Flujo alternativo:**
```
PENDING → REJECTED
```

---

### Estados de Producto

```
ACTIVE        ← Disponible, se puede pedir
OUT_OF_STOCK  ← Agotado (temporal)
INACTIVE      ← Desactivado (permanente)
```

---

### Estados de Mesa

```
AVAILABLE   ← Sin clientes
OCCUPIED    ← Cliente presente
MAINTENANCE ← Mantenimiento
```

---

## Seguridad Multi-Tenant

Todas las entidades están vinculadas a un `restaurant_id`:

```
restaurant_id = A
   ├── Usuarios, mesas, productos, pedidos, solicitudes

restaurant_id = B
   ├── Usuarios, mesas, productos, pedidos, solicitudes
```

**Regla crítica**: Un usuario solo puede acceder a datos de su restaurante.

Esto se valida en:
- Row Level Security (RLS) de PostgreSQL
- Backend API (próxima capa de validación)

---

## Validaciones Críticas

Antes de permitir operaciones:

1. **Pedido válido**: ¿Todavía está en PENDING?
2. **Producto disponible**: ¿No está INACTIVE ni OUT_OF_STOCK?
3. **Mesa válida**: ¿Existe y pertenece al restaurante?
4. **Pedido no procesado**: ¿No fue ya aceptado/rechazado?
5. **Datos consistentes**: ¿El restaurante coincide?

---

## Manejo de Concurrencia

### Si dos meseros aceptan el mismo pedido
```
MESERO A: ACEPTA ✅ (primero actualiza a ACCEPTED)
MESERO B: ACEPTA ❌ (ya no está en PENDING, error)
```

Notificación: "Este pedido ya fue aceptado por otro mesero."

### Si cliente hace doble clic
```
ENVIAR: Botón se deshabilita
PROCESANDO: Spinner de carga
CONFIRMADO: Se guarda una sola vez
```

### Si la misma mesa hace solicitud duplicada
```
Mesa 7 → Solicita atención (PENDING)
Mesa 7 → Solicita atención nuevamente
Resultado: "Ya existe una solicitud pendiente para esta mesa"
```

---

## Realtime (WebSocket)

Supabase Realtime permite:

```
Suscribirse a cambios en tablas

EJEMPLO:

Cliente A se suscribe a: orders WHERE restaurant_id = 1
Cuando se crea un nuevo order en restaurant_id = 1:
→ Se notifica a Cliente A instantáneamente
```

**Casos de uso en MVP:**

1. **Cliente**: Ve actualización de estado de su pedido
2. **Mesero**: Ve nuevo pedido apenas llega
3. **Cocina**: Ve pedido aceptado apenas mesero lo acepta
4. **Mesero**: Ve "pedido listo" cuando cocina lo marca

---

## Orden de Desarrollo (Sprints)

### Sprint 1 — Infraestructura
- Crear proyecto Next.js
- Configurar GitHub
- Supabase (DB + Auth)
- Estructura de roles

### Sprint 2 — Panel Admin
- Gestión de productos
- Gestión de categorías
- Gestión de mesas
- Generador de QR
- Configuración del restaurante

### Sprint 3 — Cliente (Parte 1)
- Validación de QR
- Pantalla de Carta
- Navegación por Categorías
- Detalle de Producto
- Carrito

### Sprint 4 — Cliente (Parte 2)
- Confirmación de pedido
- Envío de pedido
- Estado en tiempo real

### Sprint 5 — Mesero
- Dashboard
- Pedidos (aceptar/rechazar)
- Solicitudes de atención
- Vista de mesas

### Sprint 6 — Cocina
- Panel de cocina (minimalista)
- Ver pedidos aceptados
- Marcar como listo

### Sprint 7 — Integración y Testing
- Realtime entre roles
- Testing completo
- Casos de error
- Optimizaciones

---

## Arquitectura: Modular Monolith

**No utilizaremos microservicios para el MVP.**

La aplicación estará **centralizada pero separada internamente por dominios**:

```
NEXT.JS
├── Auth           - Autenticación y autorización
├── Restaurants    - Gestión de restaurantes
├── Menu           - Productos y categorías
├── Tables         - Mesas y QR
├── Orders         - Lógica de pedidos (crítica)
├── Waiter         - Operaciones de mesero
├── Kitchen        - Preparación de pedidos
└── Staff          - Miembros y roles
```

Permite **desarrollo rápido sin sacrificar organización**.

---

## Principio de Separación: UI → Lógica → Datos

### ❌ Incorrecto
```tsx
<Button onClick={async () => {
  // Lógica directa en componente
  const result = await supabase.from('orders').insert(...)
}} />
```

### ✅ Correcto
```
UI (React Component)
      ↓
Action / Use Case (Server Action)
      ↓
Validaciones (Zod)
      ↓
Business Logic (Dominio)
      ↓
Database (PostgreSQL)
```

---

## Operaciones Críticas del Dominio

Todas las **acciones críticas son explícitas** para evitar modificaciones arbitrarias:

```
createOrder()           - Cliente crea pedido
acceptOrder()           - Mesero acepta
rejectOrder()           - Mesero rechaza
startPreparing()        - Cocina comienza
markOrderReady()        - Cocina termina
markOrderDelivered()    - Mesero entrega

createWaiterCall()      - Cliente solicita
handleWaiterCall()      - Mesero atiende

requestBill()           - Cliente solicita cuenta
```

---

## Estados de Pedido y Transiciones Válidas

### Estados Válidos
```
PENDING     - Cliente creó, mesero aún no lo ve
ACCEPTED    - Mesero aceptó, cocina lo ve
PREPARING   - Cocina está preparando
READY       - Cocina terminó
DELIVERED   - Mesero entregó
REJECTED    - Mesero rechazó
CANCELLED   - Cancelado
```

### Flujo Principal
```
PENDING → ACCEPTED → PREPARING → READY → DELIVERED
```

### Flujo Alternativo
```
PENDING → REJECTED
```

### Transiciones Válidas (solo estas)
```
PENDING   ├─→ ACCEPTED   ✅
          ├─→ REJECTED   ✅
          └─→ CANCELLED  ✅

ACCEPTED  ├─→ PREPARING  ✅
          └─→ CANCELLED  ✅

PREPARING ├─→ READY      ✅
          └─→ CANCELLED  ✅

READY     └─→ DELIVERED  ✅
```

### ❌ Transiciones Inválidas
```
PENDING → READY              ❌
REJECTED → PREPARING         ❌
DELIVERED → ACCEPTED         ❌
```

---

## Responsabilidad por Estado

### Mesero Puede Procesar
```
PENDING → ACCEPTED
PENDING → REJECTED
READY → DELIVERED
```

### Cocina Puede Procesar
```
ACCEPTED → PREPARING
PREPARING → READY
```

---

## Realtime: Solo Donde Aporte Valor

### Eventos Realtime (WebSocket)
```
Nuevo pedido      → Mesero notificado
Pedido aceptado   → Cocina notificada
Pedido listo      → Mesero notificado
Nueva solicitud   → Mesero notificado
Solicitud cuenta  → Mesero notificada
```

### ❌ NO Necesita Realtime
- Editar nombre/descripción restaurante
- Cambiar configuraciones
- Subir logo
- Crear categorías

---

## Estructura del Código

```
src/
├── app/                       # Next.js App Router
│   ├── (auth)/               # Rutas públicas
│   ├── (dashboard)/          # Rutas privadas
│   └── api/                  # API Routes
│
├── modules/                  # Dominios de negocio
│   ├── auth/
│   │   ├── actions/
│   │   ├── types/
│   │   └── utils/
│   ├── restaurants/
│   ├── menu/
│   ├── tables/
│   ├── orders/               # Crítico
│   ├── waiter-calls/
│   ├── staff/
│   └── kitchen/
│
├── components/               # React Components
│   ├── ui/                  # shadcn/ui
│   └── shared/              # Reutilizables
│
├── lib/                     # Utilidades
│   ├── supabase/            # Cliente Supabase
│   ├── auth/                # Autenticación
│   └── validation/          # Zod schemas
│
├── types/                   # TypeScript types
├── config/                  # Configuración
└── env.ts                   # Environment variables
```

### Ejemplo: Módulo Orders

```
modules/orders/
├── actions/
│   ├── create-order.ts
│   ├── accept-order.ts
│   ├── reject-order.ts
│   ├── start-preparing.ts
│   ├── mark-ready.ts
│   └── mark-delivered.ts
├── queries/
│   ├── get-order.ts
│   └── get-orders.ts
├── validations/
│   └── order.schema.ts
├── types/
│   └── order.types.ts
└── utils/
```

---

## Decisiones Técnicas Clave

| Aspecto | Decisión | Por qué |
|---------|----------|--------|
| **Arquitectura** | Modular Monolith | Desarrollo rápido sin perder organización |
| **Frontend** | Next.js | SSR, TypeScript, deploy fácil en Vercel |
| **Backend** | Supabase | PostgreSQL + Auth + Storage + Realtime en uno |
| **UI** | Tailwind + shadcn | Desarrollo rápido, consistente, personalizable |
| **DB** | PostgreSQL | Relacional, RLS, constraints, triggers |
| **Realtime** | Supabase Realtime | WebSocket nativo, sin servidor extra |
| **Validación** | Zod | Schemas tipados, client + server |
| **Deploy** | Vercel | Optimizado para Next.js, CI/CD automático |
| **Auth** | Supabase Auth | Integrado, RBAC listo |
| **Storage** | Supabase Storage | Integrado, CDN, control de acceso |

---

---

## Principios Técnicos Oficiales

### ⚡ Performance First
La carta debe ser **extremadamente rápida**.
- QR → Abrir → Ver productos (mínima fricción)
- Imágenes optimizadas
- JavaScript limitado
- Carga progresiva

### 📱 Mobile First
El cliente usa **principalmente teléfono**.
- Pantalla pequeña, uso táctil, una sola mano
- Conexiones variables
- Desktop secundario

### 🔒 Security by Default
Las reglas críticas validadas en **servidor y base de datos**.
- No confiar en frontend
- RLS en PostgreSQL
- Validación Zod server-side
- Roles y permisos explícitos

### 🛠️ Simple Architecture
**No construir infraestructura que aún no necesitamos.**
- Monolith, no microservicios
- PostgreSQL, no Redis obligatorio
- Realtime solo donde aporte valor

### 🧩 Modular Code
Los **dominios deben mantenerse separados**.
- Módulos independientes
- Responsabilidad clara
- Reutilización sin acoplamiento

### 📌 Explicit Business Rules
Las transiciones importantes ejecutadas mediante **acciones específicas**.
- acceptOrder(), rejectOrder(), etc.
- Evita modificaciones arbitrarias
- Auditable

### 🔄 Realtime Where Needed
Tiempo real **solo donde aporte valor**.
- Pedidos: sí
- Configuración: no
- Reduce complejidad

### 🗄️ Data Integrity
La **base de datos protege la consistencia**.
- Foreign keys
- Constraints
- Triggers
- RLS

### 🚀 Evolvable
El sistema **permite agregar funciones posteriormente**.
- De 1 restaurante → 1000+
- Sin reconstruir completamente
- Escalable pero no sobre-engineered

---

## Tecnologías NO Usadas en MVP

Evaluadas **cuando exista necesidad real**:

```
❌ Microservicios
❌ Kubernetes
❌ Kafka
❌ Redis obligatorio
❌ App móvil nativa
❌ Backend independiente
❌ POS integrado
❌ Pagos
❌ Facturación electrónica
❌ Inventario avanzado
```

---

## Criterio de Aceptación Técnico

El MVP debe cumplir **TODOS estos criterios**:

```
✅ RÁPIDO EN CELULAR
   + 
✅ FÁCIL DE USAR
   +
✅ SEGURO
   +
✅ CONSISTENTE
   +
✅ MANTENIBLE
   +
✅ PREPARADO PARA CRECER
```

No consideraremos "listo" simplemente porque "funcione".

---

## Próxima Fase Oficial: DATABASE DESIGN V1/V2 ✅

**Ya disponible**: [[Modelo de Datos Definitivo]] — Implementación SQL segura con todas las tablas, índices, RLS y validaciones.

Antes de escribir la aplicación, convertir el modelo conceptual en estructura real:

```
ER DIAGRAM
    ↓
TABLAS DEFINITIVAS
    ↓
COLUMNAS + TIPOS
    ↓
PRIMARY KEYS
    ↓
FOREIGN KEYS
    ↓
UNIQUE CONSTRAINTS
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

Después: Design System → Codebase Setup → Next.js → Primer Código

---

## Conexiones en el Wiki

- [[Reglas de Negocio MVP]] — Validaciones y restricciones implementadas en arquitectura
- [[Proyecto QR - Visión General]] — Contexto general que esta arquitectura implementa
- [[MVP - Alcance y Especificaciones]] — Funcionalidad que esta arquitectura soporta
- [[Mapa de Pantallas - General]] — Interfaces que esta arquitectura renderiza
- [[Flujos Operativos del MVP]] — Flujos de datos que esta arquitectura maneja con Realtime
- [[Roles del Sistema]] — Actores y permisos que la arquitectura contempla

**Fuentes Originales**: [[Fuentes Originales]]
