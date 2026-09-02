---
title: "Índice de Búsqueda - Guía Exhaustiva"
type: "reference"
created: "2026-09-01"
updated: "2026-09-01"
---

# 📖 Índice de Búsqueda EXHAUSTIVO

**CUANDO LA IA NO SEPA ALGO, BUSCAR AQUÍ PRIMERO**

Formato: `TÉRMINO → DOCUMENTO.md | Sección | Descripción corta`

---

## TERMS A-Z (Completamente Exhaustivo)

### A

**Aceptar Pedido** → ROLES_FLUJO.md | Sección 5, 14 | Mesero acepta PENDING → ACCEPTED
**Administrador (Rol)** → PROYECTO_SISTEMA.md | Sección 62 | 5º rol: administra restaurante completo
**Admin Dashboard** → FASES_UX.md | Sección 3 | Muestra resumen, pedidos, solicitudes
**Agotado (Producto)** → PROYECTO_SISTEMA.md | Sección 20 | Producto OUT_OF_STOCK, no aparece
**API REST** → FASES_UX.md | Sección 35 | Backend comunicación
**Apariencia** → FASES_UX.md | Sección 11 | Configuración: colores, logo
**Aplicaciones** → FASES_UX.md | Sección 38 | Solo web, no apps nativas
**Archivos Wireframe** → WIREFRAMES_CLIENTE.md, WIREFRAMES_MESERO.md, WIREFRAMES_COCINA.md | Todos | Especificación UX completa
**Arquitectura Conceptual** → FASES_UX.md | Sección 36 | Diagrama cliente-mesero-cocina-admin → Next.js → Supabase
**Arquitectura Técnica** → FASES_UX.md | Sección 35-37 | Stack: Next.js, Supabase, PostgreSQL, Vercel
**Auditoría** → FASES_UX.md | Sección 32 | Registra: usuario, acción, timestamp, metadata
**Autenticación** → FASES_UX.md | Sección 35 | Supabase Auth para staff (Client sin auth)

---

### B

**Base de Datos Modelo** → FASES_UX.md | Sección 33 | 10 tablas: restaurants, users, orders, products, etc.
**Botón [+] Rápido** → MAPA_PANTALLAS.md | Sección 5 | Agregar producto directamente sin detalle
**Botón Carrito** → MAPA_PANTALLAS.md | Sección 5 | Flotante, siempre visible
**Botones Estado** → MAPA_PANTALLAS.md | Sección 48 | "Enviando...", "Guardando...", estados de carga

---

### C

**Cambio de Precio** → FASES_UX.md | Sección 26 | Validación al confirmar pedido
**Cancelación de Pedido** → ROLES_FLUJO.md | Sección 30 | Solo PENDING puede cancelarse
**Cancelaciones** → PROYECTO_SISTEMA.md | Sección 30 | Si cliente se equivoca
**Carrito (Pantalla)** → MAPA_PANTALLAS.md | Sección 9 | Revisar productos, total, botón continuar
**Categorías** → PROYECTO_SISTEMA.md | Sección 21 | Entradas, Platos, Bebidas, etc.
**Categoría (Pantalla)** → MAPA_PANTALLAS.md | Sección 6 | Listar productos de una categoría
**Ciclo Completo Pedido** → PROYECTO_SISTEMA.md | Sección 58 | Cliente → Mesero → Cocina → Mesero → Cliente
**Cliente (Definición)** → PROYECTO_SISTEMA.md | Sección 5 | Escanea QR, no login, sin instalación
**Cliente (Pantallas)** → MAPA_PANTALLAS.md | Secciones 3-17 | 11 pantallas totales
**Cliente (Wireframes)** → WIREFRAMES_CLIENTE.md | Todas | Mobile first, sin login
**Cocina (Definición)** → PROYECTO_SISTEMA.md | Sección 5 | Solo prepara, NO acepta/rechaza
**Cocina (Interfaz)** → PROYECTO_SISTEMA.md | Sección 37 | Ultra minimalista: #pedido, mesa, productos
**Cocina (Pantallas)** → MAPA_PANTALLAS.md | Secciones 28-31 | 5 pantallas: login, panel, preparar, listo
**Cocina (Wireframes)** → WIREFRAMES_COCINA.md | Todas | Diseño minimalista
**Colores Estado Mesas** → PROYECTO_SISTEMA.md | Sección 18 | 🟢 verde, 🟡 amarillo, 🔵 azul, 🔴 rojo, ⚫ negro
**Comparación Usuarios** → PROYECTO_SISTEMA.md | Sección 65-66 | Cliente: bonito/rápido | Admin: info/control
**Concurrencia (Doble Aceptación)** → FASES_UX.md | Sección 27 | Mesero A acepta, Mesero B error
**Confirmación Pedido** → MAPA_PANTALLAS.md | Sección 10 | "¿Confirmar para Mesa X?"
**Configuración Restaurante** → FASES_UX.md | Sección 11 | Nombre, descripción, horario, contacto
**Conexión Perdida** → PROYECTO_SISTEMA.md | Sección 35 | Mensaje claro, no error técnico
**Considerar Realtime** → FASES_UX.md | Sección 37 | WebSocket actualiza pedidos en tiempo real
**Crítica: Mesero es Filtro** → ROLES_FLUJO.md | Sección 18 | PEDIDO NUNCA va directo a COCINA sin MESERO

