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

### Rediseño de "Sugerencias": combos automáticos plato+bebida (2026-09-03)

El usuario probó la primera versión (solo aparecía con productos "Destacado"
marcados a mano) y aclaró la intención real: **la sección debe tener
contenido siempre**, no depender de que el restaurante configure algo
primero. Además pidió específicamente combos de verdad — plato + bebida
con el precio de los dos juntos, ordenados de más barato a más caro — dando
como ejemplo "medio tigrillo normal + café filtrado".

**Rediseño en `lib/suggestions.ts`** (`getMenuSuggestions`), con prioridad:
1. Si hay productos "Destacado" marcados a mano → esos mandan, como platos
   sueltos (el restaurante los eligió a propósito).
2. Si no hay ninguno → arma combos automáticos: detecta la categoría de
   bebidas por nombre (`normalize(nombre).includes("bebida")`), toma un
   plato de cada categoría restante + una bebida (rotando entre las
   bebidas disponibles), suma los dos precios, y ordena de más barato a
   más caro.
3. Si el restaurante no tiene una categoría reconocible como bebidas →
   cae a mostrar platos sueltos (uno por categoría, por turnos) en vez de
   forzar un combo sin sentido.

`SuggestionsRow` ahora renderiza dos tipos de tarjeta (`MenuSuggestion` es
un discriminated union `single | combo`): las de combo muestran las dos
miniaturas + "Plato + Bebida" + precio sumado, y al tocarlas agregan
**ambos** productos al carrito de una vez (no abren el detalle — el combo
ya está decidido). `flattenSuggestions()` aplana los combos a productos
sueltos para el "¿Agregas algo más?" del carrito, que sigue siendo de
un solo toque por producto individual (agregar un combo completo ahí sería
demasiada fricción para ese momento).

**Bug real encontrado y corregido antes de que llegara a producción**:
`onAddCombo` iba a llamar `cart.addItem(dish, ...)` y luego
`cart.addItem(drink, ...)` seguidos — pero ambas llamadas parten del mismo
`items` capturado en el cierre de React antes de que la primera termine de
actualizarse, así que la segunda sobrescribía a la primera y **se perdía
el plato, solo quedaba la bebida**. Se agregó `addItems()` a `use-cart.ts`
— una sola llamada, un solo `persist()`, ambos productos en el mismo
array. Lección: nunca llamar dos veces seguidas una función que hace
`setState([...state, x])` esperando que se acumulen — hay que armar el
array completo antes de la única llamada.

**Nota de caché al probar**: cambiar `featured` por SQL directo (para
probar el fallback) no dispara `updateTag`, así que la carta pública sigue
sirviendo la versión vieja hasta 5 minutos. Para forzar el refresco al
probar, hay que pasar por la app de verdad (cualquier acción de
`lib/actions/menu.ts`, como togglear "Disponible" dos veces) — no alcanza
con cambiar la base y recargar.

Verificado end-to-end con los 50 productos reales de Omm Siri, sin nada
marcado como Destacado: aparecieron 4 combos (\$3,25 a \$9,25, incluido
"Tigrillo normal + Café filtrado" — casi el ejemplo exacto del usuario).
Tocar uno agregó los dos productos como líneas separadas en el carrito,
sin perder ninguno, y el total sumó correctamente.

### Combos manuales (`paired_drink_id`): el dueño elige qué va con qué (2026-09-03)

