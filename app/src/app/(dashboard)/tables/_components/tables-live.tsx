"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveEvents } from "@/app/(dashboard)/_components/staff-live-provider";

/** Como mucho un `router.refresh()` cada 1,5 s, pase lo que pase en la sala. */
const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Mantiene viva la rejilla de Mesas.
 *
 * Hasta ahora /Mesas era un Server Component puro: se pintaba una vez
 * por navegación y no se enteraba de nada más. Un mesero mirando esa
 * pantalla veía estados y totales congelados indefinidamente — la mesa
 * que otro acababa de liberar seguía apareciendo ocupada.
 *
 * La página sigue siendo Server Component y `getTablesStatus` sigue
 * siendo la única consulta: esto solo le dice cuándo volver a correr.
 * Tiene que ser un refetch completo y no basta con escuchar la tabla
 * `tables`, porque `active_total` no es una columna sino una suma que
 * calcula el propio RPC.
 *
 * Escucha al `StaffLiveProvider` (no abre canal propio) solo las tablas
 * que mueven esta pantalla, y fusiona las ráfagas: un pedido nuevo toca
 * orders + tables + tickets a la vez, y cada `router.refresh()` es un
 * render completo de la página en el servidor. No pinta nada: el "en vivo"
 * ya está en la barra superior del panel.
 */
export function TablesLive() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLiveEvents(["orders", "waiter_calls", "tables", "bills"], () => {
    // No se reinicia el temporizador en cada evento: así el refresco nunca
    // se pospone indefinidamente bajo un goteo continuo de eventos.
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

  return null;
}
