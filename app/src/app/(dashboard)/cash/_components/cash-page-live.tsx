"use client";

import { useRouter } from "next/navigation";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { ConnectionStatus } from "@/components/shared/connection-status";

/**
 * Mantiene viva /cash: cuentas abiertas y turno de caja cambian sin que
 * el que está en esta pantalla haga nada (otro mesero cobrando, un
 * movimiento de caja). Igual que TablesLive: la página sigue siendo
 * Server Component, esto solo le dice cuándo volver a correr.
 */
export function CashPageLive({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const { connected } = useStaffRealtime(restaurantId, () => router.refresh(), {
    channelName: "staff-cash",
    tables: ["orders", "bills", "cash_sessions"],
  });

  return <ConnectionStatus connected={connected} />;
}