---

### D

**Dashboard Admin** → FASES_UX.md | Sección 3 | Pedidos hoy, mesas ocupadas, solicitudes
**Dashboard Mesero** → MAPA_PANTALLAS.md | Sección 20 | Pedidos nuevos, solicitudes, mesas
**Datos Históricos** → FASES_UX.md | Sección 25 | Snapshot: guardar nombre y precio en moment o de pedido
**Decisión Arquitectura** → FASES_UX.md | Sección 33 | Usar Next.js + Supabase
**Demo Comercial** → FASES_UX.md | Sección 43 | 1 restaurante, 10 mesas, productos con fotos
**Demostración Ideal** → FASES_UX.md | Sección 43 | Cliente pide → Mesero acepta → Cocina prepara → Listo
**Descripción Producto** → PROYECTO_SISTEMA.md | Sección 9 | Ingredientes, sabor, etc.
**Detalle Producto** → MAPA_PANTALLAS.md | Sección 7 | Foto, precio, tamaño, extras, sin cebolla, observaciones
**Diferencia Pedido vs Llamada** → ROLES_FLUJO.md | Sección 9 | Pedido → Cocina | Llamada → solo Mesero

---

### E

**Empleados** → FASES_UX.md | Sección 9 | OWNER, ADMIN, WAITER, KITCHEN
**Empleados (Gestión)** → MAPA_PANTALLAS.md | Secciones 39-40 | Crear, editar, asignar roles
**En Preparación** → ROLES_FLUJO.md | Sección 5 | Estado: Cocina está preparando
**Entrada QR** → MAPA_PANTALLAS.md | Sección 3 | Pantalla 1: validar restaurante + mesa
**Entrada QR (Wireframe)** → WIREFRAMES_CLIENTE.md | Pantalla 01 | Logo, nombre, mesa, cargando
**Errores Casos Específicos** → FASES_UX.md | Sección 42 | QR inválido, mesa desactivada, producto eliminado, precio cambió
**Errores Globales** → MAPA_PANTALLAS.md | Sección 47 | Conexión, página no encontrada, sesión expirada, sin permisos
**Estados Carrito** → PROYECTO_SISTEMA.md | Sección 9 | Cantidad, total actualizado, puedo agregar más
**Estados Carga** → MAPA_PANTALLAS.md | Sección 48 | "Cargando carta...", "Enviando pedido...", skeletons
**Estados Mesas** → PROYECTO_SISTEMA.md | Sección 18 | 🟢 Disponible, 🟡 Ocupada, 🔵 Pedido, 🔴 Atención, ⚫ Cuenta
**Estados Pedido** → ROLES_FLUJO.md | Sección 5 | PENDING, ACCEPTED, PREPARING, READY, DELIVERED, REJECTED, CANCELLED
**Estados Producto** → FASES_UX.md | Sección 25 | ACTIVE, OUT_OF_STOCK, INACTIVE
**Estados Vacíos** → MAPA_PANTALLAS.md | Sección 49 | "NO HAY PEDIDOS - Cuando recibas...", "Todo tranquilo"
**Estrategia Validación** → FASES_UX.md | Sección 45 | Demo → 3-5 restaurantes → Uso real → Feedback → Mejoras
**Experiencia Cliente** → PROYECTO_SISTEMA.md | Sección 6 | Sin login, sin instalación, escanea QR

---

### F

