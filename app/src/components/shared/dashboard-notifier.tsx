"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveCalls, useLiveOrders } from "@/app/(dashboard)/_components/staff-live-provider";
import { notifyStaff } from "@/lib/notifications-staff";
import type { OrderStatus, UserRole } from "@/config/constants";

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
 * Ya no tiene canal propio ni hace lecturas: lee pedidos y solicitudes
 * del `StaffLiveProvider` (una sola suscripción para todo el panel) y
 * compara cada actualización con la anterior para decidir qué avisar.
 */
export function DashboardNotifier({
  role,
}: {
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

  const orders = useLiveOrders();
  const calls = useLiveCalls();

  useEffect(() => {
    if (!orders) return;
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
          notifyStaff.newOrder(order.order_number, order.table_number);
        } else if (
          prevStatus &&
          prevStatus !== order.status &&
          order.status === "READY" &&
          claim(`ready:${order.id}`)
        ) {
          notifyStaff.orderReadyForStaff(order.order_number, order.table_number);
        }
      }
    }
    prevStatusRef.current = new Map(orders.map((o) => [o.id, o.status]));
    // `claim` solo usa refs: no es una dependencia real.
  }, [orders]);

  useEffect(() => {
    if (!calls) return;
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
            notifyStaff.billRequested(call.table_number, goToCalls);
          } else {
            notifyStaff.waiterCalled(call.table_number, goToCalls);
          }
        }
      }
    }
    prevCallIdsRef.current = new Set(
      calls.filter((c) => c.status === "PENDING").map((c) => c.id)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, role]);

  return null;
}
