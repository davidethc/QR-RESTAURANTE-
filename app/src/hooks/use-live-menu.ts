"use client";

import { useEffect, useState } from "react";
import { fetchPublicMenuCategories } from "@/lib/actions/public-menu";
import { sameMenu } from "@/lib/menu-navigation";
import type { PublicCategory } from "@/types/menu";

/** Tiempo entre refrescos con la pestaña visible. */
export const LIVE_MENU_MS = 15_000;

type LiveMenu = { base: PublicCategory[]; data: PublicCategory[] };

/**
 * Next live state after a refresh. Returns `prev` untouched when the server
 * brought the same menu: a new state object every 15 s re-rendered the whole
 * menu (and rebuilt every section ref) while the customer was tapping.
 */
export function nextLiveMenu(prev: LiveMenu | null, base: PublicCategory[], next: PublicCategory[]): LiveMenu | null {
  const current = prev && prev.base === base ? prev.data : base;
  if (sameMenu(current, next)) return prev;
  return { base, data: next };
}

/**
 * Mantiene la carta del comensal al día (agotados / disponibles) sin recargar.
 * El anónimo no puede suscribirse a `availability` (RLS solo para miembros),
 * así que se refresca la carta cacheada: cada 15 s con la pestaña visible y al
 * volver a ella. Si el servidor trae algo distinto, reemplaza (si es igual, no toca el estado); si falla,
 * conserva lo que ya hay.
 */
export function useLiveMenuCategories(
  slug: string,
  initial: PublicCategory[]
): PublicCategory[] {
  const [live, setLive] = useState<LiveMenu | null>(null);
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
        if (!cancelled && next) setLive((prev) => nextLiveMenu(prev, initial, next));
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
