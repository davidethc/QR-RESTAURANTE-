import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import Link from "next/link";
import { Clock, FolderTree, Plus, UtensilsCrossed, XCircle } from "lucide-react";
import { StatusMetric } from "@/components/shared/status-strip";
import { posPressable } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
import { connection } from "next/server";
import { getMyRestaurant, getAdminMenu } from "@/lib/queries/staff";
import { MenuAdminBoard } from "./_components/menu-admin-board";
import { CatalogTabs } from "./_components/catalog-tabs";
import { CategoryDialog } from "./_components/category-dialog";
import { ProductEditor } from "./_components/product-editor";

const HEADER_BUTTON =
  "flex min-h-12 items-center gap-2 rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold text-foreground hover:border-border-strong";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Carta" };

export default async function MenuAdminPage() {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/menu");
  const menu = await getAdminMenu(session.restaurant.id);

  const soldOut = menu.products.filter((p) => !p.available).length;

  return (
    <main data-caja className="min-h-full bg-background">
      <CatalogTabs
        restaurantId={session.restaurant.id}
        metrics={
          <>
            <StatusMetric label="Productos" value={String(menu.products.length)} icon={UtensilsCrossed} />
            <StatusMetric label="Categorías" value={String(menu.categories.length)} tone="info" icon={FolderTree} />
            <StatusMetric label="Agotados" value={String(soldOut)} tone={soldOut > 0 ? "money-out" : "neutral"} icon={XCircle} />
          </>
        }
        action={
          <>
            <Link href="/menu/horarios" className={cn(posPressable, HEADER_BUTTON)}>
              <Clock className="size-4" aria-hidden /> Horarios
            </Link>
            <CategoryDialog
              restaurantId={session.restaurant.id}
              trigger={
                <button type="button" className={cn(posPressable, HEADER_BUTTON)}>
                  <Plus className="size-4" aria-hidden /> Categoría
                </button>
              }
            />
            <ProductEditor
              restaurantId={session.restaurant.id}
              categories={menu.categories}
              allProducts={menu.products}
              trigger={
                <button type="button" className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button bg-foreground px-4 text-body-sm font-semibold text-background hover:bg-foreground/90")}>
                  <Plus className="size-4" aria-hidden /> Producto
                </button>
              }
            />
          </>
        }
      >
        <MenuAdminBoard
          restaurantId={session.restaurant.id}
          categories={menu.categories}
          products={menu.products}
        />
      </CatalogTabs>
    </main>
  );
}
