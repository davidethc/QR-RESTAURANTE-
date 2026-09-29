"use client";

import { useCallback, useMemo, useState } from "react";
import { ChefHat, PackageCheck, Clock } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { KitchenOrderCard } from "./kitchen-order-card";
import { kitchenStatuses, sentToKitchenAt } from "./kitchen-statuses";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { fetchStaffOrders } from "@/lib/actions/staff";
import { cn } from "@/lib/utils";
import type { StaffOrder } from "@/types/staff";

type ColumnTone = "cooking" | "ready";

const TONE: Record<ColumnTone, { badge: string; count: string }> = {
  cooking: {
    badge: "bg-primary-soft text-primary",
    count: "bg-primary-soft text-primary",
  },
  ready: {
    badge: "bg-success-soft text-success-soft-foreground",
    count: "bg-success-soft text-success-soft-foreground",
  },
};

function Column({
  tone,
  title,
  icon: Icon,
  orders,
  emptyTitle,
  emptyDescription,
  readyStep,
  onDone,
  className,
  listClassName,
}: {
  tone: ColumnTone;
  title: string;
  icon: typeof ChefHat;
  orders: StaffOrder[];
  emptyTitle: string;
  emptyDescription?: string;
  readyStep: boolean;
  onDone?: () => void;
  className?: string;
  listClassName?: string;
}) {
  const colors = TONE[tone];

  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-card border border-border bg-card p-5 lg:p-6",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-control",
            colors.badge
          )}
        >
          <Icon aria-hidden className="size-5" strokeWidth={1.75} />
        </div>
        <h2 className="text-title-sm font-semibold text-foreground">
          {title}
        </h2>
        <span
          className={cn(
            "ml-auto flex h-6 min-w-6 items-center justify-center rounded-badge px-2 text-meta font-semibold tabular-nums",
            colors.count
          )}
        >
          {orders.length}
        </span>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className={cn("grid gap-3", listClassName)}>
          {orders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              readyStep={readyStep}
              onDone={onDone}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function byTime(getTime: (o: StaffOrder) => string) {
  return (a: StaffOrder, b: StaffOrder) =>
    new Date(getTime(a)).getTime() - new Date(getTime(b)).getTime();
}

/**
 * Tablero de cocina.
 *
 * `readyStep` (ajuste `kitchen_ready_step` del restaurante):
 * - true: "En cocina" (ACCEPTED + PREPARING) con botón "Listo" por
 *   tarjeta, y "Para recoger" (READY).
 * - false: la cocina solo mira. Una sola columna "En cocina", sin
 *   botones; el pedido sale cuando el mesero lo entrega.
 *
 * Ya no hay columna "Nuevos": el mesero acepta y el pedido entra directo
 * en preparación (`accept_and_prepare_order`), así que ACCEPTED casi no
 * se ve; si aparece, cuenta como "En cocina".
 */
export function KitchenBoard({
  restaurantId,
  initialOrders,
  readyStep,
}: {
  restaurantId: string;
  initialOrders: StaffOrder[];
  readyStep: boolean;
}) {
  const [orders, setOrders] = useState(initialOrders);

  const refetch = useCallback(async () => {
    try {
      const newOrders = await fetchStaffOrders(
        restaurantId,
        kitchenStatuses(readyStep)
      );
      setOrders(newOrders);
    } catch {
      // Silencioso: Realtime reintentará con el próximo cambio.
    }
  }, [restaurantId, readyStep]);

  const { connected, refresh } = useStaffRealtime(restaurantId, refetch, {
    tables: ["orders"],
  });

  // Más viejo primero: lo que lleva más rato esperando va arriba.
  const { cooking, ready } = useMemo(
    () => ({
      cooking: orders
        .filter((o) => o.status === "ACCEPTED" || o.status === "PREPARING")
        .sort(byTime(sentToKitchenAt)),
      ready: readyStep
        ? orders
            .filter((o) => o.status === "READY")
            .sort(byTime((o) => o.ready_at ?? sentToKitchenAt(o)))
        : [],
    }),
    [orders, readyStep]
  );

  return (
    <>
      <div className="border-b border-border bg-card px-4 py-6 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-foreground">
              Cocina
            </h1>
            <p className="mt-1 flex items-center gap-2 text-body-sm text-muted-foreground">
              <Clock aria-hidden className="size-4" strokeWidth={1.75} />
              {cooking.length} en cocina
              {readyStep && ` · ${ready.length} para recoger`}
            </p>
          </div>
          <ConnectionStatus connected={connected} />
        </div>
        <OfflineBanner
          className="mt-4"
          message="Los pedidos nuevos no están llegando. Aparecen solos al volver la red."
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:px-8 lg:flex-row lg:items-start">
        <Column
          tone="cooking"
          title="En cocina"
          icon={ChefHat}
          orders={cooking}
          emptyTitle="Nada en cocina"
          emptyDescription="Los pedidos aparecen aquí apenas el mesero los envía."
          readyStep={readyStep}
          onDone={refresh}
          className="lg:flex-[2]"
          listClassName={
            readyStep ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"
          }
        />
        {readyStep && (
          <Column
            tone="ready"
            title="Para recoger"
            icon={PackageCheck}
            orders={ready}
            emptyTitle="Nada para recoger"
            readyStep={readyStep}
            onDone={refresh}
            className="lg:flex-1"
          />
        )}
      </div>
    </>
  );
}