**Fase 0** → PROYECTO_SISTEMA.md | Sección 50 | Validación con restaurantes reales
**Fase 1** → PROYECTO_SISTEMA.md | Sección 51 | Demo comercial con restaurante ficticio
**Fase 2** → PROYECTO_SISTEMA.md | Sección 52 | MVP: versión utilizable
**Fase 3** → PROYECTO_SISTEMA.md | Sección 53 | 3-5 primeros restaurantes como laboratorio
**Fase 4** → PROYECTO_SISTEMA.md | Sección 54 | Mejorar diseño, velocidad, notificaciones
**Fase 5** → PROYECTO_SISTEMA.md | Sección 55 | Venta formal, WhatsApp, Instagram
**Fase 6** → PROYECTO_SISTEMA.md | Sección 56 | Cocina, estadísticas, promociones
**Fase 7** → PROYECTO_SISTEMA.md | Sección 57 | Plataforma completa: QR + Carta + Pedidos + Cocina + Pagos + Clientes
**Fidelización** → PROYECTO_SISTEMA.md | Sección 41 | Futuro: puntos, descuentos, cupones
**Flujo A (Pedido Digital)** → ROLES_FLUJO.md | Secciones 4, 17 | Cliente → Mesero → Cocina → Mesero → Cliente
**Flujo B (Llamada Mesero)** → ROLES_FLUJO.md | Sección 17 | Cliente → Mesero (sin cocina)
**Flujo C (Solicitud Cuenta)** → ROLES_FLUJO.md | Sección 17 | Cliente → Mesero → Llevar cuenta
**Flujos Operativos** → ROLES_FLUJO.md | Sección 17 | 3 flujos principales
**Fotos Productos** → PROYECTO_SISTEMA.md | Sección 33 | Importante: foto uniforme, tamaño recomendado
**Formulario Crear Producto** → FASES_UX.md | Sección 5 | Nombre, descripción, precio, categoría, imagen, disponible

---

### G

**Gestión Mesas** → MAPA_PANTALLAS.md | Secciones 26-27 | Crear, editar, ver QR, descargar, imprimir
**Gestión QR** → MAPA_PANTALLAS.md | Sección 38 | Descargar, imprimir, generar batch
**GitHub** → FASES_UX.md | Sección 35 | Control de versiones

---

### H

**Horario** → PROYECTO_SISTEMA.md | Sección 35 | Si restaurante está cerrado, mostrar horario
**Horarios Abierto/Cierre** → FASES_UX.md | Sección 30 | Comportamiento si cerrado: mostrar carta, desactivar pedidos

---

### I

**Icono Estado Mesas** → PROYECTO_SISTEMA.md | Sección 18 | 🟢🟡🔵🔴⚫
**Idioma** → PROYECTO_SISTEMA.md | Sección 43 | Futuro: Español, Inglés (no MVP)
**Índice de Búsqueda** → THIS FILE | Búsqueda rápida de términos
**Índices BD** → FASES_UX.md | Sección 33 | orders(restaurant_id, status), products(category_id), etc.
**Información Crítica** → ROLES_FLUJO.md | Sección 18 | 10 reglas fundamentales
**Integraciones** → PROYECTO_SISTEMA.md | Sección 49 | No en MVP: POS, facturación, etc.
**Interfaz Cocina** → PROYECTO_SISTEMA.md | Sección 37 | Ejemplo: #128, Mesa 7, 2 hamburguesas, nota

---

### J

(Sin términos con J)

---

### K

**Kitchen Display System** → PROYECTO_SISTEMA.md | Sección 37 | KDS, futuro para cocina (no MVP)

---

### L

**Lint del Wiki** → INDICA CUANDO HAY GAPS | Buscar contradiciones, orphans, missing cross-references
**Listo (Estado)** → ROLES_FLUJO.md | Sección 5 | Cocina marca LISTO, mesero notificado
**Login** → MAPA_PANTALLAS.md | Sección 19, 449 | Email + contraseña para staff
**Logo** → PROYECTO_SISTEMA.md | Sección 23 | Sube logo del restaurante

---

### M

**Mapa Pantallas General** → MAPA_PANTALLAS.md | Completo | Arquitectura 38 pantallas
**Máximo Pedido que se puede Hacer** → NO LIMITADO | Cliente puede pedir múltiples productos
**Medidas Mesa** → PROYECTO_SISTEMA.md | Sección 17 | Mesa: número, estado, QR, datos simples
**Mejora Continua** → PROYECTO_SISTEMA.md | Sección 70 | Objetivo: restaurantes pagando y usando
**Menú Digital** → VER: Carta (Pantalla)
**Mesero (Definición)** → PROYECTO_SISTEMA.md | Sección 5 | Recibe pedidos, acepta/rechaza, atiende
**Mesero (Pantallas)** → MAPA_PANTALLAS.md | Secciones 18-27 | 10 pantallas
**Mesero (Responsabilidad)** → ROLES_FLUJO.md | Sección 6 | Ver pedidos, aceptar/rechazar, entregar
**Mesero (Wireframes)** → WIREFRAMES_MESERO.md | Todas | Dashboard, pedidos, solicitudes
**Mesa Desactivada** → MAPA_PANTALLAS.md | Sección 3 | Cliente ve: "No disponible"
**Modelo Comercial** → PROYECTO_SISTEMA.md | Secciones 45-46 | Plan Básico, Pro, Avanzado; inicialmente 1 plan
**Modelo de Datos** → FASES_UX.md | Sección 33 | 10 tablas relacionadas
**Modificables (Productos)** → PROYECTO_SISTEMA.md | Sección 31 | Tamaño, extras, ingredientes
**Motivos Rechazo** → MAPA_PANTALLAS.md | Sección 23 | Producto agotado, problema, restaurante no puede, otro
**Multi-restaurante** → PROYECTO_SISTEMA.md | Sección 44 | Plataforma soporta múltiples restaurantes
**Multitenant** → FASES_UX.md | Sección 31 | Cada restaurante aislado, restaurant_id en todas las tablas

