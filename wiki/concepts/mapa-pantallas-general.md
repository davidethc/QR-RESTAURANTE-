---
title: "Mapa de Pantallas - General"
type: "concept"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["MAPA DE PANTALLAS — MVP.md"]
tags: ["pantallas", "ui", "mvp", "experiencia"]
---

# Mapa de Pantallas — Visión General

Documento que define todas las pantallas del MVP organizadas por rol y experiencia del usuario.

## Arquitectura General

El sistema se divide en **cuatro experiencias independientes**:

```
                    PLATAFORMA
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
      CLIENTE         STAFF        ADMINISTRADOR
                         │
                    ┌────┴────┐
                    ▼         ▼
                  MESERO    COCINA
```

### Nota importante
- **Cliente**: No necesita autenticación (acceso por QR)
- **Staff (Mesero, Cocina, Admin)**: Requiere login

## Experiencias y Pantallas por Rol

### Cliente (11 pantallas)
1. Entrada por QR
2. Carta principal
3. Categoría
4. Detalle de producto
5. Carrito
6. Confirmación de pedido
7. Pedido enviado
8. Estado del pedido
9. Llamar al mesero
10. Solicitar cuenta
11. Estados de error

**Características**: Mobile-first, sin login, sin instalación de app.

### Mesero (10 pantallas)
1. Login
2. Dashboard
3. Pedidos nuevos
4. Detalle de pedido
5. Aceptar pedido
6. Rechazar pedido
7. Pedidos activos (por estado)
8. Solicitudes de atención
9. Vista de mesas
10. Detalle de mesa

**Características**: Acceso mediante login, dashboard centralizado, gestión de pedidos y solicitudes.

### Cocina (5 pantallas)
1. Login
2. Panel de cocina
3. Pedido (NUEVO)
4. En preparación
5. Marcar listo

**Características**: Ultra minimalista, foco en producción, sin distracciones administrativas.

### Administrador (12 pantallas)
1. Login
2. Dashboard
3. Pedidos (listado)
4. Mesas (listado)
5. Productos (listado)
6. Crear producto
7. Editar producto
8. Categorías
9. Gestión de QR
10. Empleados
11. Configuración
12. Personalización

**Características**: Acceso completo a configuración, gestión de recursos, visibilidad de operaciones.

## Flujos de Navegación

### Navegación del Cliente

```
CARTA (Inicio)
 │
 ├── Buscar
 │
 ├── Categorías
 │      └── Productos
 │             └── Detalle
 │
 ├── Carrito
 │      └── Confirmar
 │             └── Pedido enviado
 │                    └── Ver estado
 │
 ├── 🛎️ Llamar mesero
 │      └── Solicitud enviada
 │
 └── 💳 Solicitar cuenta
        └── Solicitud enviada
```

### Navegación del Mesero

```
LOGIN
 ↓
DASHBOARD
 │
 ├── Pedidos
 │    ├── Nuevos (aceptar/rechazar)
 │    ├── Aceptados
 │    ├── En preparación
 │    ├── Listos (recoger)
 │    └── Entregados
 │
 ├── Solicitudes (atender/rechazar)
 │
 └── Mesas (ver estado y detalles)
```

### Navegación de Cocina

```
LOGIN
 ↓
PANEL COCINA
 │
 ├── Pendientes (PREPARAR)
 │
 ├── En preparación (MARCAR LISTO)
 │
 └── Listos (confirmación)
```

**Nota**: Extremadamente simple, solo 3 secciones.

### Navegación del Administrador

```
LOGIN
 ↓
DASHBOARD
 │
 ├── Resumen (métricas del día)
 ├── Pedidos (historial y estado)
 ├── Mesas (gestión completa)
 ├── Productos (CRUD)
 ├── Categorías (crear, editar, eliminar, reordenar)
 ├── QR (descargar, imprimir, bulk)
 ├── Empleados (crear, editar, roles)
 └── Configuración (personalización del restaurante)
```

## Principios de Diseño de Pantallas

### Para Cliente
- **Mobile-first**: Diseñado primero para teléfono
- **Sin fricción**: Máximo 3-4 clics para hacer pedido
- **Visual**: Fotos de cada producto
- **Claro**: Sin jerga técnica
- **Intuitivo**: No requiere tutorial
- **Confiable**: Siempre funciona

### Para Mesero
- **Urgencia**: Pedidos nuevos primero
- **Claridad**: Estados visuales claros
- **Rapidez**: Acciones rápidas (aceptar/rechazar)
- **Información**: Detalles completos cuando los necesita

