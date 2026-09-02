---
title: "Fase UX — Wireframes (Síntesis)"
type: "synthesis"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["FASE UX — WIREFRAMES DEL CLIENTE MOBILE.md", "FASE UX — WIREFRAMES DEL MESERO.md", "FASE UX — WIREFRAMES DE COCINA.md"]
tags: ["wireframes", "ux", "diseño", "fase"]
---

# Fase UX — Wireframes del Sistema

Síntesis de la fase de diseño de wireframes para Cliente, Mesero y Cocina.

## Objetivo General

Esta fase define la estructura de cada pantalla, información, navegación y comportamiento, SIN definir todavía:
- Colores
- Tipografías
- Estilo visual
- Tecnología específica

El resultado es un conjunto de wireframes que guiarán el diseño visual posterior.

## Cliente Mobile — Wireframes

**Documento completo**: FASE UX — WIREFRAMES DEL CLIENTE MOBILE.md

### Principio
```
Mobile First
Cliente usa smartphone
Experiencia intuitiva sin explicación
```

### Flujo del Cliente
```
ESCANEAR QR
   ↓
VALIDAR (Restaurante + Mesa)
   ↓
CARTA PRINCIPAL
   ↓
EXPLORAR (Categorías/Buscar)
   ↓
VER PRODUCTO
   ↓
AGREGAR AL CARRITO
   ↓
REVISAR CARRITO
   ↓
CONFIRMAR PEDIDO
   ↓
PEDIDO ENVIADO
   ↓
SEGUIMIENTO (Estado en tiempo real)
```

### Pantallas Definidas
1. Entrada QR
2. Carta principal
3. Categoría
4. Detalle de producto
5. Carrito
6. Confirmación
7. Pedido enviado
8. Seguimiento de estado
9. Llamar mesero
10. Solicitar cuenta
11. Estados de error

### Características
- Diseño responsive para teléfonos
- Sin necesidad de instalación
- Sin login requerido
- Acceso inmediato por QR
- Navegación clara

---

## Mesero — Wireframes

**Documento completo**: FASE UX — WIREFRAMES DEL MESERO.md

### Principio
```
Dashboard centralizado
Prioridad en urgencia
Pedidos nuevos primero
```

### Flujo del Mesero
```
LOGIN
   ↓
DASHBOARD
   ├── Resumen (pedidos, solicitudes, mesas)
   ├── Pedidos (nuevos, en preparación, listos)
   ├── Solicitudes (atender)
   └── Mesas (ver estado individual)
```

### Pantallas Definidas
1. Login
2. Dashboard (resumen)
3. Pedidos nuevos (aceptar/rechazar)
4. Detalle de pedido
5. Aceptar pedido
6. Rechazar pedido (con motivo)
7. Pedidos activos (por estado)
8. Solicitudes de atención
9. Vista de mesas (visual grid)
10. Detalle de mesa

### Características
- Interfaz para tablet/smartphone/desktop
- Información prioritizada (urgencia)
- Notificaciones en tiempo real
- Acciones rápidas (aceptar/rechazar)
- Estados visuales claros

---

## Cocina — Wireframes

**Documento completo**: FASE UX — WIREFRAMES DE COCINA.md

### Principio
```
Ultra-minimalista
Solo esencial
Producción pura
Sin distracciones
```

### Flujo de Cocina
```
LOGIN (opcional)
   ↓
PANEL COCINA
   ├── Pedidos nuevos (ACEPTADOS)
   ├── En preparación (PREPARANDO)
   └── Listos (confirmación)
```

### Pantallas Definidas
1. Panel de cocina (vista principal)
2. Pedido (NUEVO)
3. Marcar EN PREPARACIÓN
4. Marcar LISTO
5. Confirmación de listo

### Características
- Máxima simplicidad
- Solo número, mesa, productos
- Botón único: [MARCAR LISTO]
- Sin configuraciones ni opciones
- Optimizado para velocidad
- Puede montarse en pantalla grande o tablet

---

## Comparativa de Wireframes

| Aspecto | Cliente | Mesero | Cocina |
|---------|---------|--------|--------|
| **Objetivo** | Pedir | Validar | Preparar |
| **Complejidad** | Media | Media-Alta | Mínima |
| **Interacciones** | Muchas | Moderadas | Pocas |
| **Información** | Visual + Texto | Datos operativos | Números + Instrucciones |
| **Dispositivo** | Mobile (principalmente) | Tablet/Desktop | Tablet/Desktop |
| **Tiempo en pantalla** | Largo | Corto | Muy corto |

---

## Estados Globales (Todos los Wireframes)

### Estados de Carga
```
"Cargando carta..."
"Enviando pedido..."
"Aceptando pedido..."
"Guardando cambios..."
```

### Estados Vacíos
```
"NO HAY PEDIDOS - Cuando recibas un pedido aparecerá aquí"
"NO HAY SOLICITUDES - Todo tranquilo"
"TODO ESTÁ AL DÍA ✓"
```

### Estados de Error
```
"No pudimos conectar con el servidor"
"Página no encontrada"
"Tu sesión ha expirado"
"No tienes permiso para acceder"
```

---

## Próximo Paso Después de Wireframes

Una vez aprobados los wireframes:

```
Wireframes ✓
   ↓
UI DESIGN SYSTEM
   ├── Colores
   ├── Tipografías
   ├── Componentes
   ├── Espaciado
   └── Estados visuales
   ↓
DISEÑO VISUAL (Figma/Sketch)
   ↓
MODELO DE DATOS DEFINITIVO
   ↓
DESARROLLO
```

## Conexiones en el Wiki

- [[Mapa de Pantallas - General]] — Vista conceptual que estos wireframes especifican
- [[Pantallas del Cliente - Detalles]] — Detalle de wireframes de cliente
- [[Roles del Sistema]] — Wireframes para cada rol (Cliente, Mesero, Cocina, Admin)
- [[Flujos Operativos del MVP]] — Cómo se navegan estos wireframes según flujos
- [[Arquitectura Técnica MVP]] — Cómo se implementan estos wireframes

**Fuente Original**: Ver [[Fuentes Originales]] → Documentos 5, 6 y 7

---

**Fuentes**: 
- FASE UX — WIREFRAMES DEL CLIENTE MOBILE.md
- FASE UX — WIREFRAMES DEL MESERO.md
- FASE UX — WIREFRAMES DE COCINA.md
