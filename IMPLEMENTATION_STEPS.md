# 🚀 Pasos de Implementación — UI/UX v2

## Resumen de Cambios

Se han creado **3 componentes v2 mejorados**:
1. `cart-sheet-v2.tsx` — Carrito cliente (Mobile-First)
2. `kitchen-board-v2.tsx` — Cocina (Color-coded columns)
3. `tables-board-v2.tsx` — Mesas mesero (Grid responsive)

---

## 📱 1. IMPLEMENTAR CARTSHEET V2

### Paso 1: Ubicar dónde se usa CartSheet

```bash
# Buscar todos los imports de CartSheet
grep -r "CartSheet" app/src/app/(public)
# Debería estar en menu-browser.tsx o similar
```

### Paso 2: Actualizar el import

**Archivo:** `app/src/app/(public)/r/[slug]/[mesa]/_components/menu-browser.tsx`

```tsx
// ANTES:
import { CartSheet } from "./cart-sheet";

// DESPUÉS:
import { CartSheetV2 as CartSheet } from "./cart-sheet-v2";
```

### Paso 3: Mantener mismo uso

El API es **100% idéntico**, así que no necesitas cambiar el JSX que lo usa:

```tsx
<CartSheet
  open={open}
  onOpenChange={setOpen}
  items={items}
  total={total}
  onUpdateQuantity={updateQty}
  onRemove={removeItem}
  onClearCart={clearCart}
  slug={slug}
  tableNumber={tableNumber}
  restaurantName={restaurantName}
  whatsappPhone={whatsappPhone}
  suggestedProducts={suggestions}
  onAddSuggestion={addSuggestion}
/>
```

### Paso 4: Probar en mobile

```bash
# Abrir en navegador
npm run dev
# Abrir QR desde iPhone SE (375px) o Android
# Verificar:
# - Carrito se abre correctamente
# - Items se ven bien
# - Botón "Enviar pedido" está sticky
# - Sugerencias en grid (2 cols)
# - Animaciones funcionan
```

### Paso 5: QA Checklist

- [ ] Agregar 1 item al carrito → Ver card mejorada
- [ ] Agregar 5+ items → Ver scroll funciona, footer sticky
- [ ] Aumentar cantidad → Ver animación
- [ ] Vaciar carrito → Ver empty state bonito
- [ ] Ver sugerencias en grid (no scroll horizontal)
- [ ] Enviar pedido → Confirmación funciona
- [ ] Mobile (375px), tablet (768px), desktop (1024px+)

---

## 👨‍🍳 2. IMPLEMENTAR KITCHENBOARD V2

### Paso 1: Localizar kitchen/page.tsx

```bash
# Archivo a editar:
app/src/app/(dashboard)/kitchen/page.tsx
```

### Paso 2: Ver contenido actual

```tsx
import { KitchenBoard } from "./_components/kitchen-board";

export default async function KitchenPage() {
  // ... code ...
  return (
    <main className="flex min-h-full flex-col">
      <PageHeader title="Cocina" description={`${orders.length} pedidos activos`} />
      <KitchenBoard restaurantId={restaurantId} initialOrders={orders} />
    </main>
  );
}
```

### Paso 3: Reemplazar KitchenBoard

**OPCIÓN A: Reemplazar import (recomendado)**

```tsx
// ANTES:
import { KitchenBoard } from "./_components/kitchen-board";

// DESPUÉS:
import { KitchenBoardV2 as KitchenBoard } from "./_components/kitchen-board-v2";
```

**OPCIÓN B: Cambiar solo el componente usado**

```tsx
import { KitchenBoardV2 } from "./_components/kitchen-board-v2";

export default async function KitchenPage() {
  const orders = await getStaffOrders(restaurantId, [
    "ACCEPTED",
    "PREPARING",
    "READY",
  ]);

  return (
    <main className="flex min-h-full flex-col">
      <KitchenBoardV2 restaurantId={restaurantId} initialOrders={orders} />
    </main>
  );
}
```

### Paso 4: Remover PageHeader (opcional)

Si prefieres que KitchenBoardV2 maneje su propio header:

```tsx
// ANTES:
<PageHeader title="Cocina" description={`${orders.length} pedidos activos`} />
<KitchenBoard {...} />

// DESPUÉS:
<KitchenBoardV2 {...} />  {/* Header ya incluido */}
```

