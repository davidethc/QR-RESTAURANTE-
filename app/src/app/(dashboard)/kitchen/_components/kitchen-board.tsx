"use client";

import { useMemo, useState } from "react";
import { ChefHat, Flame, PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { KitchenOrderCard } from "./kitchen-order-card";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { fetchStaffOrders } from "@/lib/actions/staff";
import type { OrderStatus } from "@/config/constants";
import type { StaffOrder } from "@/types/staff";

const KITCHEN_STATUSES: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY"];

function Column({
  title,
  icon: Icon,
  orders,
  emptyText,
  onDone,
}: {
  onDone?: () => void;
  title: string;
  icon: typeof ChefHat;
  orders: StaffOrder[];
  emptyText: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
        <Icon className="h-6 w-6" />
        {title} ({orders.length})
      </h2>
      <div className="flex flex-1 flex-col gap-3">
        {orders.length === 0 ? (
          <EmptyState title={emptyText} description="Todo está al día ✓" />
        ) : (
          orders.map((order) => (
            <KitchenOrderCard key={order.id} order={order} onDone={onDone} />
          ))
        )}
      </div>
    </div>
  );
}

export function KitchenBoard({
  restaurantId,
  initialOrders,
}: {
  restaurantId: string;
  initialOrders: StaffOrder[];
}) {
  const [orders, setOrders] = useState(initialOrders);

  async function refetch() {
    try {
      const newOrders = await fetchStaffOrders(restaurantId, KITCHEN_STATUSES);
      setOrders(newOrders);
    } catch {
      // Silencioso: Realtime reintentará con el próximo cambio.
    }
  }

  const { connected, refresh } = useStaffRealtime(restaurantId, refetch, {
    tables: ["orders"],
  });

  const { accepted, preparing, ready } = useMemo(
    () => ({
      accepted: orders.filter((o) => o.status === "ACCEPTED"),
      preparing: orders.filter((o) => o.status === "PREPARING"),
      ready: orders.filter((o) => o.status === "READY"),
    }),
    [orders]
  );

  return (
    <>
      <div className="flex justify-end px-4 pt-2">
        <ConnectionStatus connected={connected} />
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-x-auto px-4 py-4 md:flex-row">
      <Column
        title="Nuevos"
        icon={Flame}
        orders={accepted}
        emptyText="No hay pedidos nuevos"
        onDone={refresh}
      />
      <Column
        title="En preparación"
        icon={ChefHat}
        orders={preparing}
        emptyText="Nada en preparación"
        onDone={refresh}
      />
      <Column
        title="Listos"
        icon={PackageCheck}
        orders={ready}
        emptyText="No hay pedidos listos"
        onDone={refresh}
      />
      </div>
    </>
  );
}
