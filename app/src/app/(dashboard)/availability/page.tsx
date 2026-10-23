import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/shared/page-header";
import { requireRouteAccess } from "@/lib/auth/require-route-access";
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
    <main>
      <PageHeader
        title="Disponibilidad"
        description="Marca lo que hoy no hay. El cambio se refleja en el POS y la carta."
      />
      <div className="px-4 pb-12 md:px-8">
        <AvailabilityList items={items} restaurantId={session.restaurant.id} />
      </div>
    </main>
  );
}