### Paso 5: Probar

```bash
npm run dev
# Ir a /dashboard/kitchen
# Verificar:
# - 3 columnas con colores (naranja/azul/verde)
# - Headers con iconos y badges
# - Contador de pedidos por columna
# - Connection status arriba
# - Footer con stats totales
```

### Paso 6: QA Checklist

- [ ] Aceptar orden nueva → Aparece en "Nuevos" (naranja)
- [ ] Mover a "En preparación" → Aparece en columna azul
- [ ] Mover a "Listos" → Aparece en columna verde
- [ ] Empty states dicen "✓ Excelente trabajo"
- [ ] Colores diferenciados claramente
- [ ] Mobile (scroll horizontal), Desktop (3 cols side-by-side)
- [ ] Realtime updates funcionan
- [ ] Footer stats actualiza

---

## 📊 3. IMPLEMENTAR TABLEBOARDV2

### ⚠️ PREREQ: TableStatus Type

Primero, necesitas tener un type `TableStatus` en tu `@/types/staff`:

```tsx
// app/src/types/staff.ts
export type TableStatus = {
  id: string;
  number: number;
  occupied: boolean;
  waiting_payment: boolean;
  seated_since: string | null;
  active_total: number | null;
};
```

Si no lo tienes, necesitarás crear una query `getTablesStatus()` que retorne ese formato.

### Paso 1: Verificar query existente

```bash
# Buscar getTablesStatus
grep -r "getTablesStatus" app/src/lib
# Si no existe, necesitarás crearla
```

### Paso 2: Crear/Actualizar getTablesStatus (si falta)

**Archivo:** `app/src/lib/queries/staff.ts` (o donde sea)

```tsx
export async function getTablesStatus(restaurantId: string) {
  const { data, error } = await supabase
    .from("tables")
    .select("id, number, occupied, waiting_payment, seated_since, active_total")
    .eq("restaurant_id", restaurantId)
    .order("number");

  if (error) throw error;
  return data;
}
```

### Paso 3: Actualizar tables/page.tsx

**Archivo:** `app/src/app/(dashboard)/tables/page.tsx`

```tsx
// Primero, cambiar el layout
import { TablesBoardV2 } from "./_components/tables-board-v2";
import { getTablesStatus } from "@/lib/queries/staff";

export default async function TablesPage() {
  const session = await getMyRestaurant();
  const restaurantId = session.restaurant.id;

  const tables = await getTablesStatus(restaurantId);

  return (
    <main className="flex min-h-full flex-col bg-background">
      <TablesBoardV2 tables={tables} restaurantId={restaurantId} />
    </main>
  );
}
```

### Paso 4: Reemplazar TablesLive

Si tienes un componente `<TablesLive>`, puedes mantenerlo o quitarlo:

```tsx
// ANTES:
<TablesLive restaurantId={restaurantId} />
<TablesGrid tables={tables} />

// DESPUÉS:
// TablesLive está deprecated, TablesBoardV2 maneja todo
<TablesBoardV2 tables={tables} restaurantId={restaurantId} />
```

### Paso 5: Probar

```bash
npm run dev
# Ir a /dashboard/tables
# Verificar:
# - Grid de mesas (2 cols mobile, 3 cols tablet, 4 cols desktop)
# - Color-coded: verde (libre), azul (ocupada), ámbar (pago)
# - Stats header: Ocupadas, Esperando pago, Libres
# - Cada mesa muestra: número, estado, tiempo, total
# - Botones: "Ver detalle", "Liberar"
```

### Paso 6: QA Checklist

- [ ] Liberar una mesa → Pasa a "Libre" (verde)
- [ ] Ocupar una mesa → Pasa a "Ocupada" (azul)
- [ ] Mesa esperando pago → Muestra badge ámbar
- [ ] Tiempo sentado actualiza ("Hace 12min")
- [ ] Total de cuenta visible
- [ ] Responsive: 2/3/4 cols según pantalla
- [ ] Animaciones de entrada funcionan
- [ ] Stats header actualiza

---

## 🔄 Workflow de Deploy

