"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveConnected, useLiveEvents } from "@/app/(dashboard)/_components/staff-live-provider";
import { ConnectionStatus } from "@/components/shared/connection-status";

/** Como mucho un `router.refresh()` cada 1,5 s, pase lo que pase en caja. */
const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Mantiene viva /cash: cuentas abiertas y turno de caja cambian sin que
 * el que está en esta pantalla haga nada (otro mesero cobrando, un
 * movimiento de caja). Igual que TablesLive: escucha al StaffLiveProvider
 * (sin canal propio) y fusiona las ráfagas en un solo refresco.
 */
export function CashPageLive() {
  const router = useRouter();
  const connected = useLiveConnected();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLiveEvents(["orders", "bills", "cash_sessions"], () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, REFRESH_DEBOUNCE_MS);
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return <ConnectionStatus connected={connected} />;
}
