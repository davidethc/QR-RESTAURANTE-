---
title: "Activity Log"
type: "log"
created: "2026-09-01"
updated: "2026-09-01"
---

# Activity Log

Registro cronológico de todas las operaciones en el wiki. Se actualiza en cada acción.

## [2026-09-01] init | Inicialización del Wiki

- **Action**: Configuración inicial de estructura LLM Wiki
- **Structure created**:
  - `raw/` — directorio para fuentes originales
  - `wiki/` — directorio para contenido generado
  - `CLAUDE.md` — definición del schema y workflows
  - `wiki/index.md` — catálogo de páginas
  - `wiki/log.md` — este archivo
- **Status**: ✅ Wiki lista para ingesta de fuentes
- **Time**: < 5 min

---

## [2026-09-01] ingesta | Proyecto QR de Restaurantes

- **Summary**: Ingesta completa del proyecto de Sistema Digital de Atención en Mesa para restaurantes usando QR. Documento de 70+ secciones + especificaciones operativas.

- **Pages created**:
  - [[Proyecto QR - Visión General]] (synthesis)
  - [[Flujos Operativos del MVP]] (concept)
  - [[Roles del Sistema]] (entity)
  - [[MVP - Alcance y Especificaciones]] (concept)

- **Pages updated**: 
  - [[wiki/index.md]] — Añadidas 4 páginas nuevas, estadísticas actualizadas

- **Key concepts extracted**:
  1. Visión: Sistema Digital de Atención en Mesa (QR es puerta de entrada)
  2. Problema: Procesos manuales, cartas desactualizadas, errores en pedidos
  3. Solución: Conexión digital Cliente ↔ Restaurante ↔ Mesero ↔ Cocina
  4. Roles: 5 roles con responsabilidades claras
  5. Flujos: 3 flujos operativos principales (Pedido, Llamada, Cuenta)
  6. MVP: Alcance bien definido (qué sí, qué no)

- **Contradictions/Gaps**: Ninguno detectado. Documentos internamente consistentes.

- **Connections discovered**:
  - Flujos operativos dependen de Roles del Sistema
  - MVP alcance está determinado por Flujos Operativos
  - Proyecto vision abarca todas las fases futuras

- **Time**: 45 min

---

## [2026-09-01] ingesta | Mapa de Pantallas — MVP

- **Summary**: Ingesta de documento "Mapa de Pantallas — MVP" con especificación de 38 pantallas organizadas por rol (Cliente 11, Mesero 10, Cocina 5, Admin 12).

- **Pages created**:
  - [[Mapa de Pantallas - General]] (concept) — Arquitectura general, navegaciones, principios de diseño
  - [[Pantallas del Cliente - Detalles]] (concept) — Detalle de las 11 pantallas de cliente con mockups

- **Pages updated**: 
  - [[wiki/index.md]] — Añadidas 2 páginas nuevas, estadísticas actualizadas

- **Key concepts extracted**:
  1. Arquitectura: 4 experiencias independientes (Cliente, Mesero, Cocina, Admin)
  2. Mobile-first: Cliente no necesita login, acceso inmediato por QR
  3. 38 pantallas totales bien definidas
  4. Flujos de navegación claros para cada rol
  5. Estados de error y carga contemplados
  6. Casos especiales: producto agotado, QR inválido, restaurante cerrado

- **Pantallas por rol**:
  - Cliente: 11 (entrada QR, carta, categoría, producto, carrito, confirmación, enviado, estado, llamar mesero, cuenta, errores)
  - Mesero: 10 (login, dashboard, pedidos, aceptar/rechazar, solicitudes, mesas)
  - Cocina: 5 (login, panel, pedido, preparando, listo)
  - Admin: 12 (login, dashboard, pedidos, mesas, productos, categorías, QR, empleados, config)

- **Contradictions/Gaps**: Ninguno. Arquitectura consistente con [[Flujos Operativos del MVP]]

- **Connections discovered**:
  - Pantallas de cliente soportan [[Flujos Operativos del MVP]] Flujo A, B, C
  - Estados de pantalla alinean con estados de pedido definidos en [[Flujos Operativos del MVP]]

- **Time**: 30 min

---

## [2026-09-01] ingesta | Arquitectura, Reglas de Negocio y Wireframes

