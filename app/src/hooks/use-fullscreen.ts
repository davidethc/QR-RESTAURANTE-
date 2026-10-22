"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}
const noop = () => () => {};

/**
 * Pantalla completa con la Fullscreen API. El estado se deriva SIEMPRE de
 * `fullscreenchange` (no de lo que pedimos), así que salir con Esc deja el
 * botón y el texto coherentes. Los errores (`fullscreenerror`, promesa
 * rechazada o API no soportada) se exponen en `error`.
 */
export function useFullscreen() {
  const active = useSyncExternalStore(
    subscribe,
    () => Boolean(document.fullscreenElement),
    () => false
  );
  const supported = useSyncExternalStore(
    noop,
    () => Boolean(document.documentElement.requestFullscreen),
    () => false
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onError = () =>
      setError("No se pudo activar la pantalla completa en este dispositivo.");
    document.addEventListener("fullscreenerror", onError);
    return () => document.removeEventListener("fullscreenerror", onError);
  }, []);

  const toggle = useCallback(async () => {
    setError(null);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError("No se pudo cambiar el modo de pantalla completa.");
    }
  }, []);

  return { active, supported, error, toggle };
}