El usuario pidió ver combos concretos ("lasaña + té helado", "pizza
pequeña + colas") en vez de lo que armaba la rotación automática — la
rotación combina por turno, no por qué tiene sentido, y el resultado no
siempre es atractivo. En vez de que yo hardcodee "qué plato va con qué
bebida" (una decisión de negocio, no técnica), se agregó un nuevo nivel
de prioridad **por encima** de Destacado y de los combos automáticos:

**Migración `044_product_paired_drink`**: columna
`products.paired_drink_id` (FK a `products`, `on delete set null`).
`get_public_menu` ahora incluye `paired_drink` anidado por producto
(id/nombre/precio/imagen/disponible o `null`); `get_admin_menu` incluye
el `paired_drink_id` crudo.

**`getMenuSuggestions` (`lib/suggestions.ts`)**, prioridad actualizada:
1. **Combos manuales** — productos con `paired_drink_id` asignado (y
   ambos disponibles) mandan sobre todo lo demás; es la señal más
   deliberada posible, el dueño decidió justo esa pareja.
2. Destacado a mano (sin combinar).
3. Combos automáticos por rotación (como antes).
4. Platos sueltos por turnos.

**Bug real encontrado y corregido antes de probar**: el filtro de
combos manuales hacía `.slice(0, count)` **antes** de `.sort(...)` —
cortaba a los primeros `count` en el orden en que aparecían los
productos (arbitrario), no a los más baratos, así que "de barato a
caro" no estaba garantizado si había más combos manuales que el
`count`. Se invirtió el orden: ordenar primero, cortar después.
También se subió el `count` por defecto de la función de 4 a 6, para
que quepa un rango de precio más visible.

**Panel admin**: `ProductDialog` ahora tiene un campo "Bebida del
combo (opcional)" — un `Select` con todos los demás productos del
restaurante (no filtrado por categoría "bebidas": el dueño puede
combinar con lo que tenga sentido, un postre incluido). Requirió pasar
`allProducts` hacia abajo por `MenuAdminBoard` → `CategoryAdminSection`
→ `ProductRow`/`ProductDialog`, que antes no existía en esa cadena.

**Curación real cargada para Omm Siri** (a pedido explícito del
usuario, no una decisión mía): 6 combos, de barato a caro —
Bolón de chicharrón + huevo + Café con leche (\$3,25), Mote pillo con
queso + Jugos en agua (\$4,00), Sánduche de pollo + Batido de frutas en
leche (\$6,00), Lasaña de pollo + Té helado (\$6,50), Pizza pequeña +
Colas (\$9,00), Pizza mediana + Agua con gas (\$11,00).

**Hallazgo de datos, no de código**: "Tigrillo mixto" (\$6,00) estaba
con `available = false` y sin entradas en `audit_logs` para ese
producto — no hay rastro de que fuera una decisión real del dueño
(probablemente quedó así de una prueba con SQL directo, que no pasa
por el log de auditoría). Reactivado desde el panel real
(`toggleProductAvailable`, no SQL) para que de paso invalidara la
caché de la carta pública vía `updateTag`.

Verificado end-to-end: `tsc --noEmit` y `npm run build` limpios,
`get_advisors` sin hallazgos nuevos fuera de los ya conocidos. En el
navegador, Mesa 3: aparecieron los 6 combos en el orden de precio
correcto; tocar "Lasaña de pollo + Té helado" agregó ambos productos
como líneas separadas del carrito (verificado en `localStorage`, no
solo visualmente — el primer screenshot cortaba la lista por scroll y
parecía que faltaban, pero los 6 ítems estaban en el DOM). En
`/menu` como `owner@demo.monky.com`, el selector de "Bebida del combo"
de "Lasaña de pollo" mostró "Té helado" preseleccionado, confirmando
que el admin lee `paired_drink_id` correctamente.

### Bug real: el total de una mesa no desaparecía al cobrar la cuenta (2026-09-03)

Reporte del usuario: "cuando a una mesa se le hace ya la cuenta [...]
debe desaparecer el precio [...] ahora no se va el \$13,25 aunque ya se
pagó". Dos bugs reales, no uno:

1. **`get_tables_status.active_total`** sumaba `orders.total` de
   estados `PENDING..DELIVERED` filtrando solo por
   `created_at >= date_trunc('day', now())` — nunca miraba si la
   sesión de la mesa seguía abierta. Una orden `DELIVERED` (ya
   cobrada) seguía sumando hasta la medianoche.
2. **`handle_waiter_call`**, al marcar una solicitud tipo `BILL` como
   `ATTENDED`, nunca cerraba la `table_session` — `close_table_session`
   existía para eso pero era código huérfano, ninguna pantalla lo
   llamaba.

**Migración `045_close_session_and_fix_active_total`**:
`handle_waiter_call` ahora cierra la sesión activa de la mesa cuando
`p_status = 'ATTENDED'` y `type = 'BILL'`, pero solo si no quedan
pedidos sin entregar (mismo resguardo que ya tenía
`close_table_session` — si quedan, no falla el clic, solo deja la
sesión abierta). `get_tables_status.active_total` ahora suma por la
sesión `ACTIVE` de la mesa (`join table_sessions ... where
ts.status='ACTIVE'`) en vez de por fecha — se pone en 0 apenas se
cierra la sesión, sin esperar a la medianoche.

**Segundo bug, más de fondo, encontrado al reproducir el reporte**:
`resolve_table_qr` insertaba una `table_sessions` nueva **en cada
escaneo del QR**, sin revisar si la mesa ya tenía una sesión `ACTIVE`.
Mesa 1 tenía **12 sesiones "activas" simultáneas** acumuladas solo de
las pruebas de este chat (cada `/scan/<token>` de QA sumaba una más).
Con el fix #1 solo, el total seguía sin desaparecer: cerraba la sesión
nueva, pero las viejas huérfanas (con la orden de \$13,25 ya entregada
y su cuenta ya marcada "Atendida" dos veces en el pasado, sin efecto)
seguían `ACTIVE` y se seguían sumando. **Migración
`046_reuse_active_table_session_on_scan`**: `resolve_table_qr` ahora
reutiliza la sesión `ACTIVE` de la mesa si ya existe (y le actualiza
`last_activity_at`), en vez de crear una fila nueva siempre — garantiza
como el resto del sistema ya asumía: como máximo una sesión activa por
mesa. Limpieza de datos aplicada sobre las 11 sesiones huérfanas
existentes (cerradas por SQL, quedando solo la más reciente por mesa).

**Bug propio, introducido por la migración 046 y corregido de inmediato
al reportar el usuario "Me sale QR inválido" en los links de Mesa 1 y
2**: `resolve_table_qr` devuelve `table_id` como columna de salida
(`RETURNS TABLE(... table_id uuid ...)`) — dentro del cuerpo de la
función, escribir `where table_id = v_table.id` sin calificar es
ambiguo entre esa variable de salida y la columna
`table_sessions.table_id`, y Postgres lo rechaza en tiempo de
ejecución (`42702: column reference "table_id" is ambiguous"`), no en
el momento de aplicar la migración. El error hacía que **todo** escaneo
de QR cayera a "QR inválido", para cualquier mesa. **Migración
`047_fix_ambiguous_table_id_resolve_table_qr`**: se calificó la
consulta con el alias `ts.table_id`. Lección: cuando una función
`RETURNS TABLE(...)` reutiliza el mismo nombre de columna que una
tabla real referenciada adentro, cualquier referencia sin calificar a
ese nombre es ambigua — alias siempre. Verificado con
`select * from resolve_table_qr(...)` para los tokens de Mesa 1 y 2, y
con `curl -i` sobre `/scan/<token>` confirmando el `307` a `/r/omm-siri/N`
con la cookie de sesión seteada, para ambas mesas.

**Bug de frontend encontrado de paso, bloqueaba probar todo lo
anterior**: `/tables` (Server Component) tiraba 500 en cada carga:
`Error: Event handlers cannot be passed to Client Component props` —
`page.tsx` tenía `<div onClick={(e) => e.preventDefault()}>` envolviendo
`<TableQrDialog>` para evitar que el `<Link>` de la tarjeta navegara al
tocar "Ver QR". Un Server Component no puede llevar un handler inline.
Se movió el `onClick` adentro de `table-qr-dialog.tsx` (ya es
`"use client"`), envolviendo su propio `return`. **`npm run build`
no lo detectaba** — el chequeo de "no pasar funciones a Client
Components" solo salta al renderizar con datos reales, no en
build/type-check estático; quedó invisible hasta que alguien abrió
`/tables` de verdad con `canManage = true`.

Verificado end-to-end en el navegador, reproduciendo el flujo real:
Mesa 1 → pedido de \$6,50 → entregado → cliente pide la cuenta →
mesero "Atender" (PENDING→ACCEPTED) → "Marcar atendida"
(ACCEPTED→ATTENDED) → `table_sessions` de esa mesa pasó a `CLOSED` en
la base → `/tables` mostró Mesa 1 como "Disponible" sin ningún monto,
de inmediato, sin recargar manualmente ni esperar. `tsc --noEmit` y
`npm run build` limpios, `get_advisors` sin hallazgos nuevos. Datos de
prueba limpiados al cerrar la ronda (orders/order_items/waiter_calls/
audit_logs/table_sessions vaciados, tables reseteadas a AVAILABLE,
secuencia de order_number reiniciada).

### Investigación real + "Sugerencias" y upsell en el carrito (2026-09-03)

El usuario pidió esta vez que la investigación fuera de verdad en internet
(`WebSearch`), no solo criterio propio. Búsquedas hechas: UX de menús QR,
patrones de acordeón en apps de comida, upsell/cross-sell en pedidos online,
filtros de alérgenos. Confirmó dos cosas que Monky ya hacía bien (sin cuenta
forzada, acordeón para evitar scroll) y encontró una con respaldo fuerte:
**sugerir algo en el momento del carrito sube el ticket promedio ~15-20%**
(fuente: Toast, Paytronix — ver el mensaje al usuario para los links). El
usuario pidió construir eso + una fila de "destacados" arriba de la carta.

**Lo construido**:
- Columna `products.featured` (boolean, default false) — el restaurante
  decide qué aparece, no se adivina. Interruptor "Destacado — aparece en
  'Sugerencias'" en `ProductDialog` (`/menu`), junto a "Disponible".
- `get_public_menu` y `get_admin_menu` ahora exponen `featured` por producto
  (`CREATE OR REPLACE` sobre funciones existentes — grants intactos, no
  aplica el gotcha de `anon` de la migración 041).
- `SuggestionsRow` — fila horizontal "Sugerencias para ti" debajo de la
  barra de búsqueda/categorías, antes de la lista de categorías. Muestra
  todo lo `featured && available`; toca uno y abre el mismo `ProductSheet`
  de siempre (misma interacción que el resto de la carta).
- `CartSheet` — sección "¿Agregas algo más?" entre los ítems y el total,
  solo con destacados que **todavía no están en el carrito** (se filtra por
  `product.id`, recalculado con cada cambio del carrito). Un toque agrega
  cantidad 1 directo, sin abrir el sheet de detalle — fricción mínima a
  propósito, es el momento de upsell, no de explorar.

**Bug de prueba propio, no de la app**: al marcar el primer producto como
destacado con un script, usé `document.querySelectorAll('button[role="switch"]')`
sin acotar al diálogo abierto — la página tiene un switch "Disponible" por
cada fila detrás del overlay, así que el índice `[1]` agarró el switch
equivocado. Para probar cualquier interruptor dentro de un Dialog/Sheet,
acotar siempre la búsqueda a `document.querySelector('[role="dialog"]')`
primero.

Verificado end-to-end: marcar "Tigrillo mixto" y "Café con leche" como
destacados → confirmado en la base → ambos aparecen en "Sugerencias para
ti" en la carta pública → agregar un tercer producto normal → abrir
carrito → aparecen los dos destacados en "¿Agregas algo más?" → tocar uno
lo agrega con un solo toque y desaparece de esa lista (ya está en el
carrito) → el otro se queda. Datos de prueba (`featured`) revertidos a
`false` después — la elección de qué destacar es del restaurante real, no
mía.

### 4 mejoras de UX propuestas y construidas (2026-09-02/03)

El usuario pidió mejorar la UX "como profesional" — se buscó primero en las
skills habilitadas de la cuenta (`ListSkills`) algo de revisión UX/producto;
no hay ninguna instalada (solo `doc-coauthoring` y `canvas-design`, que no
aplican). Se avisó eso explícitamente y se revisó la app real contra
heurísticas de usabilidad conocidas en su lugar. El usuario eligió 4 de las
5 propuestas:

1. **Sonido en avisos urgentes de personal** (`src/lib/alert-sound.ts`) —
   ding-dong de dos tonos con Web Audio API, sin archivo de audio que
   empaquetar. Se dispara en `notify.newOrder`, `notify.waiterCalled`,
   `notify.billRequested` — las mismas tres que ya eran persistentes (sin
   auto-cierre). No se pudo confirmar el sonido a oído en este entorno (sin
   altavoces/no hay forma de "escuchar" desde aquí) — se verificó que la
   función no lanza error y que el flujo sigue funcionando con ella
   conectada; si algún día hace falta confirmar cómo suena, probar en un
   navegador real.
2. **Indicador de carrito en cada producto** — `ProductCard` recibe
   `quantityInCart` y muestra una pastilla "N en carrito" junto al nombre
   cuando ya hay alguno agregado. Cálculo vía `useMemo` en `MenuBrowser`
   sobre `cart.items`, sin tocar `use-cart.ts`.
3. **Clic en una mesa lleva a sus pedidos** — `/tables` envuelve cada
   tarjeta en un `Link` a `/orders?table=N`; `OrdersBoard` lee
   `initialTableFilter` y filtra pendientes/preparando/listos/solicitudes
   por `table_number`, con banner "Viendo solo Mesa N" y botón para
   limpiarlo (`router.replace("/orders")`). El botón de QR sigue
   funcionando dentro de la tarjeta clicable (`e.preventDefault()` en su
   wrapper para no disparar la navegación del Link).
4. **Reordenar la carta arrastrando** — la más grande. `reorderCategories`
   y `reorderProducts` en `lib/actions/menu.ts` (sin RPC nuevo, RLS ya
   cubría esto) reescriben `position` de todos los ids en su nuevo orden.
   Drag & drop nativo de HTML5 (sin librería) con una asa `GripVertical`
   dedicada por fila — así arrastrar no interfiere con los botones de
   editar/eliminar de esa misma fila. `MenuAdminBoard` pasó a ser cliente,
   con estado local optimista que se revierte con `router.refresh()` si
   la acción falla.

**Dos hallazgos reales durante la verificación de "reordenar":**

- **Falso positivo de prueba**: la primera vez que probé el drag, la UI
  cambió pero la base no guardó nada — parecía un bug. Era que la pestaña
  de prueba había heredado la sesión de `mesero@demo.monky.com` de una
  prueba anterior (misma cookie de navegador compartida entre pruebas,
  ver nota de arriba), y mesero no tiene permiso de escritura en
  `categories`/`products`. Nada raro en el código — hay que fijarse con
  qué cuenta está logueada la pestaña antes de probar algo de admin.
- **Bug real, sí corregido**: cuando RLS bloquea un `UPDATE`, Postgres/
  PostgREST no lanza error — solo actualiza 0 filas en silencio. El
  código original de `reorderCategories`/`reorderProducts` solo revisaba
  `result.error`, así que un intento sin permiso se reportaba como éxito
  aunque no cambiara nada. Corregido agregando `.select('id')` a cada
  update y revisando que la cantidad de filas devueltas sea la esperada;
  si no, se reporta error real. **Aplica a cualquier UPDATE futuro
  protegido por RLS en este proyecto — no confiar solo en `.error`.**

Verificado end-to-end logueado como `owner@demo.monky.com`: arrastrar una
categoría y un producto, confirmando en la base (`updated_at` cambia,
`position` correcto) — no solo visualmente en pantalla.

### "Pedir cuenta" sin detalle del pedido (2026-09-02)

El usuario notó que al recibir una solicitud de cuenta, la tarjeta del
mesero (`CallCard`) no mostraba qué había pedido esa mesa ni cuánto cobrar —
solo "Mesa X solicita la cuenta" y los botones Atender/Rechazar. Real, no
hipotético: para cobrar hace falta saber el detalle.

**Corregido**: `get_waiter_calls` ahora trae, por cada solicitud, todos los
pedidos del `table_session_id` de esa llamada (excluyendo REJECTED/CANCELLED)
como `session_items` (producto, cantidad, subtotal) + `session_total`. La
`CallCard` muestra ese detalle solo cuando `call.type === "BILL"` (una
llamada de "atención" no lo necesita). **Importante**: se agrupa por
`table_session_id`, no por mesa a secas — si la mesa ya cerró su sesión y
empezó una nueva, no arrastra pedidos de la visita anterior.

Verificado con dos pedidos reales en la misma mesa (4 ítems entre ambos):
la tarjeta de "Pedir cuenta" mostró los 4 ítems y el total correcto ($18,25),
sumando ambos pedidos de la sesión.

No hizo falta una función nueva ni cambiar permisos — se modificó el cuerpo
de `get_waiter_calls`, que ya estaba bien configurado (solo `authenticated`,
sin `anon`) desde antes de esta sesión.

### Toasts: 5s por defecto, tres persistentes hasta cerrarlas a mano (2026-09-02)

Pedido del usuario: que los toasts desaparezcan solos a los 5 segundos, excepto
los del personal para "pedido nuevo por aceptar" y las dos llamadas del
cliente (mesero / cuenta) — esas deben quedarse hasta que alguien las cierre
a mano, para que no se pierdan de vista sin querer.

**Implementado**: `notifications.ts` ahora pasa `timing: { displayDuration:
5000 }` explícito en cada notificación normal, y `duration: Infinity`
explícito en `newOrder`, `waiterCalled`, `billRequested`.

**Detalle importante de la librería (`goey-toast`)**: el prop `duration` del
`<GooeyToaster>` global (en `layout.tsx`) **no** se aplica de forma confiable
a un toast que no trae su propia duración — se confirmó leyendo
`node_modules/goey-toast/dist/index.js`: cada llamada calcula su propia
duración con `timing?.displayDuration ?? duration ?? (description ?
DEFAULT_EXPANDED_DURATION : undefined)`, sin consultar el prop global del
Toaster. **Por eso cada notify.* tiene que traer su propia duración
explícita** — no alcanza con configurarla una sola vez arriba. Se dejó el
prop `duration={5000}` en `layout.tsx` de todas formas, como respaldo, pero
no hay que confiar en él solo.

**Nota sobre cómo se verificó (y su límite)**: no se pudo confirmar el
temporizador de 5s a simple vista en este entorno — el panel de navegador
automatizado nunca tiene el foco real del sistema operativo
(`document.visibilityState` da `"hidden"` incluso con la pestaña
"seleccionada" dentro de la herramienta), y estas librerías de toast pausan
el conteo cuando la pestaña no está realmente activa (comportamiento
correcto y deseado para un usuario real, no un bug). La corrección se
verificó leyendo el código fuente exacto de la librería y confirmando que
los valores pasados (`timing.displayDuration: 5000`, `duration: Infinity`)
ganan primero en su cadena de prioridad — no por cronómetro en pantalla. Si
se necesita confirmar visualmente alguna vez, hay que probarlo en un
navegador real con la ventana en foco, no desde esta herramienta.

### Bug real reportado por el usuario 2026-09-02: error de hidratación + aviso mudo

El usuario mandó una captura real de un "Recoverable Error" de hidratación en
`/r/omm-siri/1`. Dos causas, ambas encontradas y corregidas:

1. **`use-cart.ts` tenía el mismo tipo de bug que ya se había corregido en
   `ElapsedTimer`, pero en un archivo distinto** — `useState(() =>
   readCart(key))` leía `localStorage` en el inicializador, que corre tanto en
   servidor (sin `localStorage`, devuelve `[]`) como en cliente (con carrito
   real ya guardado). Si el cliente ya tenía algo en el carrito de una visita
   anterior, el árbol que React esperaba pintar (según el servidor) no
   coincidía con el que pintaba de verdad (con el botón "Ver pedido" visible).
   **Corregido** con el mismo patrón: empezar en `[]` siempre, cargar el
   carrito real recién en un `useEffect` (cliente-only). Verificado
   recargando la página completa con un carrito ya guardado — cero errores
   en consola.
   **Lección que ya deberíamos tener aprendida**: cualquier `useState`
   inicializado leyendo `localStorage`, `Date.now()`, o cualquier otra API
   que difiera entre servidor y cliente es sospechoso por defecto. Antes de
   escribir uno nuevo, usar el patrón "empieza neutro, corrige en
   `useEffect`". Se hizo un grep de todo `src/` (`useState(() =>`,
   `localStorage`, `window.`, `document.`) para confirmar que no quedó
   ningún otro caso — limpio.

