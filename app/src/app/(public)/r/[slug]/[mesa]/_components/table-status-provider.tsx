"use client";

import { createContext, use, useEffect, useRef, useState } from "react";
import { getTableStatus } from "@/lib/actions/table-status";
import { notify } from "@/lib/notifications";
import type { SessionCall } from "@/types/orders";
import type { OrderStatus } from "@/config/constants";
import type { SessionOrderSummary } from "@/types/staff";

const POLL_MS = 4000;

const ACTIVE_ORDER_STATUSES = new Set<OrderStatus>([
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
]);
const ACTIVE_CALL_STATUSES: SessionCall["status"][] = ["PENDING", "ACCEPTED"];

interface TableStatusValue {
  orders: SessionOrderSummary[];
  calls: SessionCall[];
}

/**
 * Valor por defecto vacío en vez de lanzar un error: en modo carta (sin
 * mesa) no hay provider y no debe haberlo, pero cualquier consumidor
 * que quede fuera del árbol tiene que degradar en silencio, no romper
 * la carta del cliente.
 */
const TableStatusContext = createContext<TableStatusValue>({
  orders: [],
  calls: [],
});

export function useTableStatus() {
  return use(TableStatusContext);
}

/**
 * Un único latido para todo lo que la mesa tiene en curso.
 *
 * El cliente es `anon` y no puede suscribirse a Realtime — la RLS de
 * `orders` solo da SELECT a `authenticated` —, así que el sondeo corto
 * es obligatorio. Lo que sí se puede evitar es sondear dos veces: antes
 * había un ciclo para las solicitudes y ninguno para los pedidos, que
 * por eso se quedaban congelados. Ahora hay uno solo que alimenta la
 * franja de arriba y los botones de abajo.
 *
 * `initialOrders` llega ya resuelto desde el servidor para que el
 * primer pintado no dé un salto esperando al primer sondeo.
 */
export function TableStatusProvider({
  initialOrders,
  children,
}: {
  initialOrders: SessionOrderSummary[];
  children: React.ReactNode;
}) {
  const [value, setValue] = useState<TableStatusValue>({
    orders: initialOrders.filter((o) => ACTIVE_ORDER_STATUSES.has(o.status)),
    calls: [],
  });

  // Estados de la vuelta anterior, para detectar transiciones. Arranca
  // vacío a propósito: el primer ciclo solo siembra, así al entrar a la
  // carta no salta un toast por algo que ya había pasado.
  const prevCalls = useRef<Map<string, SessionCall["status"]>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      // Celular en el bolsillo o pestaña de fondo: cero peticiones.
      if (document.hidden) return;

      const result = await getTableStatus();
      if (cancelled || !result.ok) return;

      for (const call of result.data.calls) {
        const prev = prevCalls.current.get(call.id);
        if (prev === "PENDING" && call.status === "ACCEPTED") {
          notify.callInProgress(call.type);
        } else if (
          (prev === "PENDING" || prev === "ACCEPTED") &&
          call.status === "ATTENDED"
        ) {
          notify.callDone(call.type);
        }
      }
      prevCalls.current = new Map(
        result.data.calls.map((c) => [c.id, c.status])
      );

      setValue({
        orders: result.data.orders.filter((o) =>
          ACTIVE_ORDER_STATUSES.has(o.status)
        ),
        calls: result.data.calls.filter((c) =>
          ACTIVE_CALL_STATUSES.includes(c.status)
        ),
      });
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    // Al volver a la pestaña se refresca de inmediato en vez de esperar
    // hasta 4 s con datos viejos en pantalla.
    document.addEventListener("visibilitychange", poll);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  return <TableStatusContext value={value}>{children}</TableStatusContext>;
}
