"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, ChefHat, Bell as BellIcon, PackageCheck, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderCard } from "./order-card";
import { CallCard } from "./call-card";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { fetchStaffOrders, fetchWaiterCalls } from "@/lib/actions/staff";
import type { OrderStatus } from "@/config/constants";
import type { StaffOrder, StaffWaiterCall } from "@/types/staff";

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
];

export function OrdersBoard({
  restaurantId,
  initialOrders,
  initialCalls,
  initialTableFilter,
  initialView,
}: {
  restaurantId: string;
  initialOrders: StaffOrder[];
  initialCalls: StaffWaiterCall[];
  initialTableFilter: number | null;
  initialView?: "calls" | null;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [calls, setCalls] = useState(initialCalls);
  const [tableFilter, setTableFilter] = useState(initialTableFilter);
  // Al entrar filtrado por una mesa (clic desde /tables), la pestaña
  // inicial debe ser la que de verdad tiene algo que atender en ESA
  // mesa — si solo pidió "Llamar mesero"/"Pedir cuenta" sin tener
  // pedidos activos, arrancar en "Nuevos" la deja vacía y parece un
  // error. Sin filtro de mesa, se mantiene "Nuevos" por defecto —
  // salvo que se llegue con `?view=calls` (el "Ver" de un aviso
  // disparado desde otra pantalla del panel).
  const [activeTab, setActiveTab] = useState(() => {
    if (initialView === "calls") return "calls";
    if (initialTableFilter === null) return "pending";
    const ordersForTable = initialOrders.filter(
      (o) => o.table_number === initialTableFilter
    );
    const callsForTable = initialCalls.filter(
      (c) => c.table_number === initialTableFilter
    );
    if (callsForTable.length > 0) return "calls";
    if (ordersForTable.some((o) => o.status === "PENDING")) return "pending";
    if (
      ordersForTable.some(
        (o) => o.status === "ACCEPTED" || o.status === "PREPARING"
      )
    )
      return "progress";
    if (ordersForTable.some((o) => o.status === "READY")) return "ready";
    return "pending";
  });

  // Los toasts de "pedido nuevo"/"listo"/"solicitud" ya no se disparan
  // acá — vive una sola vez en `DashboardNotifier` (layout del
  // dashboard) para que avisen en cualquier pantalla, no solo en
  // /orders. Este refetch solo mantiene actualizada la lista visible.
  async function refetch() {
    try {
      const [newOrders, newCalls] = await Promise.all([
        fetchStaffOrders(restaurantId, ACTIVE_ORDER_STATUSES),
        fetchWaiterCalls(restaurantId, ["PENDING", "ACCEPTED"]),
      ]);
      setOrders(newOrders);
      setCalls(newCalls);
    } catch {
      // Silencioso: Realtime reintentará con el próximo cambio.
    }
  }

  useStaffRealtime(restaurantId, refetch);

  function clearTableFilter() {
    setTableFilter(null);
    router.replace("/orders");
  }

  const visibleOrders = useMemo(
    () =>
      tableFilter === null
        ? orders
        : orders.filter((o) => o.table_number === tableFilter),
    [orders, tableFilter]
  );
  const visibleCalls = useMemo(
    () =>
      tableFilter === null
        ? calls
        : calls.filter((c) => c.table_number === tableFilter),
    [calls, tableFilter]
  );

  const { pending, inProgress, ready } = useMemo(
    () => ({
      pending: visibleOrders.filter((o) => o.status === "PENDING"),
      inProgress: visibleOrders.filter(
        (o) => o.status === "ACCEPTED" || o.status === "PREPARING"
      ),
      ready: visibleOrders.filter((o) => o.status === "READY"),
    }),
    [visibleOrders]
  );

  return (
    <>
      {tableFilter !== null && (
        <div className="mx-4 mt-4 flex items-center justify-between gap-2 rounded-lg border bg-accent/40 px-3 py-2 text-sm">
          <span className="font-medium text-foreground">
            Viendo solo Mesa {tableFilter}
          </span>
          <Button variant="ghost" size="sm" onClick={clearTableFilter}>
            <X className="h-4 w-4" /> Ver todas
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 py-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">Nuevos ({pending.length})</TabsTrigger>
          <TabsTrigger value="progress">Preparando ({inProgress.length})</TabsTrigger>
          <TabsTrigger value="ready">Listos ({ready.length})</TabsTrigger>
          <TabsTrigger value="calls">Solicitudes ({visibleCalls.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="flex flex-col gap-3 pt-4">
          {pending.length === 0 ? (
            <EmptyState icon={Inbox} title="No hay pedidos nuevos" description="Cuando llegue un pedido aparecerá aquí." />
          ) : (
            pending.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </TabsContent>

        <TabsContent value="progress" className="flex flex-col gap-3 pt-4">
          {inProgress.length === 0 ? (
            <EmptyState icon={ChefHat} title="No hay pedidos en preparación" description="Todo está al día ✓" />
          ) : (
            inProgress.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </TabsContent>

        <TabsContent value="ready" className="flex flex-col gap-3 pt-4">
          {ready.length === 0 ? (
            <EmptyState icon={PackageCheck} title="No hay pedidos listos" description="Cocina avisará cuando termine uno." />
          ) : (
            ready.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </TabsContent>

        <TabsContent value="calls" className="flex flex-col gap-3 pt-4">
          {visibleCalls.length === 0 ? (
            <EmptyState icon={BellIcon} title="No hay solicitudes" description="Todo tranquilo." />
          ) : (
            visibleCalls.map((call) => <CallCard key={call.id} call={call} />)
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
