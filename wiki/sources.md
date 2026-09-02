---
title: "Fuentes Originales"
type: "reference"
created: "2026-09-01"
updated: "2026-09-01"
---

# Fuentes Originales (raw/assets)

Catálogo de documentos originales que alimentan el wiki. Estos son los "source of truth".

## 1. PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md

**Tamaño**: 31 KB | **Secciones**: 70+

El documento fundacional del proyecto. Define la visión, problema, solución, usuarios, experiencia y roadmap.

### Contenido Principal
- Visión del proyecto
- Problema que se soluciona
- Solución propuesta
- Usuarios del sistema (Cliente, Mesero, Cocina, Admin, Superadmin)
- Experiencia completa del cliente
- Pantalla principal
- Navegación
- Estados de pedido
- Administración de mesas
- Productos y categorías
- Personalización
- Objetivos del diseño
- Mobile First
- Experiencia sin cuenta
- Problemas reales a contemplar
- Fases del proyecto (0-7)
- MVP
- Modelo comercial
- Roadmap
- Filosofía del proyecto

### Página Wiki Relacionada
→ [[Proyecto QR - Visión General]]

---

## 2. Roles y flujo operativo — MVP.md

**Tamaño**: 12 KB | **Secciones**: 21

Definición de roles operativos y flujos específicos del MVP. Es la especificación operativa.

### Contenido Principal
- Roles principales (Cliente, Mesero, Cocina, Admin, Superadmin)
- Principio operativo (responsabilidad clara)
- Flujo de pedido realizado por cliente
- Estados del pedido (PENDIENTE, ACEPTADO, RECHAZADO, EN PREPARACIÓN, LISTO, ENTREGADO, CANCELADO)
- Responsabilidad del mesero
- Mesero recibe llamadas
- Mesero acepta/rechaza solicitudes
- Diferencia entre PEDIDO y LLAMADA
- Cocina (qué sí hace, qué no hace)
- Flujo de cocina
- Cómo llega un pedido a cocina
- Qué pasa si rechaza
- Qué pasa si acepta
- Flujos completos (A, B, C)
- 10 Reglas fundamentales
- Ejemplo de funcionamiento real
- Objetivo de arquitectura operativa
- Evolución futura

### Página Wiki Relacionada
→ [[Flujos Operativos del MVP]]

---

## 3. MAPA DE PANTALLAS — MVP.md

**Tamaño**: 17 KB | **Secciones**: 51

Mapeo completo de las 38 pantallas del sistema. Define estructura, información y navegación.

### Contenido Principal
- Estructura general (4 experiencias: Cliente, Mesero, Cocina, Admin)
- Experiencia del cliente (11 pantallas)
- Experiencia del mesero (10 pantallas)
- Experiencia de cocina (5 pantallas)
- Experiencia del administrador (12 pantallas)
- Pantalla de entrada por QR
- Pantalla principal (carta)
- Pantalla de categoría
- Pantalla de detalle de producto
- Pantalla de carrito
- Revisión de pedido
- Pedido enviado
- Estado del pedido
- Llamar al mesero
- Solicitud enviada
- Solicitud atendida
- Solicitar cuenta
- Navegación general del cliente
- Navegación del mesero
- Navegación de cocina
- Navegación del administrador
- Pantallas de error globales
- Estados de carga
- Estados vacíos
- Resultado de esta fase

### Páginas Wiki Relacionadas
→ [[Mapa de Pantallas - General]]
→ [[Pantallas del Cliente - Detalles]]

---

## 4. PROYECTO — FASES UX, REGLAS DE NEGOCIO, DATOS Y ARQUITECTURA DEL MVP.md

**Tamaño**: 16 KB | **Secciones**: 48

El documento más técnico. Define arquitectura, modelo de datos, reglas y plan de desarrollo.

