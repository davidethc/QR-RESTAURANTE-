"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

/**
 * Aviso grande de "Sin conexión" para las pantallas donde un corte cambia lo
 * que el personal debe hacer (caja, cocina). El punto de `ConnectionStatus`
 * es discreto a propósito; esto no: sin red no se puede cobrar y lo que se
 * ve puede estar desactualizado, y eso tiene que notarse desde lejos.
 */
export function OfflineBanner({
  message = "Lo que ves puede estar desactualizado. Se pone al día solo al volver la red.",
  className,
}: {
  message?: string;
  className?: string;
}) {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl bg-honey-soft px-4 py-3 text-body-sm text-honey-soft-foreground",
        className
      )}
    >
      <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} aria-hidden />
      <span>
        <span className="font-semibold">Sin conexión.</span> {message}
      </span>
    </div>
  );
}