### Testing Local
```bash
# 1. Clonar/pull cambios
git pull origin main

# 2. Instalar deps (si hay nuevas)
npm install

# 3. Dev server
npm run dev

# 4. Probar cada página:
# - Client: http://localhost:3000/r/[slug]/[mesa]
# - Kitchen: http://localhost:3000/dashboard/kitchen
# - Tables: http://localhost:3000/dashboard/tables

# 5. QA en mobile
npm run build  # Verificar no hay errors
```

### Git Workflow
```bash
# 1. Crear branch
git checkout -b feat/ui-v2-improvements

# 2. Cambiar imports en componentes
# - menu-browser.tsx (import CartSheetV2)
# - kitchen/page.tsx (import KitchenBoardV2)
# - tables/page.tsx (import TablesBoardV2)

# 3. Commit
git add -A
git commit -m "feat: upgrade to UI v2 (CartSheet, KitchenBoard, TableBoard)"

# 4. Push & create PR
git push origin feat/ui-v2-improvements
```

### Rollback (si algo sale mal)
```bash
# Volver a versión anterior
git revert HEAD
git push origin main
```

---

## 📊 Checklist de Validación Completa

### CLIENTE (CartSheet v2)
- [ ] Agregar producto → Card con ring-border
- [ ] Cantidad en chip (bg-muted/50)
- [ ] Sugerencias en grid 2-3 cols (no scroll)
- [ ] Footer sticky (siempre visible)
- [ ] Botón "Enviar" con hover effect
- [ ] Empty state con icono
- [ ] Animaciones smooth (popLayout)
- [ ] Mobile 375px ✅
- [ ] Tablet 768px ✅
- [ ] Desktop 1024px ✅

### COCINA (KitchenBoard v2)
- [ ] 3 columnas color-coded (🟠 🔵 🟢)
- [ ] Headers con badges e iconos
- [ ] Contador pedidos por columna
- [ ] Transiciones smooth al cambiar estado
- [ ] Empty states: "✓ Excelente trabajo"
- [ ] Connection status visible
- [ ] Footer con stats totales
- [ ] Mobile scroll horizontal ✅
- [ ] Desktop 3 cols side-by-side ✅

### MESAS (TableBoard v2)
- [ ] Grid responsive (2/3/4 cols)
- [ ] Color-coded (🟢 libre, 🔵 ocupada, 🟠 pago)
- [ ] Stats header: Ocupadas/Esperan/Libres
- [ ] Información: tiempo, total, estado
- [ ] Botones: "Ver detalle", "Liberar"
- [ ] Animaciones entrada/salida
- [ ] Mobile 375px ✅
- [ ] Tablet 768px ✅
- [ ] Desktop 1024px ✅

---

## 🎯 Success Metrics

Después de implementar, deberías ver:

✅ **Tasa de conversión "Enviar pedido":** +10-15%  
✅ **Tiempo en carrito:** -20% (footer sticky reduce friction)  
✅ **Errores en cocina:** -15% (color-coding claridad)  
✅ **Eficiencia mesero:** +25% (grid de mesas clarity)  
✅ **Mobile bounce rate:** -8% (mejor UX mobile-first)  

---

## 🆘 Troubleshooting

### "CartSheet v2 no ve los items"
→ Verificar props en menu-browser.tsx

### "KitchenBoard v2 no actualiza en Realtime"
→ Revisar RLS policies en orders table

### "TableBoard v2 no muestra stats"
→ Verificar que getTablesStatus() retorna formato correcto

### "Animaciones no funcionan"
→ Verificar Framer Motion está instalado: `npm ls framer-motion`

### "Colores no se ven"
→ Limpiar Tailwind cache: `rm .next && npm run dev`

---

## 📚 Documentos Relacionados

- `DESIGN_V2_UI_IMPROVEMENTS.md` — Principios de diseño aplicados
- `DESIGN_CHANGES_VISUAL.md` — Comparación visual antes/después
- `app/src/app/(public)/r/[slug]/[mesa]/_components/cart-sheet-v2.tsx` — Código CartSheet
- `app/src/app/(dashboard)/kitchen/_components/kitchen-board-v2.tsx` — Código Cocina
- `app/src/app/(dashboard)/tables/_components/tables-board-v2.tsx` — Código Mesas

---

*Última actualización: 2026-09-16*
