"use client";

import { useEffect } from "react";

/** Ruta del latido: pasa por el proxy, que aplica sesión y dispositivo (M10). */
export const HEARTBEAT_PATH = "/today/sesion";
const HEARTBEAT_MS = 30_000;

/**
 * Pide el latido y devuelve a dónde mandar al usuario si el proxy lo
 * redirigió (dispositivo revocado → `/pin?motivo=revocado`, sesión vencida →
 * `/login`), o null si la sesión sigue valiendo o no se pudo comprobar
 * (sin red no se corta a nadie, igual que en el proxy).
 */
export async function checkSessionHeartbeat(
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchFn(HEARTBEAT_PATH, { cache: "no-store", credentials: "same-origin" });
    if (!res.redirected) return null;
    const url = new URL(res.url);
    return url.pathname === HEARTBEAT_PATH ? null : url.pathname + url.search;
  } catch {
    return null;
  }
}

/**
 * Mantiene vigente la revocación de dispositivos (M10) aunque la pantalla no
 * navegue: las lecturas en vivo van directo a Supabase y no pasan por el
 * proxy, así que se le pregunta cada 30 s (solo con la pestaña visible) y al
 * volver a ella.
 */
export function useSessionHeartbeat() {
  useEffect(() => {
    let cancelled = false;
    async function beat() {
      if (document.hidden) return;
      const destination = await checkSessionHeartbeat();
      if (destination && !cancelled) window.location.assign(destination);
    }
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    function onVisible() {
      if (!document.hidden) void beat();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
