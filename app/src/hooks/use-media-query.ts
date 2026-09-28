"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `true` si la media query coincide. En el servidor (y en el primer render
 * de hidratación) devuelve `false`: úsalo para ajustar comportamiento, no
 * para decidir qué HTML existe, o habrá un salto al hidratar.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
