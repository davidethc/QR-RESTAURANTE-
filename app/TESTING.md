# Monky — Registro de QA

Antes de volver a probar algo, lee esta tabla. Si dice "✅ verificado" con fecha
reciente y nada del código relacionado cambió desde ese commit, no lo repitas —
confía en el registro y avanza. Actualiza esta tabla cada vez que se termine una
ronda de QA nueva (no solo al final de una fase).

## Cómo probar sin perder tiempo

- El servidor dev corre en `http://localhost:3000` (`.claude/launch.json`, `monky-dev`).
- **Un solo navegador = una sola sesión de mesa a la vez.** La cookie `mk_session`
  es del navegador completo, no por pestaña. Si abres el QR de la Mesa 5 en una
  pestaña y luego el de la Mesa 2 en otra, la segunda pisa a la primera. Para
  probar cliente + mesero a la vez, eso no importa (el mesero usa cookies de
  Supabase Auth, separadas) — pero para simular "dos clientes distintos" hacen
  falta dos perfiles de navegador reales, no dos pestañas de esta herramienta.
- **Antes de asumir que algo es un bug, verifica con SQL directo** (`execute_sql`
  contra el proyecto `fvzxfbzujvkkvniyphps`) qué pasó realmente en la base. Dos
  falsos positivos ya ocurridos: (1) un timer que parecía tener un número
  imposible en realidad tenía razón — el reloj real había avanzado más de lo
  que parecía por la duración de la conversación; (2) un pedido "rechazado
  solo" resultó ser otra sesión de Claude Code corriendo en paralelo sobre el
  mismo proyecto Supabase, no un trigger automático.
- Revisa `ListAgents` si algo se comporta de forma inesperada en la base — puede
  haber otra sesión trabajando sobre el mismo proyecto Supabase al mismo tiempo.

## Credenciales y accesos de prueba (restaurante demo: Cafetería Omm Siri, slug `omm-siri`)

Personal (`/login`), contraseña única `MonkyDemo2026!`:
- `owner@demo.monky.com` (OWNER)
- `mesero@demo.monky.com` (WAITER)
- `cocina@demo.monky.com` (KITCHEN — sin panel propio todavía, ver Fase 4)

QR de mesas (`/scan/<token>` → set cookie → redirige a `/r/omm-siri/<mesa>`):

| Mesa | Token |
|---|---|
| 1 | `db88bbe3-dba1-4a5a-b3a2-11520d87a808` |
| 2 | `7fa6825d-1234-44ee-8244-34f8db0d1c41` |
| 3 | `9b33ed2a-bd56-4bd0-a2c6-58c61f677da5` |
| 4 | `ab97088d-a91b-4c6a-ae33-8f7fd936a088` |
| 5 (nombre real: "Terraza") | `98cb1388-59e9-48ee-8edc-356362d4ac0b` |

Si estos tokens dejan de funcionar, re-consultar:
```sql
select r.slug, t.number, t.qr_token from tables t
join restaurants r on r.id = t.restaurant_id where r.slug = 'omm-siri';
```

## Matriz de QA

### Fase 1 — Carta pública
✅ Verificado 2026-09-02 (commit `246894f` y anteriores). Escaneo de QR válido e
inválido, búsqueda insensible a tildes, sticky nav bajo scroll, "Ver más" en
categorías con más de 8 platos, colapsar/expandir categoría completa.

### Fase 2 — Pedido del cliente
✅ Verificado 2026-09-02. Detalle de producto (cantidad, notas, precio en vivo),
carrito (editar/quitar, `ConfirmDialog`), envío, tracker con sondeo de 4s y los
5 pasos terminando en ✓ (no "en curso") al llegar a Entregado. Aislamiento de
sesión: un pedido de otra sesión no es visible.

**Llamar mesero / Pedir cuenta**: ✅ Verificado 2026-09-02. Antes de esta fecha
el cliente no tenía forma de saber si su solicitud ya había sido atendida — se
agregó el RPC `get_session_calls` + `ActiveCallBanner` (mismo patrón de sondeo
que el tracker de pedidos). Antes de "arreglar" algo de este flujo, confirma
que ya no sea este gap (ya cerrado).

### Fase 3 — Panel de mesero
✅ Verificado 2026-09-02. Login, Realtime real (no sondeo) en `orders` y
`waiter_calls` con dos pestañas simultáneas, aceptar/rechazar pedido (5 motivos
de rechazo), atender/rechazar solicitud, marcar entregado, página de Mesas
reflejando ocupación en vivo (incluye cambios hechos por SQL directo, no solo
por la UI — los triggers de `refresh_table_status` cubren ambos casos).

Bugs reales ya encontrados y corregidos aquí (no los repitas si reaparecen
como "algo anda raro" — revisa primero si el código actual todavía tiene la
causa original antes de investigar desde cero):
- Cuentas de personal con columnas de token `NULL` en `auth.users` → GoTrue
  las reporta como "credenciales incorrectas". Causa: cuentas creadas por SQL
  directo en vez del flujo normal de Supabase Auth.
- Realtime "SUBSCRIBED" pero sin eventos → falta `supabase.realtime.setAuth(token)`.
- Carrera de React StrictMode duplicando el canal de Realtime en desarrollo.
- `ElapsedTimer` con mismatch de hidratación (cliente/servidor calculan el
  tiempo transcurrido en momentos distintos) → se resolvió mostrando "—" hasta
  que el `useEffect` del cliente calcula el valor real.

**No probado todavía**: `start_order_preparing` / `mark_order_ready` desde la
UI real (el mesero no tiene esos botones a propósito — son de cocina). Hasta
Fase 4, para forzar un pedido a READY en pruebas, usar SQL directo:
```sql
update orders set status = 'PREPARING', preparing_at = now() where id = '<id>';
update orders set status = 'READY', ready_at = now() where id = '<id>';
```

### Fase 4 — Cocina
⏳ No construida todavía.

### Fase 5 — Admin
⏳ No construida todavía.

## Verificación estándar antes de dar por cerrada una ronda de QA

1. `cd app && npx tsc --noEmit` — limpio.
2. `cd app && rm -rf .next && npm run build` — limpio, revisar rutas generadas.
3. `get_advisors` (security) sobre `fvzxfbzujvkkvniyphps` — comparar contra la
   lista ya conocida de warnings intencionales (RPCs públicos para `anon`, y
   "Leaked Password Protection Disabled"). Si aparece algo nuevo fuera de esa
   lista, investigar antes de continuar.
