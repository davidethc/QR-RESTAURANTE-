"use client";

import { useCallback, useState } from "react";
import { useStaffRealtime } from "@/hooks/use-staff-realtime";
import { fetchStaffCounters } from "@/lib/actions/staff-counters";
import { EMPTY_COUNTERS, type StaffCounters } from "@/lib/staff-counters";

/**
 * Contadores sincronizados del personal. Cualquier cambio en pedidos,
 * comandas, avisos o mesas vuelve a pedir el estado COMPLETO (no un delta),
 * y también al reconectar y en la red de seguridad de `useStaffRealtime`.
 */
export function useStaffCounters(restaurantId: string) {
  const [counters, setCounters] = useState<StaffCounters>(EMPTY_COUNTERS);

  const load = useCallback(async () => {
    try {
      const r = await fetchStaffCounters(restaurantId);
      if (r.ok) setCounters(r.data);
    } catch {
      // Silencioso: la red de seguridad reintenta.
    }
  }, [restaurantId]);

  const { connected } = useStaffRealtime(restaurantId, load, {
    channelName: "staff-counters",
    tables: ["orders", "tickets", "waiter_calls", "tables"],
    immediate: true,
  });

  return { counters, connected };
}
