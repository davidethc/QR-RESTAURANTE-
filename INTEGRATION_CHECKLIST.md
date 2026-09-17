# ✅ Checklist de Integración — UI/UX v2

**Duración:** ~20-30 minutos  
**Dificultad:** Muy fácil (solo cambiar imports)  
**Riesgo:** Bajo (puedes revertir en 2 minutos)

---

## 📋 Antes de Empezar

- [ ] Leer `QUICK_START.md` (5 min)
- [ ] Tener 3 archivos v2 en el proyecto:
  - `cart-sheet-v2.tsx`
  - `kitchen-board-v2.tsx`
  - `tables-board-v2.tsx`
- [ ] Verificar que `npm run dev` funciona actualmente

---

## 🚀 PASO 1: Actualizar CartSheet (5 min)

**Archivo a modificar:** `app/src/app/(public)/r/[slug]/[mesa]/_components/menu-browser.tsx`

### Tarea 1.1: Cambiar import
```tsx
// Buscar esta línea (aprox. línea ~20-30):
import { CartSheet } from "./cart-sheet";

// Reemplazar con:
import { CartSheetV2 as CartSheet } from "./cart-sheet-v2";
```

- [ ] Cambio hecho
- [ ] No hay errores en editor

### Tarea 1.2: Verificar en navegador
```bash
npm run dev
# Abrir: http://localhost:3000/r/[slug]/[mesa]
```

- [ ] Carrito abre correctamente
- [ ] Items se ven bien
- [ ] Botón "Enviar" está sticky (abajo)
- [ ] Sugerencias en grid (2 columnas en mobile)
- [ ] No hay console errors

---

## 🚀 PASO 2: Actualizar KitchenBoard (5 min)

**Archivo a modificar:** `app/src/app/(dashboard)/kitchen/page.tsx`

### Tarea 2.1: Cambiar import
```tsx
// Buscar esta línea:
import { KitchenBoard } from "./_components/kitchen-board";

// Reemplazar con:
import { KitchenBoardV2 as KitchenBoard } from "./_components/kitchen-board-v2";
```

- [ ] Cambio hecho
- [ ] No hay errores en editor

### Tarea 2.2: Remover PageHeader (opcional)
Si ya no lo necesitas:
```tsx
// ANTES:
<PageHeader title="Cocina" description={...} />
<KitchenBoard ... />

// DESPUÉS:
<KitchenBoardV2 ... />  // Header ya incluido
```

- [ ] PageHeader removido (opcional)

### Tarea 2.3: Verificar en navegador
```bash
# Cocina debería verse así:
# - Header con stats
# - 3 columnas: Nuevos (naranja), En prep (azul), Listos (verde)
# - Cards con pedidos
# - Footer con stats
```

- [ ] Tres columnas color-coded visibles
- [ ] Headers con iconos y badges
- [ ] Contadores actualizados
- [ ] No hay console errors

---

## 🚀 PASO 3: Actualizar TableBoard (5 min)

**Archivo a modificar:** `app/src/app/(dashboard)/tables/page.tsx`

### Tarea 3.1: Verificar getTablesStatus
Antes de cambiar nada, verificar que existe:
```bash
grep -n "getTablesStatus" app/src/lib/queries/staff.ts
```

- [ ] getTablesStatus existe
- [ ] Retorna array de TableStatus

**Si no existe:**
Crear función:
```tsx
// En app/src/lib/queries/staff.ts
export async function getTablesStatus(restaurantId: string) {
  const { data } = await supabase
    .from("tables")
    .select("id, number, occupied, waiting_payment, seated_since, active_total")
    .eq("restaurant_id", restaurantId);
  return data;
}
```

- [ ] getTablesStatus existe y funciona

### Tarea 3.2: Cambiar import
```tsx
// Buscar y cambiar:
- import { KitchenBoard } from "./_components/...";
+ import { TablesBoardV2 } from "./_components/tables-board-v2";
```

- [ ] Cambio hecho

### Tarea 3.3: Actualizar uso
```tsx
// ANTES:
<main className="flex min-h-full flex-col">
  <PageHeader ... />
  <TablesGrid tables={tables} />
  <TablesLive ... />
</main>

// DESPUÉS:
<main className="flex min-h-full flex-col">
  <TablesBoardV2 tables={tables} restaurantId={restaurantId} />
</main>
```

- [ ] Cambio hecho

### Tarea 3.4: Verificar en navegador
```bash
# Mesas debería verse así:
# - Header con 3 stats (Ocupadas, Esperan pago, Libres)
# - Grid de mesas en cards
# - Color-coded por estado
# - Info: tiempo, total, botones
```

- [ ] Grid de mesas visible
- [ ] Stats header correcto
- [ ] Color-coding funciona (verde/azul/ámbar)
- [ ] No hay console errors

---

## 🧪 PASO 4: QA Completa (10 min)

### Testing en Cliente (CartSheet)
```bash
# Abre en http://localhost:3000/r/[slug]/[mesa]
```

| Test | Check | Status |
|------|-------|--------|
| Abrir carrito | Abre desde abajo | ☐ |
| Ver items | Items con cards ring | ☐ |
| Agregar item | Card anima entrada | ☐ |
| Aumentar cantidad | Chip cantidad actualiza | ☐ |
| Ver sugerencias | Grid 2-3 cols (no scroll) | ☐ |
| Scroll items | Footer siempre visible | ☐ |
| Enviar pedido | Botón accesible (sticky) | ☐ |
| Mobile (375px) | Se ve bien | ☐ |
| Tablet (768px) | Se ve bien | ☐ |
| Desktop (1440px) | Se ve bien | ☐ |