2. **El cliente no recibía ningún aviso cuando su pedido pasaba a
   "preparando"**. Consecuencia directa del RPC atómico de la sección de
   abajo: como ACCEPTED y PREPARING ahora pasan en la misma transacción, el
   pedido nunca queda "visible" en estado ACCEPTED el tiempo suficiente para
   que el sondeo del cliente (`order-tracker.tsx`) lo capture — salta
   directo a PREPARING, y esa transición no disparaba ningún toast.
   **Corregido**: `notifyTransition` ahora dispara el mismo aviso
   ("Pedido #N aceptado — Pasó a cocina.") tanto en ACCEPTED como en
   PREPARING. Verificado con un pedido real y sondeo de verdad (no solo
   cambiando el estado por SQL): el toast aparece.

### Auditoría de backend 2026-09-02: RPC atómico + hallazgo crítico de permisos

El usuario pidió explícitamente revisar la base de datos antes de confiar en el
cambio de "menos clics" de arriba. Se encontraron y corrigieron dos cosas:

1. **`acceptOrder` llamaba dos RPCs separados** (`accept_order` +
   `start_order_preparing`), cada uno su propia transacción. Si el segundo
   fallara justo después de que el primero ya se guardó, el pedido quedaba
   "aceptado pero no marcado preparando" con un error mostrado al mesero que
   no reflejaba la realidad. Se reemplazó por **`accept_and_prepare_order`**
   — un solo RPC, una sola transacción de Postgres, todo o nada. Verificado:
   `accepted_at` y `preparing_at` quedan con el mismo timestamp exacto, y los
   dos registros de `audit_logs` (ACCEPT_ORDER + START_PREPARING) también.

