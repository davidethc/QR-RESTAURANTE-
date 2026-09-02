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
✅ Verificado 2026-09-02. Ruta `/kitchen`, 3 columnas (Nuevos=ACCEPTED,
En preparación=PREPARING, Listos=READY), Realtime compartido con
`useStaffRealtime`. Ciclo completo probado cruzando paneles: cocina
"Preparar" → "Marcar listo" → visible al instante como "Listo" en el
panel de mesero (`/orders`) → mesero "Marcar entregado". Cocina no
tiene botones de aceptar/rechazar ni ve precios (por diseño, revisar
`kitchen-order-card.tsx` si esto cambia).

**Bug encontrado y corregido durante esta ronda**: `order-card.tsx` y
`call-card.tsx` (mesero) siempre mostraban `Mesa {table_number}`
ignorando `table_name` — la Mesa 5 ("Terraza" en la base) nunca se veía
con su nombre real fuera de la grilla de Mesas. Se corrigió en ambos
componentes y en `kitchen-order-card.tsx` (nuevo) para usar
`table_name ?? \`Mesa ${table_number}\``, igual que `tables/page.tsx`.
El tracker del cliente (`order-tracker.tsx`) y los toasts de `notify.*`
siguen mostrando el número (no el nombre) — decisión pendiente, no bug,
si se quiere cambiar habría que tipar `tableNumber` como string ahí.

**Nota de scope**: `/kitchen` solo está protegido por autenticación
(vía `proxy.ts`), no por rol — un WAITER autenticado puede visitarlo
igual que un KITCHEN, la única diferencia es que el link no aparece en
su nav. Mismo patrón que `/orders` y `/tables` ya tenían. No se agregó
gate de rol porque ningún otro panel del dashboard lo tiene tampoco.

### Cambio de negocio 2026-09-02: el mesero también puede Preparar/Marcar listo
Decisión del usuario: cocina tiene las manos ocupadas cocinando y no
va a tocar confiablemente una tablet — exigir que solo cocina avance
el pedido (ACCEPTED→PREPARING→READY) crea un cuello de botella real.
Se agregaron los mismos botones de `KitchenOrderCard` a `order-card.tsx`
(mesero): ahora cualquiera de los dos (cocina o mesero) puede avanzar
el pedido, lo que sea más rápido en la operación real. `/kitchen` sigue
existiendo tal cual para el restaurante que sí tenga a alguien de
cocina libre para usarlo.

**Bug real encontrado al probar esto** (no obvio desde el código de
React): los RPCs `start_order_preparing` y `mark_order_ready` tenían el
chequeo de rol **en la base de datos**, no en el frontend — restringido
a OWNER/ADMIN/KITCHEN, sin WAITER. El botón nuevo en el panel de mesero
no hacía nada (fallaba silencioso vía `notify.error`, RPC devolvía "No
autorizado..."). Se corrigió agregando WAITER a esas dos funciones
(migración `039_waiter_can_prepare_and_ready`). **Lección para futuros
cambios de permisos**: si un botón nuevo no hace nada y no hay error en
consola del navegador, revisar el RPC en Postgres — la autorización de
verdad vive ahí, no en el componente.

### Fase 5 — Admin (Carta + Configuración)
✅ Verificado 2026-09-02 (`/menu` y `/settings`). Probado en el navegador
como `owner@demo.monky.com`: crear categoría, crear producto con foto
real (subida a `product-images/{restaurant_id}/...`), editar precio,
apagar disponibilidad (se refleja al instante en la carta pública como
"Actualmente no disponible" — ver nota de `updateTag` abajo), eliminar
producto y categoría. Configuración: editar nombre/descripción/
teléfono/dirección y subir logo — el logo ahora SÍ se muestra en el
encabezado de la carta pública (`menu-header.tsx`), antes era solo
texto. Todos los datos de prueba de esta ronda se limpiaron después
(quedó un archivo huérfano de 69 bytes en `product-images` — Storage no
permite `DELETE` directo por SQL, "Direct deletion... not allowed",
hay que usar la Storage API; no vale la pena para un archivo de prueba
tan pequeño).

**Bug de plataforma encontrado (no de este proyecto)**: Next.js 16
cambió la firma de `revalidateTag` — ahora exige un segundo argumento
`profile` (`revalidateTag(tag, "max")` o similar). Sin él, `tsc` falla
con "Expected 2 arguments, but got 1" en cada llamada. La función
correcta para este caso (invalidar caché desde dentro de una Server
Action, para que el propio autor de la escritura vea su cambio al
instante) es **`updateTag(tag)`** — un import distinto, no una versión
de `revalidateTag` con más argumentos. Ver `AGENTS.md` del proyecto:
"This is NOT the Next.js you know" — la guía real está en
`node_modules/next/dist/docs/`, no en el training data.

**Decisión de scope, no pendiente**: no se implementó personalización
de colores del restaurante — el tema (turquesa/granate) es CSS
compilado en `globals.css`, no una columna en la base. Agregar eso
sería una feature nueva de verdad (theming dinámico por restaurante),
no algo que ya estuviera a medias.

**Aún no construido de Fase 5**: generación/impresión de QR de mesas —
pendiente elegir librería con el usuario antes de instalar nada (regla
del plan original, no se ha roto).

## Verificación estándar antes de dar por cerrada una ronda de QA

1. `cd app && npx tsc --noEmit` — limpio.
2. `cd app && rm -rf .next && npm run build` — limpio, revisar rutas generadas.
3. `get_advisors` (security) sobre `fvzxfbzujvkkvniyphps` — comparar contra la
   lista ya conocida de warnings intencionales (RPCs públicos para `anon`, y
   "Leaked Password Protection Disabled"). Si aparece algo nuevo fuera de esa
   lista, investigar antes de continuar.
