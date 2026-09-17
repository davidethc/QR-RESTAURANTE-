# ⚡ Quick Start — UI/UX v2 (5 min)

## 📦 Lo que recibiste

3 componentes nuevos + 4 documentos:

```
Componentes (listos para usar):
├── cart-sheet-v2.tsx        (cliente)
├── kitchen-board-v2.tsx     (cocina)
└── tables-board-v2.tsx      (mesas)

Documentación:
├── DESIGN_V2_UI_IMPROVEMENTS.md (técnico)
├── DESIGN_CHANGES_VISUAL.md (comparación)
├── IMPLEMENTATION_STEPS.md  (paso a paso)
├── UI_V2_README.md          (resumen)
└── QUICK_START.md           (este archivo)
```

---

## 🎯 En 3 Pasos

### 1️⃣ Entender qué cambió

**CartSheet:** Botón pegado, sugerencias en grid, footer sticky  
**KitchenBoard:** Colores (naranja/azul/verde), badges claros  
**TableBoard:** Grid de mesas, color-coded, stats header

### 2️⃣ Actualizar imports (3 líneas)

```tsx
// File 1: menu-browser.tsx
- import { CartSheet } from "./cart-sheet";
+ import { CartSheetV2 as CartSheet } from "./cart-sheet-v2";

// File 2: kitchen/page.tsx
- import { KitchenBoard } from "./_components/kitchen-board";
+ import { KitchenBoardV2 as KitchenBoard } from "./_components/kitchen-board-v2";

// File 3: tables/page.tsx
- <KitchenBoard ... />
+ <KitchenBoardV2 ... />
```

### 3️⃣ Probar en local

```bash
npm run dev
# Prueba en 3 pantallas:
# - Mobile (375px): iPhone SE
# - Tablet (768px): iPad
# - Desktop (1440px): Monitor
```

---

## ✅ Validación Rápida (5 min)

| Pantalla | Qué revisar |
|----------|-----------|
| **Cliente** | Botón "Enviar" visible, sugerencias en grid |
| **Cocina** | 3 columnas colores (🟠🔵🟢) |
| **Mesas** | Grid de cards, stats arriba |

---

## 📚 Documentación Completa

Si necesitas más detalles:

| Doc | Para qué |
|-----|----------|
| `UI_V2_README.md` | Resumen ejecutivo (5 min lectura) |
| `DESIGN_CHANGES_VISUAL.md` | Ver antes/después con diagramas |
| `IMPLEMENTATION_STEPS.md` | Pasos detallados con código |
| `DESIGN_V2_UI_IMPROVEMENTS.md` | Principios de diseño aplicados |

---

## 🚀 Deploy Checklist

- [ ] Cambiar 3 imports
- [ ] npm run dev
- [ ] Probar en mobile/tablet/desktop
- [ ] Commit + push
- [ ] Deploy

**Tiempo total:** ~20 minutos

---

## 🆘 Si algo no funciona

**"CartSheet no se ve bien"**  
→ Revisar: ¿Todos los props están?

**"Cocina no actualiza"**  
→ Revisar: ¿RLS policies correctas?

**"Mesas no muestran"**  
→ Revisar: ¿TableStatus type existe?

→ Ver: `IMPLEMENTATION_STEPS.md` sección "Troubleshooting"

---

## 🎯 Success = ?

Después de integrar verás:
✅ Botón "Enviar" siempre visible (carrito)
✅ Columnas coloreadas (cocina)
✅ Grid de mesas responsive (mesero)
✅ Animaciones smooth en todas partes
✅ Mejor mobile experience

---

**Next:** Leer `UI_V2_README.md` para full context  
**Luego:** Seguir `IMPLEMENTATION_STEPS.md` para integración paso a paso
