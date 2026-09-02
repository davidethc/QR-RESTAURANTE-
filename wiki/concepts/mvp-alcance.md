---
title: "MVP - Alcance y Especificaciones"
type: "concept"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md"]
tags: ["mvp", "alcance", "especificaciones"]
---

# MVP — Alcance y Especificaciones

## Definición del MVP

Mínimo Producto Viable que permite:
1. Un restaurante registrarse
2. Configurar su carta
3. Crear mesas y generar QR
4. Un cliente escanear, ver carta y hacer pedido
5. El restaurante recibir y gestionar pedidos

## Lo que SÍ entra en el MVP

### Lado Cliente (Mobile-First)

#### Funcionalidad 1: Escanear QR
- QR llevará a URL: `restaurant-experience.com/restaurante-xyz/mesa/03`
- Sin login requerido
- Sin instalación de app

#### Funcionalidad 2: Visualizar Carta
- Mostrar nombre y descripción del restaurante
- Mostrar imagen principal
- Buscar productos (por nombre)
- Filtrar por categoría
- Para cada producto:
  - Foto
  - Nombre
  - Descripción
  - Precio
  - Disponibilidad (disponible/agotado)

#### Funcionalidad 3: Crear Pedido
- Seleccionar producto
- Especificar cantidad
- Añadir extras/ingredientes (si aplica)
- Escribir observación ("una sin cebolla")
- Ver carrito con subtotal
- Confirmar pedido
- Enviar

#### Funcionalidad 4: Consultar Estado
- Ver estado del pedido en tiempo real
- Estados: PENDIENTE → ACEPTADO → EN PREPARACIÓN → LISTO → ENTREGADO
- Actualización automática

#### Funcionalidad 5: Solicitar Atención
- Botón: 🛎️ Llamar al mesero
- Botón: 💳 Solicitar cuenta
- Confirmación visual cuando mesero responde

### Lado Restaurante (Admin)

#### Funcionalidad 1: Autenticación
- Login con email/contraseña
- Recordar contraseña (recuperación)
- Sesión segura

#### Funcionalidad 2: Dashboard
- Resumen de hoy:
  - Número de pedidos
  - Número de clientes
  - Mesas activas
- Pedidos pendientes (últimos 5)
- Solicitudes activas
- Estado de mesas visualizado

#### Funcionalidad 3: Administrar Productos
- CRUD completo (Crear, Leer, Actualizar, Eliminar)
- Campos:
  - Nombre
  - Descripción
  - Precio
  - Categoría
  - Imagen
  - Disponibilidad (switch activo/inactivo)
- Bulk actions (desactivar múltiples)
- Búsqueda y filtrado

#### Funcionalidad 4: Administrar Categorías
- Crear categorías
- Editar nombre
- Ordenar categorías (arrastrar)
- Eliminar (con validación)

#### Funcionalidad 5: Administrar Mesas
- CRUD completo
- Campos:
  - Número de mesa
  - Capacidad (opcional)
  - Estado actual
- Ver QR de cada mesa
- Descargar/imprimir QR
- Bulk actions

#### Funcionalidad 6: Ver Pedidos
- Listado de todos los pedidos
- Filtros: por estado, por mesa, por fecha
- Detalles de cada pedido:
  - Número
  - Mesa
  - Productos
  - Total
  - Estado
  - Hora
- Historial de cambios de estado

#### Funcionalidad 7: Recibir y Gestionar Pedidos (en tiempo real)
- Notificación cuando llega pedido nuevo
- Ver pedido pendiente
- Aceptar o rechazar (con motivo)
- Transición automática a cocina
- Ver confirmación de aceptación

#### Funcionalidad 8: Recibir Solicitudes
- Notificación cuando cliente llama al mesero
- Ver qué mesa solicita
- Aceptar o rechazar
- Marcar como atendido

#### Funcionalidad 9: Configuración del Restaurante
- Nombre
- Descripción
- Logo
- Imagen principal
- Color primario / secundario
- Teléfono
- Dirección
- Email
- Horarios (apertura/cierre)
- Redes sociales (links opcionales)

#### Funcionalidad 10: Generar QR
- QR automático por mesa
- Descargar como imagen
- Opción para imprimir (batch)
- Personalizar diseño QR (futura mejora)

### Lado Cocina

#### Funcionalidad 1: Ver Pedidos Aceptados
- Mostrar solo pedidos en estado ACEPTADO o EN PREPARACIÓN
- Interfaz minimalista