### Contenido Principal
- Estado de definición del producto
- Administrador del restaurante (navegación, dashboard)
- Productos (CRUD)
- Categorías
- Mesas
- QR
- Empleados
- Roles (OWNER, ADMIN, WAITER, KITCHEN)
- Configuración
- Personalización
- Reglas generales del sistema (26 reglas)
- Regla crítica del pedido
- Mesero
- Cocina
- Entrega
- Solicitudes de atención
- Tipos de solicitud
- Solicitud de cuenta
- Productos (estados)
- Validaciones
- Concurrencia
- Pedidos duplicados
- Solicitudes duplicadas
- Restaurante cerrado
- Seguridad multi-restaurante
- Auditoría
- Modelo de datos conceptual (10 tablas)
- Relaciones principales
- Arquitectura técnica (Stack: Next.js, Supabase, PostgreSQL)
- Arquitectura conceptual (diagrama)
- Flujo Realtime
- Aplicaciones
- Lo que no entra inicialmente
- Orden de desarrollo (7 Sprints)
- Prueba principal del MVP
- Pruebas de errores
- Demo comercial
- Estrategia de validación
- Estado general del proyecto
- Próxima fase oficial

### Páginas Wiki Relacionadas
→ [[Arquitectura Técnica MVP]]
→ [[Reglas de Negocio MVP]]

---

## 5. FASE UX — WIREFRAMES DEL CLIENTE MOBILE.md

**Tamaño**: 19 KB | **Secciones**: Variable

Wireframes detallados de la experiencia móvil del cliente. Define estructura de 11 pantallas.

### Pantallas Wireframeadas
1. Entrada mediante QR
2. Carta principal (Mobile First)
3. Categoría
4. Detalle de producto
5. Carrito
6. Confirmación
7. Pedido enviado
8. Estado del pedido
9. Llamar al mesero
10. Solicitar cuenta
11. Estados de error

### Características
- Mobile First
- Estructura de información
- Botones y acciones
- Navegación
- Jerarquía
- Estados
- Comportamiento en celular

### Página Wiki Relacionada
→ [[Fase UX — Wireframes (Síntesis)]]
→ [[Pantallas del Cliente - Detalles]]

---

## 6. FASE UX — WIREFRAMES DEL MESERO.md

**Tamaño**: 17 KB | **Secciones**: Variable

Wireframes para la experiencia del mesero. Define estructura de 10 pantallas.

### Pantallas Wireframeadas
1. Login
2. Dashboard
3. Pedidos nuevos
4. Detalle de pedido
5. Aceptar pedido
6. Rechazar pedido
7. Pedidos activos
8. Solicitudes
9. Mesas
10. Detalle de mesa

### Características
- Dashboard centralizado
- Prioridad en urgencia
- Notificaciones en tiempo real
- Acciones rápidas

### Página Wiki Relacionada
→ [[Fase UX — Wireframes (Síntesis)]]

---

## 7. FASE UX — WIREFRAMES DE COCINA.md

**Tamaño**: 16 KB | **Secciones**: Variable

Wireframes para cocina. Define estructura ultra-minimalista de 5 pantallas.

### Pantallas Wireframeadas
1. Panel de cocina
2. Pedido (NUEVO)
3. En preparación
4. Marcar listo
5. Confirmación

### Características
- Ultra-minimalista
- Solo esencial
- Producción pura
- Sin distracciones

### Página Wiki Relacionada
→ [[Fase UX — Wireframes (Síntesis)]]

---

## 📊 Relación entre Fuentes

```
Documento 1: PROYECTO (Visión)
   ↓
Documento 2: Roles y Flujos (Operación)
   ↓
Documento 3: Mapa de Pantallas (Diseño)
   ↓
Documento 4: Arquitectura (Técnica)
   ↓
Documentos 5, 6, 7: Wireframes (Especificación UX)
```

---

## 🔗 Cómo Acceder

Los archivos fuente están en:
```
~/Desktop/monky.com/raw/assets/
```

Cada documento markdown puede:
- Abrirse directamente
- Ser editado si es necesario actualizar
- Servir como referencia para validar el wiki

---

## ⚠️ Regla Importante

Estos documentos en `raw/` son **fuente de verdad**.

Si hay discrepancias entre `raw/` y `wiki/`, los `raw/` documentos tienen autoridad.

El wiki resume, linkea y organiza, pero `raw/` es el original.

---

**Última actualización**: 2026-09-01
