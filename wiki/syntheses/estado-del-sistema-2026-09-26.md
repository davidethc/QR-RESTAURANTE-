---
title: "Estado del Sistema — Auditoría 2026-09-26"
type: "synthesis"
created: "2026-09-26"
updated: "2026-09-26"
sources: ["app/TESTING.md", "app/supabase/migrations/", "app/src/"]
tags: ["auditoria", "produccion", "roadmap", "seguridad", "realtime"]
aliases: ["estado-del-sistema-2026-09-26"]
---

# Estado del Sistema — Auditoría 2026-09-26

Foto completa de lo que Monky hace hoy, lo que falta, lo que está roto y qué construir después. Verificado contra el código, la base de datos real (`fvzxfbzujvkkvniyphps`), producción (`qr-restaurante-d3b9.vercel.app`) y una prueba en vivo con navegadores.

## Veredicto

- **La base de datos y el backend son sólidos para un restaurante piloto:** RLS en las 14 tablas, precios calculados en el servidor, funciones con `search_path` fijo, build de producción limpio y tiempo real medido en menos de 1.5 s.
- **Producción no está lista hoy** por dos problemas de seguridad graves y porque el código desplegado está atrasado respecto al local (ver P0).
- **Como producto:** cubre completo el ciclo pedido → cocina → mesero → cliente. Faltan los módulos de negocio (cobro, caja, reportes, facturación, inventario) para ser un sistema de restaurante "completo".

## Tiempo real — medido en vivo (2026-09-26)

Prueba con build de producción local y dos navegadores (mesero logueado + cliente por QR de la Mesa 4):

| Tramo | Latencia |
|---|---|
| Cliente envía → aparece en el panel del mesero (sin recargar) | 0.9–1.5 s |
| Mesero acepta → el cliente ve "Preparando" | 0.4 s |
| Mesero marca listo → el cliente ve "Listo" | 0.8 s |
| Entregado → el cliente ve los 5 pasos completos | < 3 s |

Canal: `postgres_changes` sobre `orders`, `waiter_calls` y `tables` para el personal, y broadcast por hash de sesión para el comensal. Pedidos de prueba creados: **#49 y #50** (Mesa 4, $1.25, DELIVERED).

## Problemas encontrados

### P0 — corregir antes de mostrarlo a un restaurante real
1. **Repositorio de GitHub público con credenciales:** `app/TESTING.md` expone la contraseña de los usuarios demo (dueño, mesero, cocina) y los tokens QR de las mesas. Hay que rotar contraseñas y tokens, sacar las credenciales del archivo (y del historial) o hacer el repo privado.
2. **Producción atrasada y con el hueco abierto:** el último deploy es del commit `9edfdcf` (19-sep). Los cambios del 24-sep están sin commitear: sesión de 90 min, link de carta `/r/<slug>` y el arreglo que evita que `/` siente a cualquiera en la Mesa 1. En producción, `/` todavía redirige al QR de la Mesa 1 y `/r/omm-siri` da 404.

### P1 — bugs reales
3. **"Pedidos hoy" usa medianoche UTC:** `get_dashboard_summary` usa `date_trunc('day', now())` en UTC, pero el restaurante está en `America/Guayaquil` (UTC-5). El contador de Comandas se reinicia a las 7:00 pm hora local, en plena cena. El campo `revenue_today` tiene el mismo error. Arreglo: truncar en `restaurants.timezone`.
4. **Error interno de Next.js en cada pedido:** `InvariantError: postponed state should not be provided when fallback params are provided` al navegar a `/r/[slug]/[mesa]/order/[id]` con `cacheComponents` + `partialPrefetching`. El cliente no lo nota (Next hace una carga completa de respaldo), pero la navegación es más lenta y llena los logs. Probar sin `partialPrefetching` en esa ruta o actualizar Next.

### P2 — riesgos de operación
5. **Plan free de Supabase:** se pausa tras 7 días sin actividad, no tiene backups diarios garantizados y los límites de conexiones Realtime y almacenamiento son bajos. Para un cliente real: plan Pro.
6. **Una sola base para desarrollo, QA y producción:** cada prueba escribe en los datos reales. Falta una rama o proyecto de staging.
7. **Cero pruebas automatizadas** (`*.test.*`/`*.spec.*` = 0). Todo el QA ha sido manual con Playwright y SQL.
8. **Sin monitoreo:** los vigilantes de UptimeRobot y cron-job.org siguen sin configurar, y no hay rastreo de errores (Sentry o similar).
9. **Leaked Password Protection** de Supabase Auth sigue desactivado (se activa a mano).