---

### N

**Navegación Cliente** → PROYECTO_SISTEMA.md | Sección 8 | Carta → Categorías → Productos
**Navegación Cocina** → MAPA_PANTALLAS.md | Sección 45 | Pendientes → En prep → Listos (simple)
**Navegación Mesero** → MAPA_PANTALLAS.md | Sección 44 | Dashboard → Pedidos → Solicitudes → Mesas
**No Pedir en Carrito** → FASES_UX.md | Sección 26 | Si producto eliminado/agotado/precio cambió: error
**Notificación Pedido Listo** → ROLES_FLUJO.md | Sección 16 | Mesero ve: "Pedido #125 de Mesa 7 LISTO"
**Notificación Solicitud** → ROLES_FLUJO.md | Sección 7 | Mesero ve: "Mesa X solicita atención"
**Notificaciones Realtime** → FASES_UX.md | Sección 37 | WebSocket notifica cambios instantáneamente

---

### O

**Objetivo del Proyecto** → PROYECTO_SISTEMA.md | Sección 70 | Conseguir restaurantes pagando
**Obsidian** → VER: Wiki Setup
**Opiniones Clientes** → PROYECTO_SISTEMA.md | Sección 42 | Futuro: ★★★★★
**Orden de Desarrollo** → FASES_UX.md | Sección 40 | 7 Sprints: Infraestructura → Admin → Cliente → Pedidos → Mesero → Cocina → Integración
**Orden Visual** → PROYECTO_SISTEMA.md | Sección 23 | Diseño profesional, visual, claro

---

### P

