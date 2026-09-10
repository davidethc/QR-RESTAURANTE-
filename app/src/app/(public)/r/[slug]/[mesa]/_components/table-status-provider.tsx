"use client";

import { createContext, use, useCallback, useRef, useState } from "react";
import { getTableStatus, type TableStatus } from "@/lib/actions/table-status";
import { useSessionUpdates } from "@/hooks/use-session-updates";
import { notify } from "@/lib/notifications";
import type { SessionCall } from "@/types/orders";
import type { OrderStatus } from "@/config/constants";
import type { SessionOrderSummary } from "@/types/staff";

/** Tras tantos fallos seguidos se avisa: algo va mal de verdad. */
const MAX_FAILURES = 3;

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
  /**
   * Si la mesa pidió algo alguna vez en esta sesión. Es la condición para
   * poder pedir la cuenta.
   *
   * Se calcula sobre la lista SIN filtrar a propósito: `orders` de aquí
   * arriba solo trae lo que está en curso, así que una mesa que ya recibió
   * todo lo suyo lo tiene vacío. Si esto se leyera de ahí, el cliente que
   * terminó de comer — el que más obviamente necesita la cuenta — sería
   * justo al que se le bloquearía.
   */
  hasAnyOrder: boolean;
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
  hasAnyOrder: false,
});

export function useTableStatus() {
  return use(TableStatusContext);
}

/** Un pedido rechazado o cancelado no es una cuenta que cobrar. */
function countsForBill(order: SessionOrderSummary): boolean {
  return order.status !== "REJECTED" && order.status !== "CANCELLED";
}

function derive(status: TableStatus): TableStatusValue {
  return {
    orders: status.orders.filter((o) => ACTIVE_ORDER_STATUSES.has(o.status)),
    calls: status.calls.filter((c) => ACTIVE_CALL_STATUSES.includes(c.status)),
    hasAnyOrder: status.orders.some(countsForBill),
  };
}

/** Firma barata de "qué hay en curso y en qué estado". */
function signature(v: TableStatusValue): string {
  return [
    ...v.orders.map((o) => `o${o.id}:${o.status}`),
    ...v.calls.map((c) => `c${c.id}:${c.status}`),
    `b${v.hasAnyOrder}`,
  ].join("|");
}

/**
 * Un único latido para todo lo que la mesa tiene en curso.
 *
 * Antes esto sondeaba cada 4 s con una Server Action. Como React
 * serializa las Server Actions, si al tocar un enlace había un sondeo en
 * vuelo la navegación se quedaba esperando detrás: era la causa
 * principal de que pulsar tardara "segundos" en el celular.
 *
 * Ahora escucha una señal de Realtime (ver `useSessionUpdates`) y solo
 * pide datos cuando algo cambió de verdad. Mientras el cliente mira la
 * carta sin novedades, no sale ni una petición.
 *
 * `initialStatus` llega ya resuelto desde el servidor, así que al abrir
 * tampoco hay ninguna consulta: la franja de arriba y los botones de
 * abajo salen pintados en el primer HTML.
 */
export function TableStatusProvider({
  initialStatus,
  channelName,
  children,
}: {
  initialStatus: TableStatus;
  /** null = sin sesión de mesa viva: ni se suscribe ni consulta. */
  channelName: string | null;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState<TableStatusValue>(() =>
    derive(initialStatus)
  );

  // Estados de la vuelta anterior, para detectar transiciones. Se siembra
  // con lo que ya vino del servidor a propósito: si arrancara vacío,
  // entrar a la carta con una solicitud ya aceptada dispararía un toast
  // por algo que el cliente vio hace rato.
  const prevCalls = useRef<Map<string, SessionCall["status"]>>(
    new Map(initialStatus.calls.map((c) => [c.id, c.status]))
  );
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    const result = await getTableStatus();

    if (!result.ok) {
      // Antes esto era un `return` a secas: si la sesión expiraba, el
      // celular seguía consultando en silencio eternamente, sin cortar
      // ni decirle nada al cliente.
      if (++failures.current >= MAX_FAILURES) notify.error(result.error);
      return;
    }
    failures.current = 0;

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
    prevCalls.current = new Map(result.data.calls.map((c) => [c.id, c.status]));

    // Solo se cambia el valor del contexto si algo cambió de verdad: un
    // objeto nuevo aquí re-renderiza TODO el subárbol de la carta.
    const next = derive(result.data);
    setValue((current) =>
      signature(current) === signature(next) ? current : next
    );
  }, []);

  useSessionUpdates({ channelName, onUpdate: refresh });

  return <TableStatusContext value={value}>{children}</TableStatusContext>;
}
