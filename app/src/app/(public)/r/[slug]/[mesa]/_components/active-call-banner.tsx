"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Receipt } from "lucide-react";
import { getSessionCalls } from "@/lib/actions/waiter-calls";
import { notify } from "@/lib/notifications";
import type { SessionCall } from "@/types/orders";

const POLL_MS = 4000;
const ACTIVE: SessionCall["status"][] = ["PENDING", "ACCEPTED"];

/**
 * El cliente no puede suscribirse a Realtime (ver OrderTracker) —
 * mismo patrón de sondeo corto sobre un RPC seguro. Sin esto, tocar
 * "Llamar mesero" solo confirmaba el envío y el cliente nunca sabía
 * si alguien ya venía o si la solicitud fue atendida.
 */
export function ActiveCallBanner() {
  const [calls, setCalls] = useState<SessionCall[]>([]);
  const prevRef = useRef<Map<string, SessionCall["status"]>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await getSessionCalls();
      if (cancelled || !result.ok) return;

      for (const call of result.data) {
        const prevStatus = prevRef.current.get(call.id);
        if (prevStatus === "PENDING" && call.status === "ACCEPTED") {
          notify.callInProgress(call.type);
        } else if (
          (prevStatus === "PENDING" || prevStatus === "ACCEPTED") &&
          call.status === "ATTENDED"
        ) {
          notify.callDone(call.type);
        }
      }
      prevRef.current = new Map(result.data.map((c) => [c.id, c.status]));
      setCalls(result.data.filter((c) => ACTIVE.includes(c.status)));
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (calls.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b bg-accent/40 px-4 py-3">
      {calls.map((call) => {
        const Icon = call.type === "BILL" ? Receipt : Bell;
        const label =
          call.type === "BILL" ? "Pediste la cuenta" : "Llamaste al mesero";
        const statusLabel =
          call.status === "ACCEPTED" ? "En camino" : "Enviado, esperando";

        return (
          <div
            key={call.id}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
          >
            <Icon className="h-4 w-4 shrink-0 text-wine" />
            <span className="flex-1 text-sm font-medium text-foreground">
              {label}
            </span>
            <span className="text-xs text-muted-foreground">
              {statusLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