**Página Inexistente** → MAPA_PANTALLAS.md | Sección 47 | "Página no encontrada. [VOLVER]"
**Pantalla Carrito** → MAPA_PANTALLAS.md | Sección 9 | Mi Pedido, Mesa X, subtotal, continuar
**Pantalla Carta** → MAPA_PANTALLAS.md | Sección 4 | Principal, logo, nombre, búsqueda, categorías, productos
**Pantalla Categoría** → MAPA_PANTALLAS.md | Sección 6 | Nombre, productos card
**Pantalla Cocina** → MAPA_PANTALLAS.md | Sección 28 | Nuevos pedidos, en prep, listos
**Pantalla Confirmación** → MAPA_PANTALLAS.md | Sección 10 | ¿Confirmar para Mesa X?
**Pantalla Detalle Producto** → MAPA_PANTALLAS.md | Sección 7 | Foto grande, info, tamaño, extras, sin ingredientes, notas, cantidad
**Pantalla Entrada QR** → MAPA_PANTALLAS.md | Sección 3 | Logo, nombre restaurante, mesa, cargando
**Pantalla Estado Pedido** → MAPA_PANTALLAS.md | Sección 12 | ✓✓●○○ progreso del pedido
**Pantalla Llamar Mesero** → MAPA_PANTALLAS.md | Sección 14 | ¿Necesitas ayuda? [CONFIRMAR][CANCELAR]
**Pantalla Pedido Rechazado** → MAPA_PANTALLAS.md | Sección 13 | "No aceptado. Motivo: X"
**Pantalla Pedido Enviado** → MAPA_PANTALLAS.md | Sección 11 | ✓ #128, Mesa 07, [VER ESTADO][VOLVER CARTA]
**Pantalla Solicitar Cuenta** → MAPA_PANTALLAS.md | Sección 17 | 💳 ¿Solicitar cuenta? [SOLICITAR][CANCELAR]
**Pantallas Admin** → MAPA_PANTALLAS.md | Secciones 32-41 | 12 pantallas (login, dashboard, productos, etc.)
**Pantallas Cliente** → MAPA_PANTALLAS.md | Secciones 3-17 | 11 pantallas (entrada, carta, categoría, producto, etc.)
**Pantallas Cocina** → MAPA_PANTALLAS.md | Secciones 28-31 | 5 pantallas (login, panel, pedido, prep, listo)
**Pantallas Mesero** → MAPA_PANTALLAS.md | Secciones 18-27 | 10 pantallas (login, dashboard, pedidos, etc.)
**Pantallas Total** → MAPA_PANTALLAS.md | Sección 50 | 38 pantallas en total MVP
**Pedido** → ROLES_FLUJO.md | Sección 4 | Cliente selecciona productos → Envía → Mesero procesa
**Pedido Aceptado** → ROLES_FLUJO.md | Sección 5, 14 | ACCEPTED, va a cocina
**Pedido Duplicado** → FASES_UX.md | Sección 28 | Botón se deshabilita después de primer clic
**Pedido Enviado** → MAPA_PANTALLAS.md | Sección 11 | Confirmación con número #XXX
**Pedido Listo** → ROLES_FLUJO.md | Sección 16 | READY, mesero notificado para entregar
**Pedido Pendiente** → ROLES_FLUJO.md | Sección 5 | PENDING, solo ve mesero
**Pedido Rechazado** → ROLES_FLUJO.md | Sección 5, 13 | REJECTED, cliente ve motivo
**Pedidos Históricos** → FASES_UX.md | Sección 25 | Guardar snapshot de nombre y precio
**Permisos por Rol** → FASES_UX.md | Sección 18 | Matrix: quién puede qué
**Personalización Restaurante** → FASES_UX.md | Sección 12, PROYECTO_SISTEMA.md | Sección 23 | Logo, colores, descripción
**Filosofía Proyecto** → PROYECTO_SISTEMA.md | Sección 69 | 5 principios: Sencillez, Rapidez, Diseño, Flexibilidad, Evolución
**Portabilidad** → PROYECTO_SISTEMA.md | Sección 25 | No obligar cliente a instalación
**Potencial Ingresos** → PROYECTO_SISTEMA.md | Sección 33 | Vender diseño, impresión QR además
**Precio Cambio** → PROYECTO_SISTEMA.md | Sección 35 | Validación al confirmar
**Precio de Producto** → PROYECTO_SISTEMA.md | Sección 9 | Mostrar en carta
**Primeros Restaurantes** → PROYECTO_SISTEMA.md | Sección 53 | 3-5 como laboratorio
**Problema Central** → PROYECTO_SISTEMA.md | Sección 2 | Procesos manuales, cartas desactualizadas, errores
**Problema Cliente** → PROYECTO_SISTEMA.md | Sección 2 | Espera, no encuentra, no sabe ingredientes, sin fotos
**Problema Restaurante** → PROYECTO_SISTEMA.md | Sección 2 | Meseros ocupados, errores, agotados en carta, precios desactualizados
**Problema: Pedido No Respondido** → PROYECTO_SISTEMA.md | Sección 36 | Mostrar tiempo transcurrido
**Producción Pura** → PROYECTO_SISTEMA.md | Sección 37 | Cocina sin distracciones
**Productos (Gestión)** → FASES_UX.md | Secciones 4-5 | Crear, editar, activar, desactivar, cambiar precio
**Productos Agotados** → PROYECTO_SISTEMA.md | Sección 20 | OUT_OF_STOCK, no aparecen en carta
**Productos Disponibilidad** → MAPA_PANTALLAS.md | Sección 5 | Mostrar ✅ o ❌
**Productos Fotografías** → PROYECTO_SISTEMA.md | Sección 33 | Formato uniforme, recorte automático
**Programa de Puntos** → PROYECTO_SISTEMA.md | Sección 41 | Futuro, no MVP
**Promociones** → PROYECTO_SISTEMA.md | Sección 32 | Futuro: descuentos, combos (no MVP)
**Propuesta de Valor Cliente** → PROYECTO_SISTEMA.md | Sección 4 | "Escanea, mira, pide y solicita atención"
**Propuesta de Valor Restaurante** → PROYECTO_SISTEMA.md | Sección 4 | "Más rapidez, menos errores, carta actualizable"
**Protección Doble Clic** → FASES_UX.md | Sección 28 | Botón deshabilitado temporalmente
**Prueba Principal MVP** → FASES_UX.md | Sección 41 | Flujo completo: crear restaurante → cliente pide → mesero acepta → cocina prepara → listo
**Pruebas de Errores** → FASES_UX.md | Sección 42 | 15 casos a validar

---

### Q

**QR** → PROYECTO_SISTEMA.md | Sección 26 | Identifica restaurante + mesa
**QR Compartido** → PROYECTO_SISTEMA.md | Sección 27 | Posible, no rompe sistema
**QR Doble Escaneo** → PROYECTO_SISTEMA.md | Sección 28 | 2 clientes misma mesa OK
**QR Físico** → PROYECTO_SISTEMA.md | Sección 34 | Vender: QR impreso para cada mesa
**QR Inválido** → MAPA_PANTALLAS.md | Sección 3 | Cliente ve: "No válido"

