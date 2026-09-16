import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/shared/page-header";
import {
  getMyRestaurant,
  getDashboardSummary,
  getStaffOrders,
  getWaiterCalls,
  getTablesStatus,
} from "@/lib/queries/staff";
import { OrdersBoard } from "./_components/orders-board";
import { QuickTakeOrder } from "./_components/quick-take-order";

// Fuera del alcance de esta optimización: solo la ruta del comensal
// (/r/[slug]/[mesa]) se migró a navegación instantánea. `instant = false`
// marca este segmento como "puede bloquear" y silencia su validación,
// sin cambiar cómo renderiza. Quitar esta línea al migrar el panel.
export const instant = false;

export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; view?: string }>;
}) {
  // Ver la nota en (dashboard)/layout.tsx: sin esto, el Date.now() interno
  // de auth-js al cargar la sesión rompe el prerender de esta página.
  await connection();
  const session = await getMyRestaurant();
  const restaurantId = session.restaurant.id;
  const { table, view } = await searchParams;
  const initialTableFilter = table ? Number(table) : null;
  /** Igual que en Mesas: quien atiende mesas puede tomar un pedido. */
  const canServeTable =
    session.role === "OWNER" ||
    session.role === "ADMIN" ||
    session.role === "WAITER";

  const [summary, orders, calls, tables] = await Promise.all([
    getDashboardSummary(restaurantId),
    getStaffOrders(restaurantId, ["PENDING", "ACCEPTED", "PREPARING", "READY"]),
    getWaiterCalls(restaurantId, ["PENDING", "ACCEPTED"]),
    canServeTable ? getTablesStatus(restaurantId) : Promise.resolve([]),
  ]);

  return (
    <main>
      <PageHeader
        title="Pedidos"
        description={`${summary.orders_today} pedidos hoy · ${summary.occupied_tables}/${summary.total_tables} mesas ocupadas`}
      />
      <OrdersBoard
        restaurantId={restaurantId}
        initialOrders={orders}
        initialCalls={calls}
        initialTableFilter={
          initialTableFilter && !Number.isNaN(initialTableFilter)
            ? initialTableFilter
            : null
        }
        initialView={view === "calls" ? "calls" : null}
      />
      {canServeTable && <QuickTakeOrder tables={tables} />}
    </main>
  );
}
