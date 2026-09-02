---
title: "Análisis: Problema vs Solución"
type: "comparison"
created: "2026-09-01"
updated: "2026-09-01"
sources: ["PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md"]
tags: ["problema", "solucion", "comparacion", "validacion"]
---

# Análisis: Problema vs Solución

Este documento mapea cada problema identificado con la solución que proporciona el sistema QR.

## Problemas del Restaurante (Lado Operativo)

| Problema | Causa | Solución Propuesta | Cómo funciona |
|----------|-------|-------------------|----------------|
| **Meseros ocupados** | Toman pedidos verbales, anotan, comunican | QR permite cliente hacer pedido sin esperar | Cliente escanea, pide directamente, mesero gestiona aceptación |
| **Clientes esperando atención** | Falta de meseros para atender mesas | Sistema de llamada: cliente pulsa botón | Mesero ve solicitud inmediatamente con número de mesa |
| **Errores al tomar pedidos** | Comunicación verbal, anotación manual | Pedido digital, escrito, sin malinterpretaciones | Todo queda registrado digitalmente |
| **Pedidos mal entendidos** | Mesero escucha mal, confunde datos | Sistema registra exactamente qué pidió | Mesero ve pedido completo en pantalla antes de aceptar |
| **Productos agotados en carta** | Actualización lenta de cartas impresas | Actualización instantánea en panel | Dueño marca como "no disponible" → desaparece de app |
| **Dificultad actualizar precios** | Imprimir nuevas cartas es caro y lento | Cambios instantáneos | Dueño cambia precio → cliente ve precio actualizado |
| **Costo de imprimir cartas** | Nuevas ediciones constantemente | Carta digital permanente | Cero costos de impresión |
| **Dificultad controlar mesas** | No hay visibilidad del estado | Dashboard visual: 🟢 disponible, 🟡 ocupada, etc | Dueño ve estado en tiempo real |
| **Poca información sobre consumo** | Registros manuales, incompletos | Sistema registra cada pedido | Futuro: estadísticas automáticas |
| **Dependencia excesiva del personal** | Personal es cuello de botella | Sistema permite operación más autónoma | Mesero se concentra en atención, no en toma de pedidos |

## Problemas del Cliente (Lado de Experiencia)

| Problema | Causa | Solución Propuesta | Cómo funciona |
|----------|-------|-------------------|----------------|
| **Esperar para recibir carta** | Mesero debe traer, ocupado | Escanea QR, acceso inmediato | QR en mesa → abre app → ve carta al instante |
| **No encuentra fácilmente lo que busca** | Carta física desorganizada, pequeña | Búsqueda + categorías + filtrado | Buscar "hamburguesa" → muestra todas |
| **No conoce ingredientes** | Carta física con espacio limitado | Descripción completa en app | Cada producto: foto + descripción detallada |
| **Fotos inexistentes** | Caro fotografiar todo en carta física | Fotos digitales en cada producto | Galería de fotos en la app |
| **Debe llamar mesero para cosas simples** | Necesita atención para confirmar algo | App permite ver detalles sin mesero | Cliente explora, ve fotos, lee descripciones solo |
| **Espera para pedir otra cosa** | Mesero no disponible | Pide cuando quiera | Cliente pide cuando quiera sin esperar |
| **Dificultades para solicitar cuenta** | Debe buscar mesero | Botón "Solicitar cuenta" | Pulsa → mesero recibe notificación |
| **Sin confirmación visual de pedido** | Pedido verbal, no hay registro | Cliente ve "Pedido #XXX enviado" | Confirmación inmediata en pantalla |
| **Desconoce tiempo de espera** | Nadie informa | Futuro: tiempo estimado visible | Cliente ve "Aprox. 15 min" |

## Matriz de Validación: ¿El Sistema Resuelve?

