"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { notify } from "@/lib/notifications";
import { fetchStaffOrders, fetchWaiterCalls } from "@/lib/actions/staff";
import type { OrderStatus, UserRole } from "@/config/constants";

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
];

/**
 * Canal entre pestañas del mismo navegador. Sin esto, dos pestañas del
 * panel abiertas suenan y avisan DOS veces por cada pedido: cada una
 * monta su propio notificador y ninguna sabe de la otra. La primera
 * que ve un evento reclama su id aquí y las demás lo saltan.
 */
const DEDUPE_CHANNEL = "monky-notify";
const DEDUPE_TTL_MS = 30_000;

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
export function DashboardNotifier({
  restaurantId,
  role,
}: {
  restaurantId: string;
  /** Cocina no atiende mesas: oír la campana de "Mesa X solicita
   *  atención" solo la distrae de lo suyo. */
  role: UserRole;
}) {
  const router = useRouter();
  const seen = useRef<Map<string, number>>(new Map());
  const bus = useRef<BroadcastChannel | null>(null);

  // Devuelve true solo para la primera pestaña que ve este aviso.
  function claim(key: string): boolean {
    const now = Date.now();
    for (const [k, t] of seen.current) {
      if (now - t > DEDUPE_TTL_MS) seen.current.delete(k);
    }
    if (seen.current.has(key)) return false;
    seen.current.set(key, now);
    bus.current?.postMessage(key);
    return true;
  }

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(DEDUPE_CHANNEL);
    channel.onmessage = (e: MessageEvent<string>) => {
      seen.current.set(e.data, Date.now());
    };
    bus.current = channel;
    return () => {
      channel.close();
      bus.current = null;
    };
  }, []);
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
          if (
            !prevStatus &&
            order.status === "PENDING" &&
            claim(`new:${order.id}`)
          ) {
            notify.newOrder(order.order_number, order.table_number);
          } else if (
            prevStatus &&
            prevStatus !== order.status &&
            order.status === "READY" &&
            claim(`ready:${order.id}`)
          ) {
            notify.orderReadyForStaff(order.order_number, order.table_number);
          }
        }
      }
      prevStatusRef.current = new Map(orders.map((o) => [o.id, o.status]));

      // Cocina no ve ni oye las solicitudes de mesa: no son su trabajo.
      if (prevCallIdsRef.current && role !== "KITCHEN") {
        for (const call of calls) {
          if (
            call.status === "PENDING" &&
            !prevCallIdsRef.current.has(call.id) &&
            claim(`call:${call.id}`)
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

  useStaffRealtime(restaurantId, refetch, {
    channelName: "staff-notify",
    // Los cambios de estado de una mesa no generan avisos.
    tables: ["orders", "waiter_calls"],
  });

  return null;
}
