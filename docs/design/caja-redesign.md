# Rediseño de Caja (POS Monky)

Caja deja de ser una página de ajustes y pasa a ser un **punto de venta**: al entrar se ve primero qué hay que cobrar, y cada acción con dinero tiene su propio botón, color e icono.

## Problema (lo que dijo el dueño)

- Lo primero que se ve al entrar no se entiende. No hay jerarquía ni un "qué hago ahora".
- "Entrada o retiro" era un desplegable que mezclaba entradas y salidas. Parecía que solo servía para gastos.
- Desde Caja no se podía tomar un pedido de mesa o domicilio, solo "Venta rápida".
- Venta rápida se abría en una hoja angosta: las categorías venían en acordeón, el ticket quedaba escondido y la confirmación era un modal encima de la hoja.
- En "Cuenta dividida, partes iguales" solo cambiaba el monto sugerido. No se veía quién pagaba ni quién ya había pagado.

## Principios

1. **Lo urgente primero.** La pantalla responde "¿qué falta cobrar?" antes que cualquier otra cosa.
2. **Una acción primaria por pantalla.** El pie de cada paso tiene un botón grande y nada más compite con él.
3. **El color dice qué le pasa al dinero, pero nunca solo.** Siempre va con icono y texto.
4. **Los pasos son pasos de verdad.** El cobro y el corte son secuencias numeradas. Se puede volver a un paso hecho, pero no saltarse uno pendiente.
5. **Táctil y rápido.** Botones de 48 px como mínimo (56 px en las acciones principales), teclado numérico en pantalla y teclado físico. La carta del pedido se carga solo cuando se abre "Nuevo pedido".

## Disposición por pantalla

