import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getKitchenTickets } from "@/lib/queries/kds";
import { KitchenHistory } from "./_components/kitchen-history";

export const instant = false;

export const metadata: Metadata = { title: "Historial de cocina" };

export default async function KitchenHistoryPage() {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/kitchen/history");
  const restaurantId = session.restaurant.id;
  const initial = await getKitchenTickets(restaurantId, "completed", 20, 0);

  return (
    <main className="flex min-h-full flex-col">
      <KitchenHistory restaurantId={restaurantId} initial={initial} />
    </main>
  );
}
