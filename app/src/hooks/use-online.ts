"use client";

import { useSyncExternalStore } from "react";

/** El ejemplo canónico de `useSyncExternalStore`: leer `navigator.onLine`
 * sin el doble setState (inicial + listener) que dispara el aviso de
 * React de "no llames a setState de forma síncrona dentro de un efecto". */
function subscribeToOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
function getOnlineSnapshot() {
  return navigator.onLine;
}
function getOnlineServerSnapshot() {
  return true;
}

/**
 * Si el navegador dice tener red. Instantáneo cuando se cae el wifi, pero no
 * garantiza que la base responda: `false` es seguro ("no hay red"), `true`
 * solo significa "probablemente".
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeToOnline, getOnlineSnapshot, getOnlineServerSnapshot);
}