- [ ] CartSheet tests PASS

### Testing en Cocina (KitchenBoard)
```bash
# Abre en http://localhost:3000/dashboard/kitchen
```

| Test | Check | Status |
|------|-------|--------|
| Header | Muestra "Cocina" + stats | ☐ |
| Columnas | 3 columnas visibles | ☐ |
| Colores | Naranja/Azul/Verde claro | ☐ |
| Badges | Iconos + texto en headers | ☐ |
| Contadores | Muestran cantidad correcta | ☐ |
| Empty state | "✓ Excelente trabajo" | ☐ |
| Pedidos | Cards visibles con info | ☐ |
| Realtime | Updates en tiempo real | ☐ |
| Mobile | Scroll horizontal OK | ☐ |
| Desktop | 3 cols side-by-side | ☐ |

- [ ] KitchenBoard tests PASS

### Testing en Mesas (TableBoard)
```bash
# Abre en http://localhost:3000/dashboard/tables
```

| Test | Check | Status |
|------|-------|--------|
| Header | Stats: Ocupadas/Esperan/Libres | ☐ |
| Grid | 2 cols mobile, 3 tablet, 4 desktop | ☐ |
| Color-code | Verde/Azul/Ámbar visible | ☐ |
| Información | Número, estado, tiempo, total | ☐ |
| Botones | "Ver detalle", "Liberar" | ☐ |
| Animaciones | Entrada suave | ☐ |
| Libre mesa | Verde claro | ☐ |
| Ocupada mesa | Azul claro | ☐ |
| Pago pendiente | Ámbar claro | ☐ |
| Responsive | Se ve bien en 3 tamaños | ☐ |

- [ ] TableBoard tests PASS

---

## 🔍 PASO 5: Browser Console Check

Verificar que no hay errors:

```bash
# Abrir DevTools (F12)
# Ir a Console tab
# Verificar:
```

- [ ] No hay red errors
- [ ] No hay JavaScript errors
- [ ] Warnings son solo deprecation (ok)

---

## 🚨 PASO 6: Rollback Plan (si algo falla)

Si algo no funciona:

```bash
# Opción 1: Revertir imports
git checkout -- app/src/app/(public)/r/[slug]/[mesa]/_components/menu-browser.tsx
git checkout -- app/src/app/(dashboard)/kitchen/page.tsx
git checkout -- app/src/app/(dashboard)/tables/page.tsx

# Opción 2: Full rollback
git revert HEAD
```

- [ ] Plan rollback entendido

---

## ✅ PASO 7: Commit & Push

```bash
# Ver cambios
git status

# Agregar
git add -A

# Commit
git commit -m "feat: upgrade to UI v2 (CartSheet, KitchenBoard, TableBoard)

- CartSheet v2: sticky footer, grid suggestions, better animations
- KitchenBoard v2: color-coded columns, improved UX
- TableBoard v2: responsive grid, better status visualization

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

# Push
git push origin main
```

- [ ] Commit pushed
- [ ] CI/CD passing (si existe)

---

## 📊 PASO 8: Post-Deploy (5 min)

### Monitoring
```bash
# Ver logs de errores
# Verificar no hay errors en producción
```

- [ ] Producción sin errores
- [ ] Users navegando normalmente

### Feedback
- [ ] Pedir feedback a team (UX improvement)
- [ ] Monitor conversión (Enviar pedido)
- [ ] Trackear performance

- [ ] Feedback recolectado

---

## 📈 Success Criteria

✅ **SI VES ESTO = ÉXITO:**

**Cliente:**
- ✅ Botón "Enviar" visible y sticky
- ✅ Sugerencias en grid (no scroll horizontal)
- ✅ Items con animaciones smooth
- ✅ Empty state bonito

**Cocina:**
- ✅ 3 columnas claramente coloreadas
- ✅ Badges con iconos significativos
- ✅ Contadores actualizados
- ✅ Realtime updates funcionan

**Mesas:**
- ✅ Grid responsive (2/3/4 cols)
- ✅ Color-coded por estado
- ✅ Stats header visible
- ✅ Info clara de cada mesa

---

## ⏱️ Timeline

| Paso | Tiempo | Acción |
|------|--------|--------|
| 1 | 5 min | Actualizar CartSheet |
| 2 | 5 min | Actualizar KitchenBoard |
| 3 | 5 min | Actualizar TableBoard |
| 4 | 10 min | QA completa |
| 5 | 2 min | Console check |
| 6 | 1 min | Rollback plan |
| 7 | 3 min | Commit & push |
| 8 | 5 min | Post-deploy check |
| **TOTAL** | **~36 min** | **DONE** |

---

## 🎯 Final Checklist

- [ ] Todos los pasos completados
- [ ] QA en 3 pantallas (mobile/tablet/desktop)
- [ ] Console sin errors
- [ ] Commit pusheado
- [ ] Produción monitoreado
- [ ] Team notificado

---

## 🆘 SOS — Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| **CartSheet no se abre** | ¿Importaste CartSheetV2? ¿Props correctos? |
| **KitchenBoard no ve colors** | ¿Tailwind CSS funcionando? `rm .next && npm run dev` |
| **TableBoard vacío** | ¿getTablesStatus retorna datos? ¿Type correcto? |
| **Console error: "Component not found"** | ¿Copiaste los archivos .tsx? ¿Path correcto? |
| **Animaciones no funcionan** | ¿Framer Motion instalado? `npm ls framer-motion` |

---

**Status:** ✅ Listo para integrar  
**Creado:** 2026-09-16  
**Duración estimada:** 20-30 minutos  
**Dificultad:** Muy fácil ⭐ (solo cambiar imports)
