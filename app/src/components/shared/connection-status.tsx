"use client";

import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Si el panel está recibiendo cambios en vivo.
 *
 * Existe porque el fallo más peligroso de una comanda es el
 * silencioso: si el WebSocket muere, la pantalla se queda igual de
 * tranquila que si de verdad no hubiera pedidos, y el mesero no tiene
 * forma de distinguir "no ha entrado nada" de "no me está llegando
 * nada". Un punto verde antes del servicio vale más que cualquier
 * mensaje de error después.
 *
 * Desconectado no significa perdido: la red de seguridad de
 * `useStaffRealtime` sigue trayendo los cambios cada 20 s. Por eso el
 * aviso dice "reintentando" y no "error" — el trabajo continúa, solo
 * deja de ser instantáneo.
 */
export function ConnectionStatus({
  connected,
  className,
}: {
  connected: boolean;
  className?: string;
}) {
  if (connected) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center gap-1.5 text-caption font-medium text-muted-foreground",
          className
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-success-indicator" />
        en vivo
      </span>
    );
  }

  return (
    <span
      role="status"
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-badge bg-warning-soft px-2.5 py-1 text-caption font-medium text-warning-soft-foreground",
        className
      )}
    >
      <WifiOff className="size-3.5" strokeWidth={1.75} />
      Sin conexión — reintentando…
    </span>
  );
}