- **Summary**: Ingesta de 4 documentos finales: arquitectura técnica, reglas de negocio, y 3 documentos de wireframes (Cliente, Mesero, Cocina).

- **Pages created**:
  - [[Arquitectura Técnica MVP]] (concept) — Stack (Next.js, Supabase, PostgreSQL), modelo de datos, sprints
  - [[Reglas de Negocio MVP]] (concept) — 26 reglas de validación y restricciones
  - [[Fase UX — Wireframes (Síntesis)]] (synthesis) — Resumen de wireframes por rol

- **Pages updated**: 
  - [[wiki/index.md]] — 3 páginas nuevas, estadísticas completas

- **Key info extracted**:
  1. **Stack**: Next.js + Tailwind + shadcn + Supabase (PostgreSQL + Auth + Realtime) + Vercel
  2. **Modelo de datos**: 10 tablas (restaurants, users, tables, products, orders, etc.) con relaciones claras
  3. **Reglas críticas**: Pedido solo a cocina si ACCEPTED, producto agotado no se puede pedir, multi-tenant con row-level security
  4. **Wireframes**: 38 pantallas totales, mobile-first para cliente, minimalista para cocina
  5. **Sprints**: 7 sprints de desarrollo (Infraestructura → Admin → Cliente → Pedidos → Mesero → Cocina → Integración)

- **Archivos ingestionados**: 
  - PROYECTO — FASES UX, REGLAS DE NEGOCIO, DATOS Y ARQUITECTURA DEL MVP.md
  - FASE UX — WIREFRAMES DEL CLIENTE MOBILE.md
  - FASE UX — WIREFRAMES DEL MESERO.md
  - FASE UX — WIREFRAMES DE COCINA.md

- **Time**: 35 min

---

## [2026-09-01] update | Crear red de cross-references (Relaciones entre páginas)

- **Summary**: Añadidas secciones "Conexiones en el Wiki" a todas las 10 páginas (excepto index y log) para crear una red de referencias cruzadas.

- **Pages updated**:
  - [[Proyecto QR - Visión General]] → linkea a 6 páginas
  - [[Flujos Operativos del MVP]] → linkea a 4 páginas
  - [[Roles del Sistema]] → linkea a 6 páginas
  - [[MVP - Alcance y Especificaciones]] → linkea a 6 páginas
  - [[Mapa de Pantallas - General]] → linkea a 6 páginas
  - [[Pantallas del Cliente - Detalles]] → linkea a 6 páginas
  - [[Arquitectura Técnica MVP]] → linkea a 5 páginas
  - [[Reglas de Negocio MVP]] → linkea a 5 páginas
  - [[Análisis: Problema vs Solución]] → linkea a 3 páginas
  - [[Fase UX — Wireframes (Síntesis)]] → linkea a 5 páginas

- **Resultado**: Red completa de interconexiones. En Obsidian:
  - Graph View mostrará todas las relaciones
  - Backlinks permitirá navegar fácilmente
  - Búsqueda de "[[" revelará todas las conexiones

- **Time**: 15 min

---

## [2026-09-01] update | Conectar raw/ al wiki (Fuentes Originales)

- **Summary**: Creada página [[Fuentes Originales]] que cataloga los 7 documentos en raw/assets con descripción, contenido y links a páginas wiki relacionadas. Todas las páginas wiki ahora linkean a sus fuentes originales.

- **Pages created**:
  - [[Fuentes Originales]] (reference) — Catálogo de 7 documentos raw con descripción completa y relaciones

- **Pages updated** (10 páginas):
  - Todas las páginas wiki ahora tienen sección "Fuente Original" que linkea a [[Fuentes Originales]]
  - Index.md: Añadida sección "References" con link a Fuentes Originales

- **Resultado**: Conexión bidireccional completa:
  - Wiki → linkea a Fuentes Originales
  - Fuentes Originales → linkea a páginas wiki relacionadas
  - raw/ (7 archivos) ↔ wiki (11 páginas) = red integrada

- **Navegación**:
  - Desde cualquier página wiki: "Fuente Original" → acceso directo a documento raw
  - Desde Fuentes Originales: links a páginas wiki relacionadas
  - Index.md: referencia central a todas las fuentes

- **Time**: 20 min

---

## [2026-09-01] create | Índice de Búsqueda para acceso a raw/

