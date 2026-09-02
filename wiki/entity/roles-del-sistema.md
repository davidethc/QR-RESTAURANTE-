---
title: "Roles del Sistema"
type: "entity"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["Roles y flujo operativo — MVP.md", "PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md"]
tags: ["roles", "usuarios", "sistema"]
---

# Roles del Sistema

El MVP implementa cinco roles operativos con responsabilidades claramente definidas.

## 1. Cliente

**Definición**: Usuario que accede desde el QR en la mesa para consultar carta y hacer pedidos.

### Características
- No necesita crear cuenta
- No necesita instalar aplicación
- Acceso inmediato mediante QR
- Interfaz mobile-first

### Acciones principales
- Ver menú completo
- Buscar productos por nombre
- Explorar categorías
- Consultar fotografías y detalles
- Ver precios y disponibilidad
- Seleccionar productos
- Configurar opciones (extras, ingredientes, observaciones)
- Crear carrito
- Confirmar y enviar pedido
- Consultar estado del pedido en tiempo real
- Llamar al mesero
- Solicitar la cuenta
- Ver estimado de tiempo de preparación (futuro)

### Pantallas principales
1. **Inicio**: Logo, nombre restaurante, descripción, búsqueda
2. **Categorías**: Navegación por tipo de producto
3. **Productos**: Foto, nombre, descripción, precio, disponibilidad
4. **Producto detalle**: Configurar opciones, extras, notas especiales
5. **Carrito**: Resumen de selecciones, total, mesa identificada
6. **Confirmación**: "¿Confirmar pedido para Mesa X?"
7. **Estado pedido**: Seguimiento de pedido #XXX

### Experiencia deseada
- Rápida (máximo 3-4 clics para hacer pedido)
- Visual (muchas fotos)
- Clara (sin jerga técnica)
- Intuitiva (no requiere tutorial)
- Confiable (siempre funciona)

### Lo que el cliente no ve
- Administración
- Panel backend
- Configuración del restaurante
- Datos de otros clientes

---

## 2. Mesero

**Definición**: Personal del restaurante que recibe pedidos y solicitudes del cliente, los valida, y gestiona la interacción.

### Características
- Acceso mediante login
- Interfaz en tablet/computadora/teléfono
- Vista de múltiples mesas y pedidos simultáneamente
- Notificaciones en tiempo real

### Acciones principales
- Ver pedidos nuevos
- Revisar detalles del pedido
- Aceptar pedido (→ va a cocina)
- Rechazar pedido (con motivo)
- Ver solicitudes (llamadas al mesero)
- Aceptar/rechazar solicitudes
- Marcar solicitud como atendida
- Recibir notificación cuando pedido está listo
- Recoger pedido de cocina
- Marcar pedido como entregado
- Consultar estado actual de cada mesa

### Pantallas principales
1. **Dashboard**: Resumen de mesas, pedidos pendientes, solicitudes
2. **Pedidos pendientes**: Lista de nuevos pedidos esperando decisión
3. **Detalle de pedido**: Productos, cantidad, observaciones, [ACEPTAR] [RECHAZAR]
4. **Solicitudes**: Llamadas de mesero, solicitudes de cuenta
5. **Pedidos listos**: Pedidos que cocina terminó y están listos
6. **Mesas**: Vista general del estado de cada mesa

### Estados de mesa que ve
- 🟢 Disponible
- 🟡 Ocupada (cliente presente)
- 🔵 Pedido en preparación
- 🔴 Atención requerida (solicitud pendiente)
- ⚫ Cuenta solicitada

### Responsabilidades críticas
- Validar que el pedido sea posible (productos disponibles)
- Decidir si acepta o rechaza
- Registrar motivo si rechaza
- Actualizar estado de disponibilidad de productos
- Mantener comunicación con cocina
- Atender solicitudes de clientes
- Entregar pedidos

### Lo que el mesero NO puede hacer
- Crear/editar productos
- Cambiar precios
- Modificar mesas
- Ver administración
- Acceso a estadísticas

---

## 3. Cocina

**Definición**: Personal encargado de preparar los pedidos que el mesero aceptó.

### Características
- Acceso mediante login o sin autenticación (interfaz pública en kitchen)
- Interfaz ultra-simplificada
- Foco total en producción
- Sin distracciones administrativas

### Acciones principales
- Visualizar pedidos aceptados
- Consultar lista de productos del pedido
- Leer observaciones especiales
- Ver número de mesa
- Marcar pedido como "EN PREPARACIÓN" (opcional, automático)
- Marcar pedido como "LISTO"
- Ver tiempo transcurrido desde que llegó el pedido (futuro)

### Pantalla única
```
PEDIDO #XXX
MESA Y

X × Producto A
X × Producto B
X × Producto C

Nota: Sin ingrediente X
Nota: Especial preparación

[ MARCAR LISTO ]
```