### Tablet y escritorio (≥ 1024 px, objetivo principal)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ (●) Caja principal · abierta    En el cajón   Por cobrar · 3   Ventas de hoy · 12 │
│     Desde las 08:12             $45,00        $27,50           $230,00            │
│                          [⬇ Meter dinero] [⬆ Sacar dinero] [🔒 Corte] Historial ● │
├──────────────────────────────┬────────────────────────────────────────────────────┤
│ [ + Nuevo pedido ]           │ 🍽 Mesa 4 · Cuenta #18           Falta cobrar $12,50 │
│                              │ ▓▓▓▓░░░░ Pagado $5,00 de $17,50                     │
│ Por cobrar          3 cuentas│ (✓ Persona 1 $5,83) (◉ Persona 2 $5,83) (⏱ P3 …)    │
│ ▌🍽 Mesa 4    ⏱ Por cobrar   │ ①Cuenta ─ ②¿Cómo pagan? ─ ③Método ─ ④Listo         │
│ ▌   18 min        $12,50  ›  │                                                    │
│ ▌🛍 Llevar #12 ⏱ Por cobrar  │   … contenido del paso …                           │
│ ▌   4 min         $5,00   ›  │                                                    │
│ ▌🛵 Domicilio #3 ✓ Pagado ·  │                                                    │
│ ▌   por entregar  $9,00   ›  │ [← Atrás]  [       Cobrar $5,83 (verde)        ]  │
│ ▸ Cobradas hoy (12)          │                                                    │
└──────────────────────────────┴────────────────────────────────────────────────────┘
```

- La franja de estado se queda fija arriba. Los dos paneles ocupan el alto de la pantalla y cada uno hace scroll por dentro, así el pie del cobro siempre se ve.
- Sin una cuenta elegida, el panel derecho muestra una guía de tres pasos ("Elige la cuenta → ¿Cómo pagan? → Cobra").

### Teléfono (390 px)

```
┌──────────────────────────┐
│ (●) Caja principal       │
│ $45 · Por cobrar $27,50 →│  (las cifras hacen scroll horizontal)
│ [⬇ Meter] [⬆ Sacar]      │
│ [🔒 Corte] Historial     │
├──────────────────────────┤
│ [ + Nuevo pedido ]       │
│ Por cobrar               │
│ ▌🍽 Mesa 4      $12,50 › │──► el toque abre el cobro a pantalla completa
│ ▌🛍 Llevar #12   $5,00 › │    (la misma hoja que usan Mesas y Pedidos)
└──────────────────────────┘
```

### Caja cerrada

Solo se ve "Abrir caja": la franja dice **Caja cerrada** (ámbar) y abajo hay una tarjeta grande con el keypad del fondo inicial. El fondo que dejó el último corte ya viene escrito. Hasta abrirla no se puede cobrar ni tomar pedidos.

## Flujos

### Cobrar una cuenta (CheckoutPanel)

1. **Cuenta.** Se ve el ticket agrupado por pedido, con su estado en cocina, y los totales: subtotal, descuentos, total, ya pagado y propinas. Las acciones van en fila: Agregar producto, Descuento (solo OWNER/ADMIN), Pre-cuenta y Cancelar venta (solo OWNER/ADMIN, en mostrador sin pagos). Los pagos previos aparecen con la opción Anular (solo OWNER/ADMIN). El botón primario es "Cobrar $X".
2. **¿Cómo pagan?** Hay tres tarjetas grandes con icono y una línea de explicación:
   - **Todo junto**: una persona paga la cuenta completa.
   - **Partes iguales**: se elige N con − / +. Aparecen N fichas "Persona 1 · $2,50 · Pagado ✓ / Cobrando / Pendiente" y se cobra de a una persona.
   - **Por productos**: se toca lo que paga esta persona y el monto se suma en vivo.
   Al elegir, la división se aplica en la base en ese momento (`set_bill_split`).
3. **Método.** Tres tarjetas: Efectivo, Tarjeta y Transferencia. "Otro método" y "Varios métodos" quedan como botones secundarios.
   - Arriba se muestra el monto a cobrar, con un botón "Otro monto" para un pago parcial.
   - La propina se elige con fichas: Sin propina, 5 %, 10 % u Otra.
   - En efectivo hay un keypad del monto **Recibido** con montos rápidos ("Exacto", $10, $20…) y una tarjeta grande **Vuelto $X** en verde. Si lo recibido no alcanza, la tarjeta cambia a **Falta $X** en rojo.
4. **Listo.** Aparece un check verde animado, lo cobrado, y el **Entrega de vuelto $X** en grande. Después hay una sola salida:
   - **Siguiente: Persona N · $X**, que avanza solo a la siguiente persona pendiente;
   - **Cobrar lo que falta**, si fue un pago parcial;
   - **Cerrar cuenta y liberar**, si ya se puede;
   - **Listo**, más Imprimir ticket.

El saldo ("Falta cobrar"), la barra de pagado y las fichas de persona viven en la cabecera, así que se ven en todos los pasos.

### Nuevo pedido

1. "Nuevo pedido" abre una pregunta: **¿Qué tipo de pedido es?** Se responde con tres tarjetas: Para llevar, Mesa y Domicilio.
2. Se abre el **constructor a pantalla completa**:
   - categorías en un riel a la izquierda (pestañas con scroll en teléfono);
   - productos como tiles grandes, con un contador verde de cuántos van en el pedido;
   - la ficha de variantes y extras, que solo aparece si el producto las tiene; si no, el producto se agrega con un toque;
   - el ticket siempre a la derecha; en teléfono es una barra "Ver pedido · N · $X" que abre un cajón.
3. Cómo se cierra cada tipo:
   - **Para llevar / Domicilio**: "Cobrar ahora · $X" (verde) crea el pedido y abre su cobro al lado. "Enviar a cocina · cobrar después" lo deja en Por cobrar. Domicilio pide quién entrega: con envío propio, nombre, teléfono, dirección y costo de envío; con plataforma, el ID del pedido.
   - **Mesa**: primero se elige la mesa en una cuadrícula que marca cada una como libre u ocupada. Al final, "Enviar a cocina". Se cobra después desde Por cobrar.
4. Si se sale con productos en el pedido, se pregunta "¿Salir sin guardar?".

### Meter / Sacar dinero

Son dos botones separados en la franja:

- **Meter dinero**: verde, con la flecha hacia el cajón.
- **Sacar dinero**: rojo, con la flecha hacia afuera.

Cada uno abre su propia pantalla con **solo sus motivos** en fichas, un keypad de monto y una nota.

| Botón | Motivos | Tipo / motivo en `add_cash_movement` |
|---|---|---|
| Meter dinero | Refuerzo de fondo | `IN` / `FLOAT_TOPUP` |
| Meter dinero | Otro ingreso (nota obligatoria) | `IN` / `OTHER` |
| Sacar dinero | Gasto | `OUT` / `EXPENSE` |
| Sacar dinero | Pago a proveedor | `OUT` / `SUPPLIER_PAYMENT` |
| Sacar dinero | Reparto de propinas | `OUT` / `TIPS_PAYOUT` |
| Sacar dinero | Retiro | `OUT` / `WITHDRAWAL` |
| Sacar dinero | Devolución | `OUT` / `REFUND` |
| Sacar dinero | Otro (nota obligatoria) | `OUT` / `OTHER` |

El contrato del servidor no cambia. El mapeo vive en `src/lib/cash-movement-reasons.ts`, con tests.

### Corte de caja (a ciegas)

1. **Contar efectivo.** El contador de billetes y monedas va en la misma pantalla: cada denominación tiene − / + y un campo editable. También se puede elegir "Escribir el total" con el keypad.
2. **Tarjeta y otros.** Solo aparecen los métodos que tuvieron cobros. Si no hubo ninguno, se avisa: "no hay nada más que contar".
3. **Pendientes.** Si todo está cobrado, se ve "Todo está cobrado" en verde. Si no, aparece un aviso ámbar con los folios y el botón "Volver y cobrarlos". La casilla **Omitir y cerrar igual** lo explica en palabras simples: "Esos pedidos no se borran ni se dan por cobrados: quedan anotados en este corte como pendientes".
4. **Confirmar.** Muestra lo que se declara, el keypad del **Fondo que queda** y **Sacar de la caja $X**. El botón final es "Guardar corte y cerrar caja", y luego lleva al detalle del corte.

Lo esperado **nunca** se muestra antes de guardar. El precheck no lo trae y la franja muestra "Cobrado en efectivo", no "En el cajón", cuando `can_see_expected` es falso.

## Color e iconos

| Significado | Token | Icono (lucide) | Dónde |
|---|---|---|---|
| Cobrar, entra dinero, pagado, éxito | `money-in` (verde) | `Wallet`, `Banknote`, `ArrowDownToLine`, `CircleCheck`, `Check` | Botón Cobrar, Vuelto, Meter dinero, Pagado ✓, Abrir caja |
| Sale dinero, faltante, destructivo | `money-out` (rojo) | `ArrowUpFromLine`, `CircleMinus`, `Trash2` | Sacar dinero, Falta $X, Sacar de la caja, Descartar |
| Pendiente, atención | `attention` (ámbar) | `Clock`, `AlertTriangle`, `KeyRound` | Por cobrar, Pendiente, pedidos sin cobrar, Caja cerrada |
| Información neutra | `info` (azul) | `Info`, `CreditCard`, `Landmark` | Tarjeta, Transferencia, avisos de ayuda |
| Navegación, paso actual | `foreground` | `ArrowLeft`, `ChevronRight`, números de paso | Selección, Atrás, paso activo |
| Acción de marca | `primary` | `Plus` | Nuevo pedido |

Iconos de lugar: `UtensilsCrossed` para mesa, `ShoppingBag` para llevar, `Bike` para domicilio y `Store` para comer en el local.

## Componentes

| Componente | Archivo | Qué hace |
|---|---|---|
| `CashWorkspace` | `cash/_components/cash-workspace.tsx` | Arma la franja, los dos paneles, la selección, la guía y los diálogos |
| `BillQueue` | `cash/_components/bill-queue.tsx` | Lista Por cobrar, con un reloj que se actualiza por minuto |
| `CheckoutPanel` + pasos | `cash/_components/checkout/*` | Cobro en 4 pasos (también dentro de `ChargeSheet`) |
| `NewOrderFlow`, `OrderBuilder` | `cash/_components/new-order/*` | Elección del tipo y constructor (cargado con `next/dynamic`) |
| `CashFlowDialog` | `cash/_components/cash-flow-dialog.tsx` | Meter y Sacar dinero |
| `CashCutWizard` | `cash/_components/cash-cut-wizard.tsx` | Corte guiado a ciegas |
| `OpenCashGate` | `cash/_components/open-cash-gate.tsx` | Abrir caja |

Lógica pura (con tests): `lib/split-progress.ts` (quién pagó en partes iguales), `lib/keypad.ts`, `lib/cash-movement-reasons.ts` y `lib/bill-queue.ts`.

Acciones nuevas, solo lecturas: `lib/actions/order-builder.ts`, con `getOrderBuilderData` (carta, variantes y mesas, sin `qr_token`) y `getTableOrderTarget` (el pedido vigente de la mesa, que necesita `addTicket`). No hay migraciones ni RPC nuevas.

## Sistema de diseño para el resto de módulos

Hoy, Pedidos, Cocina, Mesas, Disponibilidad, Ventas, Carta, Reportes, Personal, Configuración y la carta QR se van a rediseñar con este mismo lenguaje. Las piezas ya son compartidas.

### Tokens (`src/styles/tokens.css` y `src/styles/themes/admin.css`)

- `money-in`, `money-out`, `attention` e `info`. Cada uno trae relleno, `-foreground`, `-soft`, `-soft-foreground` y `-border`, y Tailwind los expone como `bg-money-in`, `text-money-out-soft-foreground`, `border-attention-border`, etc.
- **Son fijos.** No salen de `--primary`: la marca puede ser verde, azul o negra, y "entra dinero" sigue siendo verde.
- Reglas:
  - `money-in` solo cuando el dinero entra o algo quedó bien;
  - `money-out` solo cuando el dinero sale, falta algo o la acción es destructiva;
  - `attention` para lo pendiente;
  - `info` para datos neutros;
  - `primary` (la marca) solo para la acción de inicio de un módulo, como "Nuevo pedido".
- No usar `success`/`destructive` de shadcn para dinero: quedan para el resto del panel mientras se migra.

### Primitivas (`src/components/shared/`)

| Primitiva | Úsala para | Reglas |
|---|---|---|
| `pos-tone.ts` (`toneSoft`, `toneSolid`, `toneText`, `toneBar`, `posPressable`) | Pintar un estado o un botón táctil | Siempre con icono y texto. `posPressable` da la presión (`scale .97`), el foco visible y respeta `prefers-reduced-motion` |
| `StatusStrip`, `StatusPill`, `StatusMetric` | La primera línea de cada módulo: estado, 2 o 3 cifras y acciones rápidas | Una sola franja por pantalla. Las cifras son las que deciden la siguiente acción, no adornos |
| `ChoiceCards` | Preguntar "¿qué quieres hacer?" con 2 a 4 opciones | Es un radiogroup real (flechas, check visible). Cada opción lleva icono, título y una línea de explicación. No sirve para listas largas |
| `AmountKeypad` | Cualquier monto en el POS | El valor es texto (`lib/keypad.ts`) y se convierte con `keypadToNumber`. Los atajos (`quick`) reemplazan lo escrito. Acepta el teclado físico |
| `StepIndicator` | Flujos que son secuencias de verdad | Pasos numerados. Los hechos se pueden volver a abrir; los pendientes no se saltan |
| `PersonChips` | Repartos entre personas (cuentas, propinas) | Estado con icono y texto: Pagado / Cobrando / Pendiente |
| `MoneyFlowChip` | Motivos de un movimiento de dinero | La dirección (`in`/`out`) manda el color. Nunca se mezclan entradas y salidas en un mismo grupo |
| `EmptyState` (prop `action`) | Listas vacías | El vacío invita a actuar ("Toma un pedido nuevo"), no a tranquilizar |

### Reglas de interacción

- **Medidas:** objetivos táctiles de 48 px como mínimo y 56 px en la acción principal, con 8 px o más entre botones.
- **Una acción primaria por pantalla**, en el pie y a ancho completo en teléfono.
- **Movimiento:** solo `transform` y `opacity`, de 150 a 200 ms con ease-out. `animate-pos-step` para cambiar de paso y `animate-pos-pop` para la confirmación. No se anima lo que se repite cientos de veces por día. Todo se apaga con `motion-reduce`.
- **Rendimiento:**
  - Lo pesado se carga al abrirse (`next/dynamic` o una server action al montar).
  - La lista se actualiza al instante con lo que devuelve la acción (UI optimista solo en la lectura). Nunca se adivina dinero: los montos los calcula la base.
  - Sin dependencias nuevas, sin framer-motion y sin goey-toast en estas pantallas.
- **Accesibilidad:** foco visible (`ring-3`), `aria-live` en saldo, vuelto y montos, `aria-pressed` y `aria-checked` en las selecciones. Ninguna acción importante queda detrás de un scroll: el pie de cada paso es fijo.
- **Texto:** español neutro (Ecuador, USD), con verbos en el botón ("Cobrar $5,00", "Sacar $10,00") y la misma palabra en el aviso que sigue ("Salieron $10,00 · Gasto").

## Capturas

Pendientes: el servidor de desarrollo local no pudo usar el `.env.local` del checkout principal, porque copiarlo al worktree quedó bloqueado por permisos. Se toman con el preview de Vercel y la cuenta owner de `monky-qa`, y se guardan en `docs/design/caja-redesign/`:
`01-caja-inicio`, `02-tipo-pedido`, `03-constructor`, `04-partes-iguales`, `05-meter-dinero`, `06-sacar-dinero`, `07-corte-1` … `10-corte-4` (1280×800 y 390×844).