#### Funcionalidad 2: Consultar Detalles
- Número de pedido
- Número de mesa
- Lista de productos
- Cantidad de cada producto
- Observaciones especiales
- Tiempo desde que llegó (futuro)

#### Funcionalidad 3: Marcar como Listo
- Botón único: [MARCAR LISTO]
- Confirmación
- Notificación automática a mesero

## Lo que NO entra en el MVP

### No incluir
- App móvil nativa (solo web responsive)
- Pago online
- Facturación electrónica
- Integración bancaria
- Contabilidad
- Inventario avanzado (stock numérico)
- Reservaciones
- Delivery
- Programa de puntos/fidelización
- IA/Recomendaciones
- Marketing avanzado
- Integración con POS
- Reportes empresariales
- Multidioma (solo español)
- Chat de soporte (solo email)
- Impresora de cocina (KDS)
- Notificaciones push
- División de cuenta
- Propinas
- Análisis predictivo

### Justificación
Estas funciones pueden añadirse después. El MVP debe ser lo más pequeño posible que valide el problema y permita vender.

## Criterios de Éxito del MVP

El MVP funciona si:

1. ✅ Un restaurante puede registrarse sin nuestra ayuda
2. ✅ Puede crear productos sin confundirse
3. ✅ Puede generar QR sin ayuda técnica
4. ✅ Un cliente escanea QR y lo entiende al instante
5. ✅ Cliente puede hacer pedido sin preguntar cómo
6. ✅ Restaurante recibe el pedido
7. ✅ Restaurante puede actualizar su carta fácilmente
8. ✅ Mesero puede aceptar/rechazar sin confusión
9. ✅ Cocina recibe pedido y entiende qué preparar
10. ✅ Cliente ve estado actualizado en tiempo real
11. ✅ **El restaurante está dispuesto a pagar**

El punto 11 es el más importante.

## Métricas a Medir

### Para el Cliente
- Tiempo para hacer primer pedido
- Tasa de completación de pedido
- Errores cometidos
- Satisfacción (escala 1-5)

### Para el Restaurante
- Tiempo para crear primer producto
- Tiempo para generar QR
- Número de pedidos por día
- Número de rechazos
- Tiempo promedio de preparación
- Disposición a pagar

### Para la Plataforma
- Restaurantes registrados
- Restaurantes activos
- Pedidos totales
- Tasa de retención
- Número de mesas activas
- Revenue

## Fases de Construcción

### Fase 1: Backend
- Autenticación y seguridad
- Base de datos multi-restaurante
- API REST
- Sistema de estados

### Fase 2: Cliente (Frontend)
- Interfaz QR + Carta
- Flujo de pedido
- Actualización en tiempo real (WebSocket)
- Mobile-first responsivo

### Fase 3: Panel Restaurante
- Dashboard
- Gestión de productos
- Gestión de mesas
- Recepción de pedidos

### Fase 4: Cocina
- Interfaz minimalista
- Visualización de pedidos
- Marcar listo

### Fase 5: Integración y Pruebas
- Tests
- Seguridad
- Performance
- UX testing

## Tiempo Estimado

- Backend + Base de datos: 3-4 semanas
- Cliente: 3-4 semanas
- Panel: 3-4 semanas
- Cocina: 1-2 semanas
- Tests e integración: 2-3 semanas

**Total**: 12-17 semanas (3-4 meses)

## Tecnología Recomendada (Futuro)

Backend:
- Node.js + Express o Python + Django
- PostgreSQL (relacional)
- WebSocket (actualizaciones en tiempo real)

Frontend:
- React o Vue.js
- Tailwind CSS
- Mobile-first

Infraestructura:
- Docker + Kubernetes (escalable)
- AWS o similar

## Conexiones en el Wiki

- [[Proyecto QR - Visión General]] — Visión general que fundamenta el MVP
- [[Flujos Operativos del MVP]] — Flujos implementados en el MVP
- [[Reglas de Negocio MVP]] — Reglas que se implementan en MVP
- [[Mapa de Pantallas - General]] — Las 38 pantallas del MVP
- [[Arquitectura Técnica MVP]] — Cómo se implementa tecnológicamente
- [[Análisis: Problema vs Solución]] — Qué problemas resuelve este MVP

**Fuente Original**: Ver [[Fuentes Originales]] → Documento 1

---

**Fuentes**: PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md
