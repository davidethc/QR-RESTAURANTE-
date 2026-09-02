import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getStaffOrders } from "@/lib/queries/staff";
import { KitchenBoard } from "./_components/kitchen-board";

export const metadata: Metadata = { title: "Cocina" };

export default async function KitchenPage() {
  const session = await getMyRestaurant();
  const restaurantId = session.restaurant.id;

  const orders = await getStaffOrders(restaurantId, [
    "ACCEPTED",
    "PREPARING",
    "READY",
  ]);

  return (
    <main className="flex min-h-full flex-col">
      <PageHeader title="Cocina" description={`${orders.length} pedidos activos`} />
      <KitchenBoard restaurantId={restaurantId} initialOrders={orders} />
    </main>
  );
}