### Responsabilidades
- Preparar pedidos en orden correcto
- Respetar observaciones especiales
- Marcar como listo cuando está terminado
- No aceptar ni rechazar pedidos

### Lo que cocina NO puede hacer
- Aceptar/rechazar pedidos
- Administrar productos
- Gestionar mesas
- Ver estadísticas
- Acceder a configuración
- Comunicarse directamente con clientes

### Filosofía
**Cocina es producción pura.** No debe tener acceso a nada excepto: "Estos pedidos, prepáralos, marca listo cuando termines."

---

## 4. Administrador (Dueño del Restaurante)

**Definición**: Persona que controla y configura completamente un restaurante.

### Características
- Login seguro
- Acceso total a configuración
- Vista de todas las operaciones
- Permisos para crear usuarios

### Acciones principales

#### Gestión de Productos
- Crear productos
- Editar productos
- Eliminar productos
- Cambiar precios
- Subir fotografías
- Crear categorías
- Activar/desactivar productos (sin eliminarlos)
- Marcar producto como agotado

#### Gestión de Mesas
- Crear mesas
- Eliminar mesas
- Generar QR para cada mesa
- Ver QR históricos
- Descargar/imprimir QR

#### Gestión de Operación
- Ver todos los pedidos
- Ver todas las solicitudes
- Consultar estado de pedidos
- Recibir notificaciones
- Ver mesas en tiempo real
- Consultar historial

#### Configuración del Restaurante
- Nombre del restaurante
- Descripción
- Logo
- Imagen principal
- Color principal / secundario
- Redes sociales
- Teléfono
- Dirección
- Horarios de apertura/cierre

#### Gestión de Usuarios
- Crear usuarios (meseros, cocina)
- Asignar roles
- Cambiar permisos
- Desactivar usuarios

#### Acceso Futuro (Post-MVP)
- Ver estadísticas
- Generar reportes
- Gestionar promociones
- Programa de puntos
- Inventario avanzado
- Análisis de ventas

### Lo que administrador NO puede hacer (MVP)
- Crear otros administradores
- Eliminar el restaurante
- Ver datos de otros restaurantes

---

## 5. Superadministrador (Propietario de la Plataforma)

**Definición**: Tú, como propietario de la plataforma, con acceso total al sistema.

### Acciones principales
- Crear restaurantes
- Suspender restaurantes
- Ver todos los restaurantes
- Ver planes y suscripciones
- Administrar suscripciones
- Ver actividad del sistema
- Gestionar cuentas
- Dar soporte
- Configurar funcionalidades globales
- Ver métricas de plataforma

### Lo que superadmin gestiona
- Infraestructura
- Usuarios de todo restaurante
- Políticas de plataforma
- Integraciones
- Actualizaciones

---

## Matriz de Permisos (MVP)

| Acción | Cliente | Mesero | Cocina | Admin | SuperAdmin |
|--------|---------|--------|--------|-------|------------|
| Ver carta | ✅ | ❌ | ❌ | ✅ | ❌ |
| Hacer pedido | ✅ | ❌ | ❌ | ❌ | ❌ |
| Aceptar/Rechazar pedido | ❌ | ✅ | ❌ | ✅ | ❌ |
| Preparar (marcar listo) | ❌ | ❌ | ✅ | ✅ | ❌ |
| Crear/editar productos | ❌ | ❌ | ❌ | ✅ | ✅ |
| Cambiar precios | ❌ | ❌ | ❌ | ✅ | ✅ |
| Gestionar mesas | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ver todos los pedidos | ❌ | ✅* | ❌ | ✅ | ✅ |
| Crear usuarios | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ver configuración | ❌ | ❌ | ❌ | ✅ | ✅ |
| Crear restaurantes | ❌ | ❌ | ❌ | ❌ | ✅ |

*Mesero ve solo pedidos de sus mesas activas

---

## Separación de Datos

Dato crítico: **Cada rol solo ve datos del restaurante al que pertenece.**

Cliente escanea Mesa 7 del Restaurante A → solo ve datos de Restaurante A, Mesa 7.

Mesero de Restaurante A → solo ve datos de Restaurante A.

Cocina de Restaurante B → solo ve datos de Restaurante B.

Superadmin → ve todo (es propietario de la plataforma).

## Conexiones en el Wiki

- [[Flujos Operativos del MVP]] — Flujos específicos que ejecutan estos roles
- [[Pantallas del Cliente - Detalles]] — Qué ve y hace el Cliente
- [[Mapa de Pantallas - General]] — Pantallas para cada rol
- [[Reglas de Negocio MVP]] — Restricciones de permisos y acciones por rol
- [[Arquitectura Técnica MVP]] — Cómo la BD implementa roles (row-level security)
- [[Proyecto QR - Visión General]] — Contexto de quiénes son los usuarios

**Fuente Original**: Ver [[Fuentes Originales]] → Documentos 1 y 2

---

**Fuentes**: 
- Roles y flujo operativo — MVP.md
- PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md
