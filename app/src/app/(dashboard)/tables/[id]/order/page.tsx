import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { StaffOrderBuilder } from "./_components/staff-order-builder";
import {
  getMyRestaurant,
  getTableForOrder,
  getTopProducts,
} from "@/lib/queries/staff";
import { getPublicMenu } from "@/lib/queries/menu";
import {
  getActiveOrderForTable,
  getStaffProductDetails,
} from "@/lib/queries/staff-catalog";

// Igual que el resto del panel: fuera del alcance de la migración a
// navegación instantánea, que por ahora solo cubre la ruta del comensal.
export const instant = false;

export const metadata: Metadata = { title: "Tomar pedido" };

/**
 * El mesero le toma el pedido a una mesa.
 *
 * La carta se lee con `getPublicMenu` — la misma que ve el cliente, cacheada
 * y sin sesión de mesa de por medio. Lo que cambia no es el catálogo, es cómo
 * se presenta y quién manda el pedido.
 */
export default async function TakeOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();
  const [{ id }, { vista }] = await Promise.all([params, searchParams]);
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/tables");

  const table = await getTableForOrder(id);

  // Comprobar el restaurante no es redundante con la RLS: sin esto, un id de
  // mesa de otro local devolvería null y daría 404 igual, pero dejar la
  // comprobación explícita documenta la regla en el sitio donde importa.
  if (!table || table.restaurant_id !== session.restaurant.id) notFound();
  if (table.status === "INACTIVE") notFound();

  const [menu, topProducts, details, order] = await Promise.all([
    getPublicMenu(session.restaurant.slug),
    getTopProducts(session.restaurant.id),
    getStaffProductDetails(session.restaurant.id),
    getActiveOrderForTable(table.id),
  ]);

  const tableLabel = table.name ?? `Mesa ${table.number}`;

  return (
    <main data-caja className="bg-background">
      <StaffOrderBuilder
        categories={menu.categories}
        topProducts={topProducts}
        details={details}
        tableId={table.id}
        orderId={order?.id ?? null}
        tableLabel={tableLabel}
        tickets={order?.tickets ?? []}
        reopenSessionId={order?.billRequested ? order.tableSessionId : null}
        initialView={vista === "enviado" ? "sent" : "menu"}
      />
    </main>
  );
}