---

### R

**Razón Rechazo** → MAPA_PANTALLAS.md | Sección 23 | Motivo debe registrarse en auditoría
**Realtime WebSocket** → FASES_UX.md | Sección 37 | Actualiza pedidos instantáneamente
**Rechazar Pedido** → ROLES_FLUJO.md | Sección 5, 23 | Mesero rechaza con motivo
**Recuperación Contraseña** → MAPA_PANTALLAS.md | Sección 19 | Link de recuperación
**Red de Conexiones** → Index | ~50+ referencias cruzadas
**Regla: Mesero es Filtro** → ROLES_FLUJO.md | Sección 18 | NUNCA cliente → cocina directo
**Reglas Fundamentales** → ROLES_FLUJO.md | Sección 18 | 10 reglas operativas críticas
**Reglas de Negocio** → FASES_UX.md | Sección 26-32 | 26 validaciones y restricciones
**Reglas Multi-Tenant** → FASES_UX.md | Sección 31 | Cada restaurante aislado completamente
**Reglas Operativas** → ROLES_FLUJO.md | Sección 18 | 10 reglas escritas explícitamente
**Reservaciones** → PROYECTO_SISTEMA.md | Sección 49 | No en MVP
**Restaurante Cerrado** → PROYECTO_SISTEMA.md | Sección 35 | Mostrar horario
**Restaurante Configuración** → FASES_UX.md | Sección 11 | Nombre, descripción, horarios, contacto, redes
**Restaurante Creación** → FASES_UX.md | Sección 41 | Paso 1: crear restaurante
**Restaurante (Multi)** → PROYECTO_SISTEMA.md | Sección 44 | Plataforma multi-restaurante
**Restaurante Propios Datos** → FASES_UX.md | Sección 31 | Aislados, no comparten
**Riesgos Identificados** → PROYECTO_SISTEMA.md | Secciones 65-66 | 6 riesgos y mitigaciones
**RLS (Row Level Security)** → FASES_UX.md | Sección 31 | PostgreSQL RLS para seguridad multi-tenant
**Roadmap** → PROYECTO_SISTEMA.md | Sección 71 | 10 etapas ETAPA 0-10
**Roles Admin** → FASES_UX.md | Sección 10 | OWNER, ADMIN, WAITER, KITCHEN

---

### S

**Secciones Wiki** → Ver [[Index]]
**Seguridad Multi-Tenant** → FASES_UX.md | Sección 31 | Validar restaurant_id en todo
**Sesión Expirada** → MAPA_PANTALLAS.md | Sección 47 | "[INICIAR SESIÓN]"
**Sidebars/Navigation** → WIREFRAMES_* | Todas | Estructura nav por rol
**Sin Cebolla** → PROYECTO_SISTEMA.md | Sección 9 | Ejemplo observación especial
**Sin Ingredientes** → MAPA_PANTALLAS.md | Sección 7 | Checkboxes para remover
**Sin Permisos** → MAPA_PANTALLAS.md | Sección 47 | "No tienes permiso..."
**Sin Registro** → PROYECTO_SISTEMA.md | Sección 25 | Cliente accede sin crear cuenta
**Sistema Completo** → PROYECTO_SISTEMA.md | Sección 57, 72 | QR + Carta + Pedidos + Cocina + Cuenta + Pagos + Clientes + Fidelización
**Sistema Punto** → PROYECTO_SISTEMA.md | Sección 41 | Futuro: puntos y descuentos
**Snapshot Producto** → FASES_UX.md | Sección 25 | Guardar nombre y precio en order_items
**Snapshot Precio** → FASES_UX.md | Sección 25 | No cambia si edita producto después
**Solicitud de Atención** → ROLES_FLUJO.md | Sección 7 | Independent de pedidos
**Solicitud de Cuenta** → MAPA_PANTALLAS.md | Sección 17 | Flujo C, mesero lleva cuenta
**Solicitud Duplicada** → FASES_UX.md | Sección 29 | "Ya existe solicitud pendiente"
**Solicitud Pendiente** → ROLES_FLUJO.md | Sección 7 | Mesa solicita, mesero debe atender
**Solicitudes Tipos** → FASES_UX.md | Sección 23 | MVP: WAITER, BILL | Futuro: CUTLERY, DRINK, HELP
**Solución al Problema** → PROYECTO_SISTEMA.md | Sección 3 | Conexión digital cliente-resto-mesero-cocina
**Sonido Cocina** → PROYECTO_SISTEMA.md | Sección 54 | Futuro, no MVP
**Soportar Cambios Futuros** → PROYECTO_SISTEMA.md | Sección 25 | Arquitectura flexible para evolucionar
**Sprint 1 (Infraestructura)** → FASES_UX.md | Sección 40 | GitHub, Supabase, BD, Auth, Roles
**Sprint 2 (Administrador)** → FASES_UX.md | Sección 40 | Productos, Categorías, Mesas, QR, Config
**Sprint 3 (Cliente)** → FASES_UX.md | Sección 40 | QR, Carta, Categoría, Producto, Carrito
**Sprint 4 (Pedidos)** → FASES_UX.md | Sección 40 | Carrito, Confirmación, Pedido, Estado
**Sprint 5 (Mesero)** → FASES_UX.md | Sección 40 | Dashboard, Pedidos, Aceptar/Rechazar, Solicitudes, Mesas
**Sprint 6 (Cocina)** → FASES_UX.md | Sección 40 | Pedidos aceptados, Preparar, Listo
**Sprint 7 (Integración)** → FASES_UX.md | Sección 40 | Cliente → Mesero → Cocina → Mesero → Cliente
**Stack Tecnológico** → FASES_UX.md | Sección 35 | Next.js, TypeScript, Tailwind, Supabase, PostgreSQL, Vercel
**Story Uso Completo** → PROYECTO_SISTEMA.md | Sección 68 | Juan escanea QR, ve carta, pide, mesero lleva...
**Supabase** → FASES_UX.md | Sección 35 | Backend completo: PostgreSQL + Auth + Storage + Realtime
**Supabase Auth** → FASES_UX.md | Sección 35 | Autenticación para staff
**Supabase Realtime** → FASES_UX.md | Sección 37 | WebSocket para actualizaciones vivas
**Supabase Storage** → FASES_UX.md | Sección 35 | Guardar fotos productos