2. **Hallazgo importante, aplica a cualquier RPC nuevo que se cree en este
   proyecto**: este proyecto de Supabase tiene un *default privilege* a nivel
   de esquema (`ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO
   anon, authenticated, service_role`) que le da a **`anon` acceso automático
   a toda función nueva**, sin que nadie lo pida. Esto es *independiente* del
   rol `PUBLIC` — hacer `revoke all on function ... from public;` **no** le
   quita el permiso a `anon`, porque su acceso no vino por herencia de
   `PUBLIC` sino por un grant directo. El RPC nuevo (`accept_and_prepare_order`)
   terminó siendo llamable por `anon` sin que la migración lo pidiera —
   detectado con `get_advisors(type: security)`, no a simple vista. La
   función seguía protegida en la práctica (`if auth.uid() is null then
   raise exception`), pero era una superficie de ataque innecesaria.
   **Corrección**: `revoke execute on function ... from anon;` explícito,
   además del `from public`. **Regla para cualquier RPC futuro que no sea
   para el cliente anónimo**: la migración debe revocar de `anon` por
   nombre, no confiar en que `revoke ... from public` alcance. Verificar
   siempre con:
   ```sql
   select grantee from information_schema.routine_privileges
   where routine_name = '<nombre_del_rpc>';
   ```
   Antes de dar por buena una función nueva, confirmar que la lista NO
   incluya `anon` a menos que sea explícitamente para el cliente (como
   `get_session_calls`, `create_customer_order`, etc.).

