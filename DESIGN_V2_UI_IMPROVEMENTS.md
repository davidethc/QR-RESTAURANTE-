# UI/UX v2 — Mejoras de Diseño y Experiencia

**Fecha:** 2026-09-16  
**Scope:** Cliente (Carrito), Mesero (Mesas), Cocina (Pedidos)  
**Principios:** Mobile-First Design, Frontend Design Patterns, Emotional Design

---

## 📱 1. CARRITO DEL CLIENTE (CartSheet v2)

### Mejoras Implementadas

#### **Visual Hierarchy**
- ✅ Header fijo con contador de items
- ✅ Items con mejor layout: nombre grande, precio destacado (color primary)
- ✅ Cantidad en grupo visual (bg-muted/50) separada de controles
- ✅ Card de item con ring-border para mejor definición

#### **Interactividad**
- ✅ Animaciones smooth con Framer Motion (popLayout)
- ✅ Botones de cantidad en grupo compacto (8px padding)
- ✅ Hover effects en sugerencias (scale + color)
- ✅ Micro-interactions en botón de envío (whileHover, whileTap)

#### **Layout**
- ✅ Footer sticky — total y botón siempre visibles
- ✅ Sugerencias en grid (2 cols mobile, 3 cols desktop) en lugar de scroll horizontal
- ✅ Empty state atractivo con icono y copy clara
- ✅ Separación clara: content/sugerencias/footer

#### **Mobile-First**
- ✅ Touch-friendly: botones mín 44x44px
- ✅ Cantidad visible en chip animado
- ✅ Máx. 2 columnas en mobile, 3 en desktop para sugerencias
- ✅ Padding y espaciado 8pt grid

### Uso

```tsx
// Reemplazar import en menu-browser.tsx o donde uses CartSheet
import { CartSheetV2 as CartSheet } from "./_components/cart-sheet-v2";

// El API es idéntico — no cambia nada
<CartSheet
  open={open}
  onOpenChange={setOpen}
  items={items}
  total={total}
  // ... resto de props
/>
```

---

## 👨‍🍳 2. COCINA (KitchenBoard v2)

### Mejoras Implementadas

#### **Visual Design**
- ✅ Columnas con fondo tintado (orange/blue/green) + borders de 2px
- ✅ Header con icono en badge de color
- ✅ Contador visual de pedidos por columna
- ✅ Grid responsive: 1 col mobile, 3 cols desktop

#### **Información Clara**
- ✅ Header de página con stats (total activos)
- ✅ Cada columna con color distinct + icono significativo
- ✅ Footer con resumen de estados (nuevos/en cocina/listos)
- ✅ Empty states mejorados: "✓ Excelente trabajo"

#### **Usabilidad**
- ✅ Transiciones suaves entre estados
- ✅ Connection status visible arriba
- ✅ Mejor legibilidad en tablets (lg:p-6)
- ✅ Cards de pedidos con mejor spacing

### Uso

```tsx
// En kitchen/page.tsx
import { KitchenBoardV2 as KitchenBoard } from "./_components/kitchen-board-v2";

export default async function KitchenPage() {
  const orders = await getStaffOrders(restaurantId, statuses);
  return (
    <main className="flex min-h-full flex-col">
      <KitchenBoardV2 restaurantId={restaurantId} initialOrders={orders} />
    </main>
  );
}
```

---

## 📊 3. MESAS DEL MESERO (TableBoard v2)

### Mejoras Implementadas

#### **Cards Grid Inteligente**
- ✅ Grid 2 cols (mobile) → 3 cols (md) → 4 cols (lg)
- ✅ Cada mesa es una card visual clara
- ✅ Color-coded por estado: libre (verde), ocupada (azul), pago (ámbar)

#### **Información Visual**
- ✅ Mesa grande (text-2xl) + estado en badge
- ✅ Tiempo sentado ("Hace 12min")
- ✅ Monto total activo ($XX.XX)
- ✅ Indicadores: Pago pendiente, Sin órdenes, etc.

#### **Contexto General**
- ✅ Header con 3 stats principales: Ocupadas/Esperando pago/Libres
- ✅ Animaciones de entrada/salida
- ✅ Botones de acción (Ver detalle, Liberar)

