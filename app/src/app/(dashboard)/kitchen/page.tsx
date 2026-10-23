import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getMyRestaurant } from "@/lib/queries/staff";
import { getKitchenTickets } from "@/lib/queries/kds";
import { isManager } from "@/lib/permissions";
import { KitchenBoard } from "./_components/kitchen-board";

export const instant = false;

export const metadata: Metadata = { title: "Cocina" };

export default async function KitchenPage() {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/kitchen");
  const restaurantId = session.restaurant.id;
  const initial = await getKitchenTickets(restaurantId, "pending");

  return (
    <main data-caja className="flex min-h-full flex-col bg-background">
      <KitchenBoard restaurantId={restaurantId} initial={initial} canManage={isManager(session)} />
    </main>
  );
}