- **Summary**: Creado [[Índice de Búsqueda]] (search-index.md) que mapea ~100+ términos del proyecto a su ubicación exacta en raw/assets. Cuando la IA no sepa algo, puede buscar en este índice y acceder directamente a la fuente.

- **Pages created**:
  - [[Índice de Búsqueda]] (reference) — Guía alfabética de términos → documento + sección

- **Contenido**:
  - A-Z: Administrador, Arquitectura, Base de Datos, Carrito, Categorías, Cliente, Cocina, Concurrencia, etc.
  - Cada término linkea a: DOCUMENTO.md | Sección X
  - Ejemplo: "Estados de Pedido" → ROLES_FLUJO.md | Sección 5

- **Cómo usar**:
  - Si IA no sabe algo → buscar término en search-index.md
  - Encontrar referencia → Documento | Sección
  - Abrir raw/assets/Documento.md
  - Ir a sección indicada → Encontrar respuesta

- **Time**: 30 min

---

## Estado Final del Proyecto

✅ **7 documentos raw/** completamente ingestionados
✅ **11 páginas wiki** interconectadas
✅ **50+ cross-references** entre páginas
✅ **100+ términos** indexados para búsqueda
✅ **Conexión bidireccional** wiki ↔ raw/
✅ **Sistema de referencia rápida** para cuando la IA no sabe algo

---

---

## [2026-09-01] ingesta | FASE TÉCNICA — Arquitectura, Código y Base de Datos

- **Summary**: Ingesta detallada del documento "FASE TÉCNICA — ARQUITECTURA, CÓDIGO Y BASE DE DATOS DEL MVP" (60 secciones exhaustivas). Documento más completo sobre arquitectura técnica del sistema.

- **Pages created**: Ninguna nueva (la página existe)

- **Pages updated**:
  - [[Arquitectura Técnica MVP]] — Actualización MASIVA: 2x contenido anterior, 15+ nuevas secciones
    - Restricciones principales (Mobile First, Performance, Consumo de datos, Interfaz rápida)
    - Detalles de stack tecnológico (rationales para cada decisión)
    - Arquitectura: Modular Monolith (no microservicios)
    - Principio de separación UI → Lógica → Datos
    - Operaciones críticas del dominio (createOrder, acceptOrder, etc.)
    - Estados y transiciones válidas (9 estados, tabla de transiciones)
    - Responsabilidad por estado (Mesero, Cocina)
    - Realtime: solo donde aporte valor
    - Estructura del código (módulos, ejemplo: Orders)
    - Server vs Client responsabilidades
    - Performance: optimizaciones clave
    - Despliegue y ambientes
    - Principios técnicos oficiales (9 principios)
    - Tecnologías NO usadas en MVP
    - Criterio de aceptación técnico
    - Próxima fase: DATABASE DESIGN V1

- **Key concepts extracted**:
  1. **Restricciones**: Mobile First + Performance + Low Data + Fast UI (4 pilares)
  2. **Stack**: Next.js + Tailwind + shadcn + Supabase (PostgreSQL + Auth + Realtime) + Vercel + Zod
  3. **Arquitectura**: Modular Monolith (8 dominios: Auth, Restaurants, Menu, Tables, Orders, Waiter, Kitchen, Staff)
  4. **Principios**: Performance First, Mobile First, Security by Default, Simple Architecture, Modular Code, Explicit Business Rules, Realtime Where Needed, Data Integrity, Evolvable
  5. **Estados de Orden**: 7 estados (PENDING, ACCEPTED, PREPARING, READY, DELIVERED, REJECTED, CANCELLED)
  6. **Transiciones válidas**: 9 transiciones permitidas, múltiples inválidas (ej. PENDING → READY ❌)
  7. **Responsabilidad**: Mesero (PENDING→ACCEPTED/REJECTED, READY→DELIVERED), Cocina (ACCEPTED→PREPARING→READY)
  8. **Estructura código**: Modular con actions/, queries/, validations/, types/ por dominio
  9. **Realtime events**: 5 eventos con WebSocket (Nuevo pedido, Aceptado, Listo, Solicitud, Cuenta)
  10. **Performance**: Carga progresiva, imágenes optimizadas, caché selectivo, consultas pequeñas

- **Contradictions**: Ninguno. Completamente alineado con [[Reglas de Negocio MVP]], [[Flujos Operativos del MVP]], [[Roles del Sistema]]

- **Connections discovered**:
  - Stack técnico implementa todos los Roles del Sistema definidos en [[Roles del Sistema]]
  - Estados y transiciones alinean perfectamente con [[Reglas de Negocio MVP]]
  - Operaciones críticas (acceptOrder, rejectOrder, etc.) son pilares de [[Flujos Operativos del MVP]]
  - Estructura modular por dominios espeja los Flujos Operativos

- **Próxima fase identificada**: DATABASE DESIGN V1 (ER diagram → tablas definitivas → SQL migrations)

- **Time**: 25 min

---

## [2026-09-02] ingesta | DATABASE DESIGN V2 — Schema SQL Seguro del MVP

- **Summary**: Ingesta automática de "DATABASE DESIGN V2 — SCHEMA SQL SEGURO DEL MVP". Documento completo con especificación SQL de 11 tablas, ENUMs, índices, RLS policies, validaciones server-side y auditoría.

- **Pages created**:
  - [[Modelo de Datos Definitivo]] (concept) — Schema SQL completo del MVP

- **Pages updated**:
  - [[Arquitectura Técnica MVP]] — Añadida referencia a DATABASE DESIGN V2 como próxima fase completada
  - [[wiki/index.md]] — Actualizado catálogo (12 páginas totales), estadísticas, fecha

- **Key concepts extracted**:
  1. **Multi-tenancy** — Aislamiento seguro por restaurante_id
  2. **Sesiones anónimas** — TABLE_SESSIONS para clientes sin autenticación
  3. **11 Tablas** — Profiles, Restaurants, Members, Tables, Sessions, Categories, Products, Orders, OrderItems, WaiterCalls, AuditLogs
  4. **ENUMs** — Estados y tipos tipados (OrderStatus, TableStatus, MemberRole, etc.)
  5. **RLS (Row Level Security)** — Seguridad a nivel de fila en PostgreSQL
  6. **Validaciones server-side** — Nunca confiar en frontend para operaciones críticas
  7. **Transiciones seguras** — Solo 9 transiciones permitidas de orden (PENDING→ACCEPTED, etc.)
  8. **Índices de performance** — 6 índices críticos (restaurant_status, category_restaurant, qr_token, members, sessions, waiter_calls)
  9. **Auditoría detallada** — AUDIT_LOGS con snapshot de acciones críticas
  10. **Historial de precios** — Snapshot en ORDER_ITEMS para datos históricos

- **Connections discovered**:
  - TABLE_SESSIONS resuelve problema de cliente anónimo (mencionado en [[Flujos Operativos del MVP]])
  - 7 ENUMs de estados alinean perfectamente con estados en [[Reglas de Negocio MVP]]
  - Arquitectura multi-tenant ANON/AUTH/SERVICE implementa roles de [[Roles del Sistema]]
  - RLS policies enfuerzan todas las reglas en [[Reglas de Negocio MVP]]

- **Contradictions**: Ninguno. Perfectamente alineado con toda la arquitectura anterior.

- **Próxima fase**: SQL migrations versionadas, stored procedures (RPCs) seguras, triggers para auditoría automática

- **Time**: 15 min (ingesta automática del loop)

---

## [2026-09-24] code | Sesión de mesa de 1 h 30 min + link de carta solo-WhatsApp

- **Resumen**: La sesión del celular tras escanear el QR pasa de 8 h a 1 h 30 min (absoluta, se renueva re-escaneando) y la pantalla vuelve sola a modo carta al vencer. Nuevo link público `/r/<slug>` (solo WhatsApp) accesible desde Mesas → "Link de carta"; el diálogo de QR de cada mesa ahora muestra y copia su link.
- **Páginas actualizadas**: [[Reglas de Negocio MVP]] (reglas 24–26)
- **Nuevas páginas**: ninguna
- **Contradiciones detectadas**: ninguna (la cuenta de la mesa en la base sigue con su expiración de 4 h por inactividad; lo que vence a los 90 min es la sesión del celular)
- **Duración**: 40min

---

## [2026-09-26] audit | Auditoría completa: funcionalidades, producción, tiempo real y roadmap

- **Resumen**: Inventario de lo que existe, lo que está a medias y lo que falta; build, TypeScript, lint, advisors de Supabase, RLS y prueba en vivo del tiempo real (mesero ve el pedido en 0.9–1.5 s, el cliente ve los cambios en <1 s). P0: repo público con credenciales demo y producción atrasada (el hueco de `/` → Mesa 1 sigue vivo). P1: "pedidos hoy" en UTC y un InvariantError de Next en la ruta del pedido.
- **Páginas actualizadas**: [[Wiki Index]]
- **Nuevas páginas**: [[Estado del Sistema — Auditoría 2026-09-26]]
- **Contradiciones detectadas**: `app/TESTING.md` dice que Cocina no tiene panel propio (sección de credenciales); hoy sí existe `/kitchen`.
- **Duración**: 60min

---

## [2026-09-28] code | Panel del admin: Personal, Ventas, Hoy y cobro en Configuración

- **Resumen**: El dueño/admin ya gestiona su personal (alta con clave temporal, rol, acceso, nueva clave), ve ventas de hoy/7/30 días, tiene una pantalla de inicio "Hoy" y el dueño activa el cobro desde Configuración. Barra más corta (Carta/Personal/Configuración al menú del avatar). Limpieza de código muerto y nombres `-v2`. Se cerró un hueco: un ADMIN podía darse rol OWNER escribiendo directo en `restaurant_members`.
- **Páginas actualizadas**: [[Wiki Index]]
- **Nuevas páginas**: [[Panel del Admin]]
- **Contradiciones detectadas**: "Ventas" (`/sales`) se solapa con el módulo `/reports` de la rama `feat/venta-rapida-y-reportes`; pendiente decidir cuál queda.
- **Duración**: 120min

---

## [2026-09-28] code | Integración final: reportes, cocina simplificada y "Agregar producto" en la caja

- **Resumen**: Se unieron en una sola rama el panel del admin, la venta rápida con reportes y el trabajo de la sesión de consola (hoja de cobro rediseñada, cocina en modo solo lectura para Omm Siri con `kitchen_ready_step`, entrega diferida del mesero). Se construyó el botón "Agregar producto" de la hoja de cobro sobre la RPC `add_items_to_bill`. Se recuperó al repo la migración `kitchen_flow_simplification`, aplicada a producción sin quedar versionada.
- **Páginas actualizadas**: [[Panel del Admin]]
- **Nuevas páginas**: ninguna
- **Contradiciones detectadas**: ninguna
- **Duración**: 60min

---

---

## [2026-09-28] lint+audit | Auditoría completa y actualización de docs

- **Resumen**: Actualización de CLAUDE.md (estructura actual, prioridades P0–P3), corrección de contradicciones en wiki (cobro solo OWNER/ADMIN, roles 4 no 5, reglas 27–28 en lugar de 25–26), evolución del alcance MVP (cobro y reportes ya incluidos), y nueva página de auditoría 2026-09-28. Cambio de nombres viejos de migraciones en app/TESTING.md.
- **Páginas actualizadas**: [[Wiki Index]] (estadísticas actualizadas), [[Roles del Sistema]] (4 roles, sin Superadmin), [[Reglas de Negocio MVP]] (reglas renumeradas 27–28), [[MVP - Alcance y Especificaciones]] (evolución, módulos nuevos)
- **Nuevas páginas**: [[Estado del Sistema — Auditoría 2026-09-28]]
- **Archivos actualizados**: CLAUDE.md (raíz), app/TESTING.md (nombres de migraciones: 20260928024924 y 20260928024941)
- **Contradiciones resueltas**: Quién cobra (mesero → solo OWNER/ADMIN), Superadmin (futuro, no MVP), números de reglas duplicados (25–26 → 27–28)
- **Duración**: 45min

---

## Próximos pasos

1. **Loop automático**: ✅ Configurado. Chequea `raw/assets/` cada 10 min, ingesta automática de archivos nuevos
2. **Query**: Hacer preguntas profundas (e.g. "¿Validaciones necesarias para acceptOrder()?")
3. **Lint**: Revisar salud del wiki (consistency, gaps, orphans)
4. **Roadmap**: Implementar P0 (backups, repo privado) → P1 (staging, tests) → P2 (SRI, inventario)

---

*Este log usa formato consistente `## [FECHA] operacion | descripcion` para ser parseable.*