### Para Cocina
- **Minimalista**: Solo lo esencial
- **Production-focused**: Cero administrativo
- **Rápido**: Interfaz optimizada
- **Visual**: Pocas palabras, muchas números

### Para Administrador
- **Control**: Visibilidad total
- **Gestión**: CRUD completo de recursos
- **Información**: Dashboard con métricas
- **Configuración**: Personalización de marca

## Estados Globales de Pantalla

### Estados de Carga
- "Cargando carta..."
- "Enviando pedido..."
- "Aceptando pedido..."
- "Guardando cambios..."

Uso de skeletons o loaders visuales para no congelar pantalla.

### Estados Vacíos
- "NO HAY PEDIDOS — Cuando recibas un pedido aparecerá aquí"
- "NO HAY PEDIDOS EN PREPARACIÓN — Todo está al día ✓"
- "NO HAY SOLICITUDES — Todo tranquilo"

### Estados de Error Globales
1. **Error de conexión**: "No pudimos conectar. Comprueba tu conexión. [REINTENTAR]"
2. **Página inexistente**: "Página no encontrada. [VOLVER]"
3. **Sesión expirada**: "Tu sesión ha expirado. [INICIAR SESIÓN]"
4. **Sin permisos**: "No tienes permiso para acceder a esta sección."

## Colores de Estado (Visual)

Códigos visuales usados en todo el sistema:

- 🟢 **Verde/Disponible**: Mesa desocupada, producto disponible
- 🟡 **Amarillo/Ocupada**: Mesa con cliente, estado en proceso
- 🔵 **Azul/Preparando**: Pedido en preparación
- 🔴 **Rojo/Alerta**: Atención requerida, solicitud pendiente
- ⚫ **Negro/Cuenta**: Cuenta solicitada

## Estructura de Información por Pantalla

### Pantalla Típica de Cliente
- Header: Logo + nombre restaurante
- Busca/Filtro
- Contenido principal
- Botones flotantes: Carrito, Llamar mesero
- Estado de sincronización

### Pantalla Típica de Mesero
- Header: Saludo + nombre restaurante
- Resumen rápido (números)
- Secciones por tabs/cards
- Acciones principales prominentes
- Notificaciones en tiempo real

### Pantalla Típica de Cocina
- Solo número de pedido
- Número de mesa
- Lista de productos
- Observaciones
- Botón único [MARCAR LISTO]

### Pantalla Típica de Admin
- Título de sección
- Buscador/Filtro
- Listado o formulario
- Acciones (editar, eliminar, crear)
- Guardar cambios

## Casos de Uso Especiales

### Producto Agotado
- Botón [AGREGAR] deshabilitado
- Mensaje: "Actualmente no disponible"
- Cliente no puede agregarlo al carrito

### Pedido Rechazado
Mesero selecciona motivo:
- Producto agotado
- Problema con pedido
- Restaurante no puede procesarlo
- Otro (con comentario)

Cliente ve: "Lo sentimos, no pudimos aceptar tu pedido. Motivo: [X]"

### Restaurante Cerrado
Cliente ve: "Estamos cerrados. Horario: 11:00 - 22:00"

### QR Inválido
Cliente ve: "QR no válido. Este código no corresponde a una mesa activa. [Volver]"

### Mesa Desactivada
Cliente ve: "Mesa no disponible. Consulta con el personal del restaurante."

## Próximo Paso

Una vez definido este mapa, se procede a:
1. **Wireframes UX**: Detallar cada pantalla
2. **UI Visual**: Diseño gráfico
3. **Componentes**: Reutilizables
4. **Prototipo**: Interacción
5. **Dev**: Implementación

## Conexiones en el Wiki

- [[Pantallas del Cliente - Detalles]] — Detalle completo de las 11 pantallas del cliente
- [[Roles del Sistema]] — Qué usuario accede a cada grupo de pantallas
- [[Flujos Operativos del MVP]] — Cómo se navega entre pantallas según los flujos
- [[MVP - Alcance y Especificaciones]] — Estas pantallas definen el alcance del MVP
- [[Fase UX — Wireframes (Síntesis)]] — Wireframes que especifican estas pantallas
- [[Arquitectura Técnica MVP]] — Cómo se implementan estas pantallas

**Fuente Original**: Ver [[Fuentes Originales]] → Documento 3

---

**Fuentes**: MAPA DE PANTALLAS — MVP.md
