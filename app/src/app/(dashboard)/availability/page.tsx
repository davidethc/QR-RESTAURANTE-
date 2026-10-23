import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRouteAccess } from "@/lib/auth/require-route-access";
import { canAccessRoute } from "@/lib/permissions";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getAvailabilityItems } from "@/lib/queries/availability";
import { AvailabilityList } from "./_components/availability-list";

// Ver la nota en (dashboard)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Disponibilidad" };

// Visible para OWNER, ADMIN, WAITER y KITCHEN: sin redirección por rol.
export default async function AvailabilityPage() {
  await connection();
  const session = await getMyRestaurant();
  // El proxy ya no aplica el permiso por rol (lo hace el layout, que no se
  // re-renderiza al navegar del lado del cliente): esta página lo exige sola.
  requireRouteAccess(session, "/availability");
  const items = await getAvailabilityItems(session.restaurant.id);

  return (
    <main data-caja className="min-h-full bg-background">
      <AvailabilityList
        items={items}
        restaurantId={session.restaurant.id}
        canEditMenu={canAccessRoute(session, "/menu")}
      />
    </main>
  );
}
