---
title: "Proyecto QR - Visión General"
type: "synthesis"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md"]
tags: ["proyecto", "qr", "restaurante", "vision"]
---

# Proyecto QR: Sistema Digital de Atención en Mesa

## Visión

Crear una **plataforma que permita a cualquier restaurante transformar su atención tradicional** mediante un QR colocado en cada mesa.

No es solo vender "un QR". Es construir un **SISTEMA DIGITAL DE ATENCIÓN EN MESA** donde el QR es la puerta de entrada.

## Problema Central

Muchos restaurantes dependen completamente de procesos manuales:
- Clientes esperan mesero para carta
- Meseros ocupados toman pedidos verbales
- Errores al tomar pedidos
- Cartas desactualizadas (costo de imprimir nuevas)
- Productos agotados que todavía aparecen en la carta
- Poca información sobre qué consumen los clientes

## La Solución

Crear una conexión digital entre **Cliente ↔ Restaurante ↔ Mesero ↔ Cocina**

### Cómo funciona

```
QR en mesa → Cliente escanea → Sin instalar nada → Ve carta digital → Puede pedir/llamar mesero
```

El cliente **no necesita crear cuenta** ni descargar aplicación. Solo escanea.

### Propuesta de Valor

#### Para el restaurante
"Más rapidez, menos errores y una carta que puedes actualizar cuando quieras."

#### Para el cliente
"Escanea, mira, pide y solicita atención desde tu mesa."

#### Diferencial
- Diseño moderno
- Extrema simplicidad
- Experiencia en mesa mejorada
- Facilidad de administración
- El cliente usa su propio teléfono (sin tablets)

## Experiencia Completa

### Cliente
1. Escanea QR → No necesita login
2. Ve menú con fotos, descripción, precios
3. Busca productos (por nombre o categoría)
4. Selecciona y configura (extras, opciones)
5. Crea carrito
6. Confirma pedido
7. Puede llamar al mesero directamente
8. Solicita cuenta

### Restaurante
1. Login al panel administrativo
2. Administra carta (productos, categorías, precios, fotos)
3. Administra mesas (crear, asignar QR)
4. Recibe pedidos en tiempo real
5. Recibe solicitudes de mesero
6. Consulta estado de pedidos
7. Controla productos disponibles (marcar como agotados)
8. Personaliza apariencia (logo, colores, descripción)

## Principios de Diseño

- **Sencillez**: Un restaurante pequeño debe poder utilizarla
- **Rapidez**: Cliente y restaurante no deben esperar
- **Diseño**: Debe verse profesional
- **Flexibilidad**: Cada restaurante debe poder adaptarla
- **Evolución**: Debe poder convertirse en plataforma más completa

## Arquitectura Conceptual

```
         CLIENTE
            │
            ▼
           QR
            │
            ▼
      CARTA DIGITAL
            │
       ┌────┴────┐
       ▼         ▼
    PEDIDO     MESERO
       │         │
       ▼         ▼
    COCINA    ATENCIÓN
       │
       ▼
  PEDIDO LISTO
       │
       ▼
     CLIENTE
       │
       ▼
     CUENTA
```

## MVP — Lo que se incluirá

### Cliente
- Escanear QR (identificación automática de restaurante y mesa)
- Ver carta
- Buscar productos
- Ver categorías
- Consultar detalles y fotografías
- Configurar opciones
- Crear carrito
- Enviar pedido
- Consultar estado
- Llamar al mesero
- Solicitar cuenta

### Restaurante
- Login
- Dashboard
- Administrar productos
- Administrar categorías
- Administrar mesas
- Recibir pedidos
- Recibir solicitudes
- Generar QR
- Configuración básica (nombre, descripción, logo, colores)

### Sistema
- Multi-restaurante (separación total de datos)
- Separación por mesa
- Estados de pedido claros
- Validaciones básicas
- Manejo de errores

## Lo que NO entra en MVP

- App móvil nativa
- Pago online
- Facturación
- Inventario avanzado
- Reservaciones
- Delivery
- Programa de puntos
- Marketing avanzado
- Integración con POS

Todas esas funciones pueden venir después.

## Modelo Comercial Inicial

Oferta inicial sencilla: **"Carta Digital QR"**

Incluye:
- Carta digital
- QR por mesa
- Fotos
- Productos ilimitados
- Actualización de precios
- Panel administrativo

Extensiones premium:
- Pedidos digitales
- Llamar mesero
- Gestión de mesas

## Fases del Proyecto

### FASE 0 — VALIDACIÓN
Hablar con restaurantes, mostrar maqueta, validar problema.

### FASE 1 — DEMO COMERCIAL
Demostración con restaurante ficticio.

### FASE 2 — MVP
Primera versión utilizable.

### FASE 3 — PRIMEROS RESTAURANTES
3–5 restaurantes como laboratorio real.

### FASE 4 — MEJORAR
Basado en experiencias reales.

### FASE 5 — VENTA FORMAL
Venta sistemática.

### FASE 6 — SISTEMA PRO
Cocina, estadísticas, promociones.

### FASE 7 — PLATAFORMA COMPLETA
Visión de largo plazo con todas las funcionalidades.

## Objetivo del Primer Año

**CONSEGUIR RESTAURANTES QUE PAGUEN Y UTILICEN EL PRODUCTO.**

No cantidad de funcionalidades, sino clientes reales usando y pagando.

## Error a Evitar

No debemos posicionarnos como: "Esta plataforma quita meseros."

Debemos decir: **"Ayudamos al mesero a concentrarse en atención y experiencia."**

El sistema reduce trabajo repetitivo pero mantiene la relación humana.

## Filosofía General

> Vender primero una solución sencilla, demostrar valor, escuchar al restaurante y convertir gradualmente esa solución en una plataforma completa.

## Conexiones en el Wiki

- [[Flujos Operativos del MVP]] — Cómo funciona operativamente cada rol
- [[Roles del Sistema]] — Quiénes son los actores (Cliente, Mesero, Cocina, Admin)
- [[MVP - Alcance y Especificaciones]] — Qué entra y qué no en el MVP
- [[Mapa de Pantallas - General]] — Todas las 38 pantallas del sistema
- [[Arquitectura Técnica MVP]] — Cómo se construye técnicamente
- [[Análisis: Problema vs Solución]] — Validación del problema y solución

**Fuente Original**: Ver [[Fuentes Originales]] → Documento 1

---

**Fuentes**: PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md