### P3 — menores
- 379 borrados en staging sin commitear (skills y documentos viejos).
- 2 avisos de lint (imports sin usar).
- 16 índices sin uso: normal con tan pocos datos, no tocar todavía.
- 4 sesiones de mesa `ACTIVE` antiguas: se expiran solas al próximo escaneo (diseño de la migración 048), no es un bug.

## Qué existe hoy (verificado)

| Módulo | Funciones |
|---|---|
| **Cliente** | QR por mesa, carta con fotos y categorías, búsqueda sin tildes, sugerencias y combos, ficha con cantidad e indicaciones, carrito editable, envío con confirmación, seguimiento en vivo de 5 pasos, llamar mesero, pedir cuenta, sesión de mesa |
| **Mesero** | Comandas (Nuevos / Preparando / Listos / Solicitudes), aceptar o rechazar con motivo, tomar pedido de viva voz, mapa de mesas en vivo, liberar mesa, avisos con sonido desde cualquier pantalla, cuenta agrupada por pedido |
| **Cocina** | Tablero de 3 columnas: Nuevos → En preparación → Listos para servir |
| **Administrador / Dueño** | Carta (categorías y productos con foto, precio, disponible, destacado, bebida del combo, orden), crear mesas + PDF de QR, configuración del restaurante (nombre, logo, descripción, dirección, teléfono) |
| **Plataforma** | 4 roles con RLS, 61 migraciones, `/api/health`, Realtime |

## Qué está a medias: existe en la base pero no en pantalla

- **Modificadores y extras** (`product_options`, `product_option_values`, `order_item_options`): tablas creadas y vacías, sin interfaz. Sirven para "término de la carne", "extra queso +$0.50", etc.
- **Historial de auditoría** (`audit_logs`, 149 filas): se registra pero nadie lo puede ver.
- **Gestión de personal** (`get_staff_members`): no se puede invitar ni dar de baja a un mesero desde la app; hoy se hace a mano en Supabase.
- **Cancelar pedido** (`cancel_order`): la función existe, sin botón.
- **Horarios y portada** (`opening_hours`, `cover_image_url`): columnas sin uso.
- **Ventas del día** (`revenue_today`): se calcula pero no se muestra (y tiene el bug de zona horaria).

## Qué falta construir para un sistema "completo"

### Núcleo de negocio (lo que un dueño pregunta primero)
1. **Cobro y caja:** marcar mesa como pagada, método de pago (efectivo, tarjeta, transferencia), propina, descuentos, dividir cuenta, apertura y cierre de caja con cuadre.
2. **Reportes:** ventas por día, semana y mes, por producto, por mesero, por hora pico, ticket promedio y tiempo de preparación. Exportar a Excel.
3. **Facturación electrónica SRI (Ecuador):** obligatoria para operar formalmente. Integración vía un proveedor autorizado.
4. **Inventario y costos:** recetas (ingredientes por plato), costo y margen por plato, stock con alertas, proveedores y compras.
5. **Contabilidad básica:** gastos, cierre diario y exportación para el contador.

### Operación
6. Gestión de personal desde la app (invitar, roles, desactivar).
7. Impresión de comandas en impresora térmica de cocina.
8. Para llevar y delivery, y pedidos por link de WhatsApp.
9. Onboarding multi-restaurante: registro, plan y pagos de suscripción (modelo SaaS).

### Ideas innovadoras (diferenciales con IA)
- **Carta con IA:** subir una foto de la carta en papel y que se genere sola (productos, precios, categorías).
- **Traducción automática** de la carta para turistas.
- **Asistente de ventas en lenguaje natural:** "¿qué vendí más el viernes?".
- **Pronóstico de demanda** y sugerencia de compras de inventario.
- **Upsell inteligente** según hora, clima y lo que ya pidió la mesa.
- **Reseña post-comida** con enlace a Google Maps cuando la experiencia fue buena.

## Recomendación de orden

1. **Esta semana (P0):** rotar credenciales, repo privado, commit + deploy de lo pendiente.
2. **Siguiente:** arreglar zona horaria e investigar el error de Next; configurar monitoreo; crear staging.
3. **Módulo 1:** Cobro y caja + Reportes. Es lo que convierte a Monky en sistema de gestión y no solo en carta digital.
4. **Módulo 2:** Facturación SRI + gestión de personal.
5. **Módulo 3:** Inventario y costos, y después las ideas con IA.

## Véase también
- [[Arquitectura Técnica MVP]]
- [[MVP - Alcance y Especificaciones]]
- [[Reglas de Negocio MVP]]
- [[Modelo de Datos Definitivo]]
- [[Proyecto QR - Visión General]]
