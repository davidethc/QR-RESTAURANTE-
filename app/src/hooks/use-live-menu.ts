"use client";

import { useEffect, useState } from "react";
import { fetchPublicMenuCategories } from "@/lib/actions/public-menu";
import type { PublicCategory } from "@/types/menu";

/** Tiempo entre refrescos con la pestaña visible. */
export const LIVE_MENU_MS = 15_000;

/**
 * Mantiene la carta del comensal al día (agotados / disponibles) sin recargar.
 * El anónimo no puede suscribirse a `availability` (RLS solo para miembros),
 * así que se refresca la carta cacheada: cada 15 s con la pestaña visible y al
 * volver a ella. Si el servidor trae algo distinto, reemplaza; si falla,
 * conserva lo que ya hay.
 */
export function useLiveMenuCategories(
  slug: string,
  initial: PublicCategory[]
): PublicCategory[] {
  const [live, setLive] = useState<{ base: PublicCategory[]; data: PublicCategory[] } | null>(null);
  // Si la página entrega una carta nueva (navegación), manda la del servidor.
  const categories = live && live.base === initial ? live.data : initial;

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function run() {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const next = await fetchPublicMenuCategories(slug);
        if (!cancelled && next) setLive({ base: initial, data: next });
      } catch {
        // Silencioso: se reintenta en el siguiente ciclo.
      } finally {
        inFlight = false;
      }
    }

    const timer = setInterval(run, LIVE_MENU_MS);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("online", run);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("online", run);
    };
  }, [slug, initial]);

  return categories;
}
