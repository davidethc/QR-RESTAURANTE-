import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getMyRestaurant, getStaffOrders } from "@/lib/queries/staff";
import { KitchenBoard } from "./_components/kitchen-board";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

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