Base de datos limpiada por completo después de esta ronda (0 pedidos, 0
llamadas, 0 sesiones, mesas disponibles) — quedó lista para producción con
solo el catálogo real de 50 productos / 8 categorías.

### Ajuste de UX 2026-09-02: menos clics para el mesero + toasts del cliente
El usuario probó el panel real (no en esta sesión) y encontró dos cosas:

1. **Demasiados estados manuales**: "Aceptar" y "Preparar" eran dos clics
   separados que no representan ningún momento real distinto (se acepta
   y se empieza a cocinar al mismo tiempo). `acceptOrder` ahora llama
   `accept_order` y `start_order_preparing` en secuencia — un pedido
   PENDING pasa a PREPARING con un solo clic. El botón "Preparar"
   sigue existiendo en `order-card.tsx`/`kitchen-order-card.tsx` como
   respaldo manual solo por si `start_order_preparing` fallara después
   de aceptar (poco probable, pero deja al pedido recuperable en vez de
   atascado). **Si vuelves a tocar el flujo de aceptar pedidos, no
   reintroduzcas el paso manual de "Preparar" como obligatorio.**
2. **Sin feedback al cliente**: `notify.orderPlaced()` existía en
   `notifications.ts` desde Fase 2 pero **nunca se llamaba** — el
   cliente no veía ningún toast al enviar su pedido. Tampoco había
   ningún aviso al agregar un producto al carrito. Se conectaron ambos:
   `notify.itemAdded(nombre)` en `menu-browser.tsx` (al agregar) y
   `notify.orderPlaced()` en `cart-sheet.tsx` (al confirmar el envío).
   **Lección**: una función definida en `notifications.ts` no
   garantiza que esté conectada en algún lado — grep por su nombre
   antes de asumir que "ya está implementado".

