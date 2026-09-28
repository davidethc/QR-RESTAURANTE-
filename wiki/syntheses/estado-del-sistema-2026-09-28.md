---
title: "Estado del Sistema — Auditoría 2026-09-28"
type: "synthesis"
created: "2026-09-28"
updated: "2026-09-28"
sources: ["app/TESTING.md", "app/supabase/migrations/", "app/src/"]
tags: ["auditoria", "produccion", "p0", "p1", "roadmap"]
aliases: ["estado-del-sistema-2026-09-28"]
---

# Estado del Sistema — Auditoría 2026-09-28

Resumen de producción (main commit 5977290) tras la integración de cobro, reportes y gestión de personal (PR #1).

## Estado de Producción

- **Versión en vivo**: main commit 5977290 (28-sep, 05:00 UTC)
- **Migraciones aplicadas**: 85 (todas alineadas entre repo y BD `fvzxfbzujvkkvniyphps`)
- **CI**: Verde (TypeScript, lint, build)
- **Health check**: `/api/health` respondiendo 200 OK
- **Restaurante operativo**: Cafetería Omm Siri (slug: `omm-siri`)

## Lo que Funciona Bien

- **Dinero**: Cuadra al centavo en las 14 cuentas del sandbox; idempotencia de pagos y locks en producción
- **Seguridad**: RLS en las 22 tablas; `search_path` fijo en todas las RPCs; grants correctos (anon solo en cliente)
- **Zona horaria**: Local (America/Guayaquil, UTC-5) con corte comercial a 04:00
- **Tiempo real**: Mesero ve nuevo pedido en 0.9–1.5 s; cliente ve cambios en <1 s
- **Transacciones**: Sin race conditions detectadas en pagos simultáneos ni stock double-consume

## P0 — Riesgos Críticos

### 1. Sin backups automáticos
- Supabase free sin PITR (Point-in-Time Recovery)
- **Acción**: Plan Pro con backups diarios

### 2. Repo público con contraseñas y tokens QR
- `app/TESTING.md` ya los removió (gitignored en `app/.env.qa.local`)
- Pero el historial de Git los expone aún
- **Acción**: Rotar todos los `qr_token` de mesas y credenciales; hacer repo privado

### 3. Bug de sesiones que vencían con consumo sin cobrar
- Mesa 1 perdió $27.50 por sesión expirada con pedido pendiente de pago
- Corregido hoy con lógica de `finalize_bill` y cierre forzado de sesión
- **Estado**: En corrección (rama fix/robustez-sesiones-permisos)

## P1 — Problemas Operacionales

- **Sin staging**: Todo se prueba contra producción
- **Sin tests de dinero en CI**: Vitest + SQL de transacciones pendientes
- **Sin monitoreo**: Sentry, dashboards Vercel, alertas de errores
- **Permisos de Cocina**: Ve `session_token` y venta del día (información sensible)
- **Pedidos duplicables**: Falta idempotencia en el cliente (botón de envío)

## P2 — Deuda Técnica

- Realtime de cocina tarda hasta 20 s en casos lentos
- `set_bill_split` acepta WAITER (debería ser solo OWNER/ADMIN)
- `void_payment` bloquea antes de revisar rol
- `add_staff_member` acepta cualquier user_id
- `/reports` duplicado (existe `sales` de una rama anterior)
- Headers de seguridad faltantes, error.tsx, manejo offline

## P3 — Limitaciones Funcionales

- **IVA**: Se calcula en el navegador, no se guarda (pendiente módulo SRI)
- **Datos de prueba**: Sesiones viejas en Omm Siri y movimientos de caja de prueba (se limpian hoy)
- **Migraciones**: Versiones finales aplicadas; `kitchen_flow_simplification` recuperada del historial de producción

## Datos Verificados

| Métrica | Valor |
|---------|-------|
| Tablas con RLS | 22 / 22 |
| Funciones con `search_path` fijo | 52 / 52 |
| Grants en WAITER | 0 funciones de dinero (correcto) |
| Grants en KITCHEN | 0 funciones de cliente (correcto) |
| Cuentas del sandbox | 14 exactas |
| Saldo total verificado | $XXXX.XX (reconciliado) |

## Próximos Pasos

1. **Hoy (2026-09-28)**: Limpiar datos de prueba, aplicar fix de sesiones
2. **Esta semana**: Rotar tokens, plan Pro de Supabase, repo privado
3. **Próxima semana**: Staging + tests de dinero en CI
4. **Luego**: Monitoreo, permisos ajustados, correcciones de P2

## Véase También
- [[Estado del Sistema — Auditoría 2026-09-26]] — Auditoría anterior (más detallada)
- [[Panel del Admin]] — Funcionalidades del admin (personal, ventas, cobro)
- [[Diseño: Cobro y Caja, Reportes, Inventario y Costos]] — Diseño de base de datos

---

**Fuente**: app/TESTING.md, audit de Supabase, PR #1 merge
