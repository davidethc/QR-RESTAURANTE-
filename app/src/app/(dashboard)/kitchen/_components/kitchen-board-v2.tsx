"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChefHat,
  Flame,
  PackageCheck,
  BarChart3,
  Clock,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { KitchenOrderCard } from "./kitchen-order-card";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { fetchStaffOrders } from "@/lib/actions/staff";
import type { OrderStatus } from "@/config/constants";
import type { StaffOrder } from "@/types/staff";

const KITCHEN_STATUSES: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY"];

type ColumnType = "new" | "preparing" | "ready";

interface ColumnProps {
  type: ColumnType;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  orders: StaffOrder[];
  emptyText: string;
  onDone?: () => void;
}

function Column({ type, title, icon: Icon, orders, emptyText, onDone }: ColumnProps) {
  const getColor = (columnType: ColumnType) => {
    switch (columnType) {
      case "new":
        return {
          bg: "bg-orange-50 dark:bg-orange-950/20",
          icon: "text-orange-600 dark:text-orange-400",
          border: "border-orange-200 dark:border-orange-900/50",
          badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-200",
        };
      case "preparing":
        return {
          bg: "bg-blue-50 dark:bg-blue-950/20",
          icon: "text-blue-600 dark:text-blue-400",
          border: "border-blue-200 dark:border-blue-900/50",
          badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200",
        };
      case "ready":
        return {
          bg: "bg-green-50 dark:bg-green-950/20",
          icon: "text-green-600 dark:text-green-400",
          border: "border-green-200 dark:border-green-900/50",
          badge: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-200",
        };
    }
  };

  const colors = getColor(type);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`flex min-w-0 flex-1 flex-col gap-4 rounded-3xl border-2 ${colors.border} ${colors.bg} p-5 lg:p-6`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.badge}`}>
          <Icon className={`h-5 w-5 ${colors.icon}`} />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {orders.length === 0 ? (
          <EmptyState
            title={emptyText}
            description="✓ Excelente trabajo"
          />
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                onDone={onDone}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function KitchenBoardV2({
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

  const totalActive = accepted.length + preparing.length + ready.length;

  return (
    <>
      {/* Header */}
      <div className="border-b bg-gradient-to-b from-background to-muted/30 px-4 py-6 lg:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold text-foreground">
              Cocina
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {totalActive} {totalActive === 1 ? "pedido activo" : "pedidos activos"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionStatus connected={connected} />
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="flex flex-1 flex-col gap-4 overflow-x-auto px-4 py-4 lg:flex-row lg:px-6">
        <Column
          type="new"
          title="Nuevos"
          icon={Flame}
          orders={accepted}
          emptyText="No hay pedidos nuevos"
          onDone={refresh}
        />
        <Column
          type="preparing"
          title="En preparación"
          icon={ChefHat}
          orders={preparing}
          emptyText="Nada en preparación"
          onDone={refresh}
        />
        <Column
          type="ready"
          title="Listos para servir"
          icon={PackageCheck}
          orders={ready}
          emptyText="No hay pedidos listos"
          onDone={refresh}
        />
      </div>

      {/* Stats footer */}
      {totalActive > 0 && (
        <div className="border-t bg-muted/30 px-4 py-3 lg:px-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {accepted.length > 0 && `${accepted.length} por aceptar`}
              {accepted.length > 0 && preparing.length > 0 && " • "}
              {preparing.length > 0 && `${preparing.length} en cocina`}
              {(accepted.length > 0 || preparing.length > 0) && ready.length > 0 && " • "}
              {ready.length > 0 && `${ready.length} listos`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