Verificado en el navegador: agregar "Bolón de chicharrón" muestra el
toast "Bolón de chicharrón agregado"; enviar el pedido muestra "Pedido
enviado"; aceptar un pedido pendiente lo deja directo en "Preparando"
con el toast "Pedido aceptado — en preparación", sin pasar por un
estado "Aceptado" visible ni requerir un segundo clic.

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

### QR de mesas
✅ Verificado 2026-09-02. El usuario eligió `qrcode` (npm) cuando se le
preguntó (regla del plan: preguntar antes de instalar). Botón "Ver QR"
en `/tables` (solo OWNER/ADMIN), genera el QR client-side con
`QRCode.toDataURL` apuntando a `${window.location.origin}/scan/{qr_token}`
— usa el dominio real del navegador, no una URL fija, así que funciona
igual en localhost que ya en producción sin cambiar código. Incluye
"Descargar PNG" y "Imprimir" (abre una pestaña con una tarjeta simple
y llama a `window.print()`). Verificado que el QR de Mesa 1 codifica
exactamente `http://localhost:3000/scan/db88bbe3-...` (el token real).

Con esto, Fase 5 queda completa: Carta, Configuración y QR de mesas.
Lo único explícitamente fuera de scope (por decisión, no olvido):
crear/renombrar mesas desde la UI (hoy solo se editan por SQL) y
personalizar colores del restaurante.

## Verificación estándar antes de dar por cerrada una ronda de QA

1. `cd app && npx tsc --noEmit` — limpio.
2. `cd app && rm -rf .next && npm run build` — limpio, revisar rutas generadas.
3. `get_advisors` (security) sobre `fvzxfbzujvkkvniyphps` — comparar contra la
   lista ya conocida de warnings intencionales (RPCs públicos para `anon`, y
   "Leaked Password Protection Disabled"). Si aparece algo nuevo fuera de esa
   lista, investigar antes de continuar.
