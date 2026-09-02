# QR-RESTAURANTE — Monky.com

Menú digital por QR para restaurantes: el cliente escanea, ve la carta y pide desde su mesa; el mesero y la cocina reciben el pedido en tiempo real.

Primer restaurante en producción: **Cafetería Omm Siri**.

## Estructura

```
monky.com/
├── app/                 # Next.js 16 + TypeScript + Supabase — el producto
│   ├── src/app/         # Rutas (cliente, mesero, cocina, admin)
│   ├── src/lib/actions/ # Server Actions (envoltorios delgados sobre RPCs)
│   ├── src/components/  # ui/ (shadcn) + shared/ (piezas reutilizables)
│   └── src/types/       # Tipos generados desde la base + tipos de dominio
├── raw/                 # Fuentes originales de UX/negocio (inmutables)
├── wiki/                # Wiki de contexto del proyecto (Obsidian)
├── CLAUDE.md            # Reglas del proyecto para trabajar con Claude
└── README.md            # Este archivo
```

## Arquitectura

La lógica de negocio vive en PostgreSQL (funciones `SECURITY DEFINER` en Supabase), no en el código de la aplicación. El cliente nunca decide un precio, un permiso ni una transición de estado — todo pasa por RPCs validados y Row Level Security. El código de Next.js solo pinta pantallas y llama a esas funciones.

```
CLIENTE (móvil) / STAFF (tablet)
        ↓
   Next.js 16 — Server Components + Server Actions
        ↓
   Supabase — RPC → validación → RLS → Realtime
```

Detalle completo de decisiones y estado de cada fase en `wiki/` y en el plan de construcción del proyecto.

## Desarrollo

```bash
cd app
npm install
npm run dev
```

Requiere un `app/.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (no se versiona).

## Wiki del proyecto

`wiki/` es un vault de Obsidian con la documentación de negocio, UX y arquitectura, mantenida junto con el código. Ver `wiki/index.md` para el catálogo completo y `CLAUDE.md` para las reglas de mantenimiento del wiki.
