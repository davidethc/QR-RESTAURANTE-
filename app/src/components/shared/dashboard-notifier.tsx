"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { notify } from "@/lib/notifications";
import { fetchStaffOrders, fetchWaiterCalls } from "@/lib/actions/staff";
import type { OrderStatus } from "@/config/constants";

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
];

/**
 * Avisa (toast + sonido) de pedidos nuevos, pedidos listos y
 * solicitudes de mesa desde CUALQUIER pantalla del panel — vive una
 * sola vez en el layout del dashboard, no adentro de /orders, porque
 * antes el mesero se perdía el aviso por completo si estaba mirando
 * Mesas o Cocina cuando llegaba algo. `OrdersBoard` ya no dispara
 * estas notificaciones — solo refresca su propia lista — para que no
 * suenen dos veces cuando el mesero sí está parado en /orders.
 *
 * Canal de Realtime separado (`staff-notify`, no `staff`) del que usa
 * `OrdersBoard`/`KitchenBoard`: si coincidiera el nombre y ambos
 * estuvieran montados a la vez (este componente vive en el layout,
 * siempre montado), Supabase rechaza la segunda suscripción al mismo
 * canal — mismo tipo de problema ya documentado en el hook.
 */
export function DashboardNotifier({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const prevStatusRef = useRef<Map<string, OrderStatus> | null>(null);
  const prevCallIdsRef = useRef<Set<string> | null>(null);

  async function refetch() {
    try {
      const [orders, calls] = await Promise.all([
        fetchStaffOrders(restaurantId, ACTIVE_ORDER_STATUSES),
        fetchWaiterCalls(restaurantId, ["PENDING", "ACCEPTED"]),
      ]);

      // La primera pasada (montaje) solo establece la línea base —
      // nunca avisa de "pedidos nuevos" que en realidad ya estaban
      // ahí desde antes de abrir el panel.
      if (prevStatusRef.current) {
        for (const order of orders) {
          const prevStatus = prevStatusRef.current.get(order.id);
          if (!prevStatus && order.status === "PENDING") {
            notify.newOrder(order.order_number, order.table_number);
          } else if (
            prevStatus &&
            prevStatus !== order.status &&
            order.status === "READY"
          ) {
            notify.orderReadyForStaff(order.order_number, order.table_number);
          }
        }
      }
      prevStatusRef.current = new Map(orders.map((o) => [o.id, o.status]));

      if (prevCallIdsRef.current) {
        for (const call of calls) {
          if (
            call.status === "PENDING" &&
            !prevCallIdsRef.current.has(call.id)
          ) {
            const goToCalls = () => router.push("/orders?view=calls");
            if (call.type === "BILL") {
              notify.billRequested(call.table_number, goToCalls);
            } else {
              notify.waiterCalled(call.table_number, goToCalls);
            }
          }
        }
      }
      prevCallIdsRef.current = new Set(
        calls.filter((c) => c.status === "PENDING").map((c) => c.id)
      );
    } catch {
      // Silencioso: Realtime reintentará con el próximo cambio.
    }
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useStaffRealtime(restaurantId, refetch, "staff-notify");

  return null;
}
