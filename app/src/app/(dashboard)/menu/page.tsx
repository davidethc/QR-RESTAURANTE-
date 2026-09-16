import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getAdminMenu } from "@/lib/queries/staff";
import { MenuAdminBoard } from "./_components/menu-admin-board";

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
  const menu = await getAdminMenu(session.restaurant.id);

  return (
    <main>
      <PageHeader
        title="Carta"
        description={`${menu.categories.length} categorías · ${menu.products.length} productos`}
      />
      <MenuAdminBoard
        restaurantId={session.restaurant.id}
        slug={session.restaurant.slug}
        categories={menu.categories}
        products={menu.products}
      />
    </main>
  );
}
