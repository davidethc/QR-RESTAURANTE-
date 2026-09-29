---
title: "Panel del Admin"
type: "concept"
created: "2026-09-28"
updated: "2026-09-28"
sources: ["raw/assets/MAPA DE PANTALLAS — MVP.md", "raw/assets/Roles y flujo operativo — MVP.md"]
tags: ["admin", "personal", "ventas", "cobro", "navegacion", "diseño"]
aliases: ["panel-del-admin"]
---

# Panel del Admin

Lo que el dueño (OWNER) y el administrador (ADMIN) pueden hacer sin entrar a Supabase. Construido el 2026-09-28 a partir de la pregunta "si fueras el admin, ¿qué mejorarías?".

## Navegación

- **Barra** (uso diario): Hoy · Pedidos · Cocina · Mesas · Caja · Ventas.
- **Menú del avatar** (de vez en cuando): Carta · Personal · Configuración.
- Al iniciar sesión todos entran por `/today`: el admin ve "Hoy", el mesero cae en Pedidos y la cocina en Cocina.

## Hoy (`/today`)

Tarjetas que llevan a cada pantalla: por atender (pedidos + llamadas), en cocina (y listos para llevar), mesas ocupadas, vendido hoy y estado de caja con lo que falta cobrar. Debajo, lo más pedido del día.

## Personal (`/staff`)

- Alta con **correo + clave temporal**: el servidor crea la cuenta con `SUPABASE_SECRET_KEY` solo después de que la RPC `can_manage_staff_role` confirma el permiso; si el vínculo al restaurante falla, la cuenta se borra.
- Cambiar rol, quitar/devolver acceso (además se bloquea la cuenta de acceso) y generar una clave nueva.
- Reglas (en la base): ADMIN gestiona meseros y cocina; OWNER también admins; el rol OWNER nunca se asigna desde el panel; nadie se edita a sí mismo.
- Se quitaron las políticas de INSERT/UPDATE directo sobre `restaurant_members`: con ellas un ADMIN podía darse OWNER por la API.

## Ventas (`/sales`)

Hoy / 7 días / 30 días de negocio (zona horaria y corte del día del restaurante). Con cobro activo: cuentas cobradas, ticket promedio, propinas, descuentos, métodos de pago y cuentas abiertas. Sin cobro: suma de pedidos entregados. RPC `get_sales_report`.

Ventas es el resumen rápido de todos los días; el botón "Reporte completo" lleva a **Reportes** (`/reports`: horas pico, por categoría, por personal, exportar), que está en el menú del avatar.

## Agregar producto al cobrar

En la hoja de cobro (pestaña Cuenta), "Agregar producto" suma una tanda a la cuenta abierta con la RPC `add_items_to_bill`. Por defecto nace entregada (se lo llevó de la barra); con "Mandar a cocina" entra a cocina. Idempotente: tocar dos veces no cobra doble.

## Cobro en Configuración

Solo el dueño: activar el cobro, tope de descuento del mesero (%) y hora de corte del día. El trigger `guard_restaurant_owner_settings` lo exige en la base.

## Pendiente

- Unir Mesas y Pedidos en una sola vista de salón (acordado para otra ronda).

## Sistema de diseño del panel (2026-09-28)

Los tokens y temas viven en **`app/src/styles/tokens.css`** (única fuente de verdad) y **`app/src/styles/themes/admin.css`** (selectores por rol: `data-theme="admin"` en el layout de `(dashboard)`, también cubre portales por `body:has`).

**Para cambiar el tema**: editar solo los controles CSS custom de `admin.css` (nunca agregar hex, `text-[Npx]` ni colores de paleta cruda en el panel):
- `--primary`: acento principal (verde #2E6B23 en el diseño actual)
- `--background`: fondo de pantalla (#F8F7F2)
- `--card`: superficie de tarjetas (#FFFFFF)
- `--foreground`: texto principal (#182016)
- `--muted-foreground`: texto secundario (#756B5F)
- `--border`: borde de controles (#948D7E, proporción 3:1 con fondo)
- `--input`: fondo de inputs
- `--radius`: esquinas redondeadas (controles, botones, tarjetas, badges)
- `--font-sans`: tipografía (Geist en dashboard, ~29 KB; 0 en la carta)

**Patrones del panel**: [[PageHeader]] con título + acciones, métricas en una superficie dividida, listas en superficie con `divide-y`, crear/editar en Sheet derecho con header y footer fijos, [[EmptyState]] con action. Todos los botones ≥44px en caja/mesas/pedidos. Menú lateral agrupado (Operación/Negocio/Configuración): 240px escritorio, iconos en tablet, cajón en móvil.

## Véase También

- [[Roles del Sistema]]
- [[Mapa de Pantallas - General]]
- [[Reglas de Negocio MVP]]
- [[Estado del Sistema — Auditoría 2026-09-26]]
