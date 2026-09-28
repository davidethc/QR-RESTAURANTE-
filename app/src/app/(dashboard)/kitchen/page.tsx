import type { Metadata } from "next";
import { connection } from "next/server";
import {
  getMyRestaurant,
  getRestaurantSettings,
  getStaffOrders,
} from "@/lib/queries/staff";
import { KitchenBoard } from "./_components/kitchen-board";
import { kitchenStatuses } from "./_components/kitchen-statuses";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Cocina" };

export default async function KitchenPage() {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();
  const session = await getMyRestaurant();
  const restaurantId = session.restaurant.id;

  const settings = await getRestaurantSettings(restaurantId);
  const readyStep = settings.kitchen_ready_step;
  const orders = await getStaffOrders(restaurantId, kitchenStatuses(readyStep));

  return (
    <main className="flex min-h-full flex-col">
      <KitchenBoard
        restaurantId={restaurantId}
        initialOrders={orders}
        readyStep={readyStep}
      />
    </main>
  );
}
