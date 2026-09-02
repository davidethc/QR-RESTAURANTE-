import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getMyRestaurant,
  getDashboardSummary,
  getStaffOrders,
  getWaiterCalls,
} from "@/lib/queries/staff";
import { OrdersBoard } from "./_components/orders-board";

export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage() {
  const session = await getMyRestaurant();
  const restaurantId = session.restaurant.id;

  const [summary, orders, calls] = await Promise.all([
    getDashboardSummary(restaurantId),
    getStaffOrders(restaurantId, ["PENDING", "ACCEPTED", "PREPARING", "READY"]),
    getWaiterCalls(restaurantId, ["PENDING", "ACCEPTED"]),
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
      />
    </main>
  );
}