---

### T

**Tabla audit_logs** → FASES_UX.md | Sección 33 | Registra: usuario, acción, entity, timestamp
**Tabla categories** → FASES_UX.md | Sección 33 | Organiza productos
**Tabla order_items** → FASES_UX.md | Sección 33 | Snapshot de producto + cantidad
**Tabla orders** → FASES_UX.md | Sección 33 | Pedido: mesa, estado, total, timestamps
**Tabla product_options** → FASES_UX.md | Sección 33 | Variantes y extras
**Tabla products** → FASES_UX.md | Sección 33 | Productos: nombre, precio, foto, disponible
**Tabla restaurant_members** → FASES_UX.md | Sección 33 | Usuarios por restaurante + rol
**Tabla restaurants** → FASES_UX.md | Sección 33 | Nombre, logo, descripción, horarios
**Tabla tables** → FASES_UX.md | Sección 33 | Mesa: número, QR token, estado
**Tabla users** → FASES_UX.md | Sección 33 | Nombre, email
**Tabla waiter_calls** → FASES_UX.md | Sección 33 | Solicitudes: tipo, estado, manejado por
**Tailwind CSS** → FASES_UX.md | Sección 35 | UI utilities
**Tamaño Pizza** → PROYECTO_SISTEMA.md | Sección 31 | Ejemplo producto modificable
**Tecnología Stack** → FASES_UX.md | Sección 35 | Decisión arquitectura
**Teléfono Cliente** → PROYECTO_SISTEMA.md | Sección 24 | iPhone, Android, pantallas pequeñas
**Tiempo Estimado de Preparación** → PROYECTO_SISTEMA.md | Sección 12, 36 | Futuro: "Aprox. 15 min"
**Tiempo Respuesta** → NO DOCUMENTADO | Buscar en raw si es crítico
**Tiempo Transcurrido** → PROYECTO_SISTEMA.md | Sección 36 | Mostrar "Hace 4:23 minutos"
**Tipos Solicitud** → FASES_UX.md | Sección 23 | WAITER, BILL, CUTLERY, DRINK, HELP, OTHER
**Tipografía** → PROYECTO_SISTEMA.md | Sección 23 | Futuro: definir en design system
**Toast Notificaciones** → MAPA_PANTALLAS.md | Sección 48 | Estados de UI
**Tomadores de Decisión** → VER: Roles del Sistema
**Total Pedido** → MAPA_PANTALLAS.md | Sección 9 | Mostrar suma de productos
**Transacciones** → NO LIMITADO EN MVP | Single transaction OK por pedido
**TypeScript** → FASES_UX.md | Sección 35 | Tipado frontend

---

### U