```
Problema del Restaurante          Resuelto en MVP    Cómo
─────────────────────────────────────────────────────────────
Meseros ocupados                  ✅ Sí              QR + Pedido digital
Clientes esperando                ✅ Sí              Botón "Llamar mesero"
Errores de pedido                 ✅ Sí              Registro digital
Productos agotados en carta       ✅ Sí              Desactivar en panel
Dificultad actualizar precios     ✅ Sí              Panel en tiempo real
Costo de cartas                   ✅ Sí              Cero costos
Dificultad controlar mesas        ✅ Sí              Dashboard visual
Poca información consumo          ⚠️ Parcial         Registro de pedidos, sin análisis
Dependencia de personal           ✅ Sí              Automatización de flujos


Problema del Cliente              Resuelto en MVP    Cómo
─────────────────────────────────────────────────────────────
Esperar por carta                 ✅ Sí              Acceso inmediato QR
No encuentra lo que busca         ✅ Sí              Búsqueda + categorías
No conoce ingredientes            ✅ Sí              Descripción completa
Fotos inexistentes                ✅ Sí              Fotos en cada producto
Llamar mesero para cosas simples  ✅ Sí              App auto-servicio
Esperar para pedir otro           ✅ Sí              Pide cuando quiera
Dificultad solicitar cuenta       ✅ Sí              Botón dedicado
Sin confirmación de pedido        ✅ Sí              Confirmación inmediata
Sin tiempo de espera              ⚠️ Futuro          Tiempo estimado post-MVP
```

## Problemas Operativos Contemplados

El sistema también prevé problemas que PODRÍAN ocurrir:

### Si internet del cliente falla
**Problema**: Cliente no puede enviar pedido.
**Solución**: Mensaje claro ("No pudimos enviar tu pedido, revisa conexión")

### Si restaurante sin internet
**Problema**: Pedido no llega.
**Solución**: Mensaje claro, sin "Error genérico"

### Si cliente hace doble clic
**Problema**: Dos pedidos idénticos.
**Solución**: Desabilitar botón después de primer clic

### Si mesero no ve solicitud
**Problema**: Cliente espera atención indefinida.
**Solución**: Indicador visible, notificación sonora (futuro)

### Si producto eliminado mientras está en carrito
**Problema**: Cliente intenta pedir producto que desapareció.
**Solución**: Validación al enviar ("Este producto ya no está disponible")

### Si precio cambió
**Problema**: Cliente ve precio viejo, se cobra precio nuevo.
**Solución**: Validación de precio al confirmar

### Si restaurante cerrado
**Problema**: Cliente escanea QR a las 2 AM.
**Solución**: "Estamos cerrados. Horario: 11:00 - 22:00"

### Si pedido llega pero nadie lo atiende
**Problema**: Pedido pendiente infinitamente.
**Solución**: Tiempo visible ("Hace 4:23 minutos"), alertas al restaurante

## Riesgos y Mitigación

### Riesgo 1: Restaurante no quiere pedidos digitales
**Mitigación**: Sistema permite solo carta + llamar mesero. Sin obligación de usar pedidos.

### Riesgo 2: Restaurante no quiere pagar
**Mitigación**: Validar diferentes modelos de precio antes de MVP.

### Riesgo 3: Restaurante tiene POS integrado
**Mitigación**: No competir inicialmente. Integración futura.

### Riesgo 4: Clientes no quieren escanear QR
**Mitigación**: Carta física puede coexistir. QR es alternativa.

### Riesgo 5: Mala conexión wifi del restaurante
**Mitigación**: Optimización, reintento automático, mensajes claros.

### Riesgo 6: Producto demasiado complicado
**Mitigación**: UX extremadamente sencilla, flujos claros.

## Validación Recomendada

Antes de programar, validar con restaurantes reales:

1. **¿Esto soluciona tu problema actual?** (problema → solución)
2. **¿Qué parte usarías más?** (priorización)
3. **¿Qué no está?** (gaps)
4. **¿Pagarías mensualmente por esto?** (viabilidad)

## Conexiones en el Wiki

- [[Proyecto QR - Visión General]] — Contextualiza estos problemas y soluciones
- [[MVP - Alcance y Especificaciones]] — Define qué problemas resuelve el MVP
- [[Flujos Operativos del MVP]] — Los flujos son la solución a estos problemas

**Fuente Original**: Ver [[Fuentes Originales]] → Documento 1

---

**Fuentes**: PROYECTO_ SISTEMA DIGITAL DE ATENCIÓN Y PEDIDOS PARA RESTAURANTES.md