#### **Responsive**
- ✅ Thumb zone respetada (botones en zona inferior)
- ✅ Padding adaptativo por breakpoint
- ✅ Iconografía clara (Users, Clock, DollarSign, etc.)

### Uso

```tsx
// En tables/page.tsx (necesitas adaptar getTablesStatus)
import { TablesBoardV2 as TablesBoard } from "./_components/tables-board-v2";

export default async function TablesPage() {
  const tables = await getTablesStatus(restaurantId);
  return (
    <main className="flex min-h-full flex-col">
      <TablesBoardV2 tables={tables} restaurantId={restaurantId} />
    </main>
  );
}
```

---

## 🎨 Principios de Diseño Aplicados

### Mobile App UI/UX Design
1. **Peak-End Rule** — Moment más importante es la confirmación de pedido (botón destacado)
2. **Personalization** — Carrito responde al estado (en mesa vs. fuera)
3. **Visual Hierarchy** — Precio > Cantidad > Nombre (en cards)
4. **Empty States** — No son vacios, son invitaciones a actuar
5. **Micro-interactions** — Animaciones que responden a acciones

### Frontend Design
1. **Typography** — Font display para titulares, sans para body
2. **Color System** — Primary para acciones, muted para secondary
3. **Spacing** — 8pt grid (4px/8px/12px/16px/24px/32px)
4. **Motion** — Sparingly (no todo tiene animation)
5. **Restraint** — Un elemento memorable por sección

---

## 🔄 Checklist de Integración

### 1. CartSheet
- [ ] Reemplazar import en `menu-browser.tsx`
- [ ] Verificar que formatPrice y notify funcionen
- [ ] Probar en mobile (375px width)
- [ ] Validar estados: empty, con items, con sugerencias
- [ ] Testing: agregar/quitar/enviar pedido

### 2. KitchenBoard
- [ ] Actualizar import en `kitchen/page.tsx`
- [ ] Verificar RLS policies en Realtime
- [ ] Testing: agregar orden, cambiar estado
- [ ] Validar responsive (mobile/tablet/desktop)

### 3. TableBoard
- [ ] Necesita: `getTablesStatus()` retorna `TableStatus[]`
- [ ] Campos requeridos: `id`, `number`, `occupied`, `waiting_payment`, `seated_since`, `active_total`
- [ ] Integrar en `tables/page.tsx`
- [ ] Testing: liberar mesa, ver pago

---

## 📐 Valores de Diseño Usados

### Colors (Tailwind v4)
- **Primary:** Para CTAs y acciones (botón "Enviar")
- **Primary/10:** Backgrounds claros
- **Primary/50:** Hover states
- **Muted:** Secondary backgrounds (sugerencias, cantidad)
- **Destructive:** Para acciones destructivas (Quitar, Liberar)

### Typography
- **Font Display:** Títulos y números grandes
- **Font Mono:** Cantidades (tabular-nums)
- **Font Base:** Body text

### Spacing (8pt grid)
- Gap: 2px, 3px, 4px, 6px, 8px, 12px, 16px, 24px
- Padding: 12px (py-3), 16px (py-4), 24px (py-6)
- Rounded: 2xl (16px), 3xl (24px)

### Shadows
- Soft shadows para cards (no harsh)
- Border rings para definición (ring-1 ring-border/50)

---

## 🚀 Siguientes Pasos

1. **Validación QA:** Testing en devices reales (iPhone, Android)
2. **Performance:** Audit con Lighthouse
3. **Accesibilidad:** WCAG 2.2 compliance
4. **Analytics:** Trackear "Enviar pedido" conversion
5. **A/B Testing:** Comparar CartSheet vs CartSheetV2

---

## 📝 Notas de Desarrollo

- Todas las versiones usan **Framer Motion** para animaciones
- Compatible con **Tailwind CSS** v3/v4
- Requiere **shadcn/ui** components (Button, Sheet, etc.)
- **Lucide Icons** para consistencia visual
- Mobile-first Responsive: 375px (SE) → 1440px (desktop)

---

*Diseño aplicando Mobile App UI/UX Design Skill + Frontend Design Skill (Anthropic)*
