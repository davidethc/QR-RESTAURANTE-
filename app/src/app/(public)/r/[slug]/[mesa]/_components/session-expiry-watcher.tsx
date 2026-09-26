"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Cuando vence la sesión de mesa (1 h 30 min desde el escaneo), vuelve
 * a pedir la página: el servidor ya no ve sesión y la pinta en modo
 * carta, con el pedido por WhatsApp. Sin esto, una pestaña que se quedó
 * abierta seguiría mostrando los botones de la mesa hasta que el
 * cliente intentara pedir y le saliera un error.
 *
 * El `setTimeout` no basta solo: con la pantalla apagada el navegador
 * congela los timers, así que también se revisa al volver a la pestaña.
 */
export function SessionExpiryWatcher({ expiresAt }: { expiresAt: number }) {
  const router = useRouter();

  useEffect(() => {
    const refreshIfExpired = () => {
      if (Date.now() >= expiresAt) router.refresh();
    };

    const timer = setTimeout(
      () => router.refresh(),
      Math.max(0, expiresAt - Date.now()) + 1000
    );
    document.addEventListener("visibilitychange", refreshIfExpired);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshIfExpired);
    };
  }, [expiresAt, router]);

  return null;
}
