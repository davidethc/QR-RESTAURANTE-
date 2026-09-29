"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Inbox, ChefHat, Bell as BellIcon, PackageCheck, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderCard } from "./order-card";
import { CallCard } from "./call-card";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { useDeferredDelivery } from "@/hooks/use-deferred-delivery";
import { fetchStaffOrders, fetchWaiterCalls } from "@/lib/actions/staff";
import type { OrderStatus, UserRole } from "@/config/constants";
import { cn } from "@/lib/utils";
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
  role,
  billingEnabled = false,
  maxWaiterDiscountPct = 0,
  tableSessionMap = {},
  readyStep = true,
}: {
  restaurantId: string;
  initialOrders: StaffOrder[];
  initialCalls: StaffWaiterCall[];
  initialTableFilter: number | null;
  initialView?: "calls" | "progress" | null;
  role?: UserRole;
  /** Módulo de cobro (M5). Con false, "Pedir cuenta" se sigue atendiendo como hoy. */
  billingEnabled?: boolean;
  maxWaiterDiscountPct?: number;
  /** mesa -> sesión viva, para abrir la hoja de cobro desde la tarjeta de solicitud. */
  tableSessionMap?: Record<string, string>;
  /** Ajuste `kitchen_ready_step`. Con false la cocina nunca marca "Listo":
   *  no hay pestaña "Listos" y entregar no pide confirmación. */
  readyStep?: boolean;
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
  // disparado desde otra pantalla del panel) o `?view=progress`
  // (el mesero acaba de tomar un pedido de viva voz: nace directo en
  // preparación, así que no tiene sentido aterrizar en "Nuevos").
  const [activeTab, setActiveTab] = useState(() => {
    if (initialView === "calls") return "calls";
    if (initialView === "progress") return "progress";
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
    if (ordersForTable.some((o) => o.status === "READY"))
      return readyStep ? "ready" : "progress";
    return "pending";
  });

  // Los toasts de "pedido nuevo"/"listo"/"solicitud" ya no se disparan
  // acá — vive una sola vez en `DashboardNotifier` (layout del
  // dashboard) para que avisen en cualquier pantalla, no solo en
  // /orders. Este refetch solo mantiene actualizada la lista visible.
  const refetch = useCallback(async () => {
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
  }, [restaurantId]);

  const { connected, refresh } = useStaffRealtime(restaurantId, refetch);

  const { pendingIds, scheduleDelivery } = useDeferredDelivery(
    async (orderId) => {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      await refresh();
    }
  );

  const clearTableFilter = useCallback(() => {
    setTableFilter(null);
    router.replace("/orders");
  }, [router]);

  // Los que esperan su "Deshacer" ya no se muestran: para el mesero
  // están entregados.
  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          !pendingIds.has(o.id) &&
          (tableFilter === null || o.table_number === tableFilter)
      ),
    [orders, tableFilter, pendingIds]
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
      // Sin paso "Listo" no debería haber READY; si queda alguno (lo marcó
      // un dueño a mano), se entrega desde "En cocina" en vez de perderse
      // en una pestaña oculta.
      inProgress: visibleOrders.filter(
        (o) =>
          o.status === "ACCEPTED" ||
          o.status === "PREPARING" ||
          (!readyStep && o.status === "READY")
      ),
      ready: readyStep ? visibleOrders.filter((o) => o.status === "READY") : [],
    }),
    [visibleOrders, readyStep]
  );

  const renderOrder = (order: StaffOrder) => (
    <OrderCard
      key={order.id}
      order={order}
      onDone={refresh}
      onDeliver={() =>
        scheduleDelivery(
          order.id,
          `Pedido #${order.order_number} entregado`
        )
      }
      confirmNotReady={readyStep}
    />
  );

  return (
    <>
      <div className="flex justify-end px-4 pt-2 md:px-8">
        <ConnectionStatus connected={connected} />
      </div>

      {tableFilter !== null && (
        <div className="mx-4 mt-4 flex items-center md:mx-8 justify-between gap-2 rounded-control border border-border bg-card py-1.5 pl-4 pr-1.5">
          <span className="text-body font-semibold text-foreground">
            Viendo solo Mesa {tableFilter}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearTableFilter}
            className="h-9 rounded-control px-3 text-meta font-semibold text-primary hover:bg-primary/10"
          >
            <X aria-hidden className="h-4 w-4" /> Ver todas
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 py-4 md:px-8">
        {/* Control segmentado limpio: contenedor neutro (bg-muted) y la
            pestaña activa se despega con una superficie blanca y un
            borde sutil, sin volumen ni color de marca — el resto queda
            plano para que no compita. */}
        <TabsList className="no-scrollbar h-auto w-full justify-start gap-1 overflow-x-auto rounded-control bg-muted p-1">
          {[
            { value: "pending", label: "Nuevos", count: pending.length },
            { value: "progress", label: "En cocina", count: inProgress.length },
            ...(readyStep
              ? [{ value: "ready", label: "Listos", count: ready.length }]
              : []),
            { value: "calls", label: "Solicitudes", count: visibleCalls.length },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "h-10 shrink-0 flex-none gap-1.5 whitespace-nowrap rounded-control px-3.5 text-meta font-semibold transition-colors duration-150",
                activeTab === tab.value
                  ? "data-active:bg-card data-active:text-foreground data-active:shadow-sm dark:data-active:bg-card dark:data-active:text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-badge px-1.5 py-0.5 text-tiny leading-tight tabular-nums",
                  activeTab === tab.value
                    ? "bg-primary-soft text-primary"
                    : "bg-foreground/10 text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="pending" className="flex flex-col gap-3 pt-4">
          {pending.length === 0 ? (
            <EmptyState icon={Inbox} title="No hay pedidos nuevos" description="Cuando llegue un pedido aparecerá aquí." />
          ) : (
            <AnimatePresence mode="popLayout">
              {pending.map(renderOrder)}
            </AnimatePresence>
          )}
        </TabsContent>

        <TabsContent value="progress" className="flex flex-col gap-3 pt-4">
          {inProgress.length === 0 ? (
            <EmptyState icon={ChefHat} title="Nada en cocina" description="Todo está al día ✓" />
          ) : (
            <AnimatePresence mode="popLayout">
              {inProgress.map(renderOrder)}
            </AnimatePresence>
          )}
        </TabsContent>

        {readyStep && (
          <TabsContent value="ready" className="flex flex-col gap-3 pt-4">
            {ready.length === 0 ? (
              <EmptyState icon={PackageCheck} title="No hay pedidos listos" description="Cocina avisará cuando termine uno." />
            ) : (
              <AnimatePresence mode="popLayout">
                {ready.map(renderOrder)}
              </AnimatePresence>
            )}
          </TabsContent>
        )}

        <TabsContent value="calls" className="flex flex-col gap-3 pt-4">
          {visibleCalls.length === 0 ? (
            <EmptyState icon={BellIcon} title="No hay solicitudes" description="Todo tranquilo." />
          ) : (
            <AnimatePresence mode="popLayout">
              {visibleCalls.map((call) => (
                <CallCard
                  key={call.id}
                  call={call}
                  onDone={refresh}
                  billingEnabled={billingEnabled}
                  role={role}
                  maxWaiterDiscountPct={maxWaiterDiscountPct}
                  tableSessionId={tableSessionMap[call.table_id]}
                />
              ))}
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