**UI Components** → FASES_UX.md | Sección 35 | shadcn/ui pre-built
**UI Design System** → FASES_UX.md | Sección 47 | Próxima fase: definir colores, tipografía, componentes
**Usuarios del Sistema** → PROYECTO_SISTEMA.md | Sección 5 | 5 roles: Cliente, Mesero, Cocina, Admin, Superadmin
**UX Wireframes** → WIREFRAMES_*.md | Todas | 38 pantallas diseñadas

---

### V

**Validación Basado en Estado** → FASES_UX.md | Sección 26 | Pedido PENDING antes de procesar
**Validación Disponibilidad** → FASES_UX.md | Sección 26 | Producto debe estar ACTIVE
**Validación Precio** → FASES_UX.md | Sección 26 | Verificar precio al confirmar
**Validaciones Críticas** → FASES_UX.md | Sección 26 | 5 validaciones listadas
**Validar Restaurant_id** → FASES_UX.md | Sección 31 | Seguridad multi-tenant
**Variantes Producto** → PROYECTO_SISTEMA.md | Sección 31 | Tamaño, extras (futuro si se complejiza)
**Velocidad Interfaz** → PROYECTO_SISTEMA.md | Sección 23 | Rápida, sin demoras
**Versión Desktop** → WIREFRAMES_CLIENTE.md | Sección 2 | Secundaria, mobile es principal
**Versión Tablet** → PROYECTO_SISTEMA.md | Sección 24 | Responsive funciona
**Visibilidad Mesero** → PROYECTO_SISTEMA.md | Sección 18 | Estados visuales de mesas
**Visión Final** → PROYECTO_SISTEMA.md | Sección 72 | Flujo completo cliente-mesero-cocina-cliente
**Visión General** → PROYECTO_SISTEMA.md | Sección 1 | Transformar atención restaurante
**Vista Mesas** → MAPA_PANTALLAS.md | Secciones 26-27 | Grid visual: 🟢🟡🔵🔴⚫

---

### W

**Web Clipper** → PROYECTO_SISTEMA.md | Sección 23 | Extensión Obsidian para guardar artículos
**Wireframe Cliente** → WIREFRAMES_CLIENTE.md | Todas | 11 pantallas especificadas
**Wireframe Cocina** → WIREFRAMES_COCINA.md | Todas | 5 pantallas minimalistas
**Wireframe Mesero** → WIREFRAMES_MESERO.md | Todas | 10 pantallas
**Workflow Ingesta** → CLAUDE.md | Sección 2 | Cómo procesar nuevas fuentes

---

### X, Y, Z

(Sin términos)

---

## 🔴 CRÍTICOS (Memorizar)

| Concepto | Ubicación | POR QUÉ |
|----------|----------|--------|
| **Mesero = Filtro** | ROLES_FLUJO | Nunca Cliente → Cocina directo |
| **Mobile First** | WIREFRAMES_CLIENTE | Cliente usa smartphone |
| **Multi-Tenant** | FASES_UX Sección 31 | Restaurantes aislados |
| **3 Flujos** | ROLES_FLUJO Sección 17 | A, B, C operaciones |
| **7 Estados Pedido** | ROLES_FLUJO Sección 5 | PENDING, ACCEPTED, PREPARING, READY, etc. |
| **38 Pantallas** | MAPA_PANTALLAS | 11 cliente, 10 mesero, 5 cocina, 12 admin |
| **5 Roles** | PROYECTO_SISTEMA | Cliente, Mesero, Cocina, Admin, Superadmin |
| **Stack: Next.js + Supabase** | FASES_UX Sección 35 | Decisión arquitectura final |

---

## 📋 CÓMO USAR ESTE ÍNDICE

### Scenario 1: IA no sabe qué es X
```
→ Busca "X" en este índice
→ Lee: DOCUMENTO.md | Sección Y
→ Abre archivo en raw/assets/
→ Busca la sección
→ RESPUESTA ENCONTRADA
```

### Scenario 2: IA no sabe dónde buscar
```
→ Piensa en el concepto relacionado
→ Busca ese término aquí
→ Sigue pasos 1-4 arriba
```

### Scenario 3: Algo no está en el índice
```
⚠️ PROBABLEMENTE NO ESTÁ DOCUMENTADO
→ Asumir que es fuera de scope
→ Indicar al usuario que NO está en docs
```

---

**ÚLTIMA ACTUALIZACIÓN**: 2026-09-01  
**TÉRMINOS CUBIERTOS**: 200+  
**DOCUMENTOS INDEXADOS**: 7  
**SECCIONES MAPEADAS**: 100+

**Este índice ES la fuente de verdad para búsquedas. Si no está aquí, no está en raw/assets.**
