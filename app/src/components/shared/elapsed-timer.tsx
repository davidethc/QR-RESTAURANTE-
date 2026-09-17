"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

function formatElapsed(since: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 1000)
  );
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function subscribeToTick(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}

function noElapsedYet() {
  return null;
}

/**
 * "Hace 05:32", actualizándose sola cada segundo. Se usa en tarjetas
 * de pedido y de solicitud para que el personal detecte demoras
 * sin tener que hacer cuentas ni recargar la página.
 *
 * `warnAfterMinutes` resalta el texto cuando el pedido lleva
 * demasiado tiempo esperando (regla de "pedido urgente" del wireframe).
 *
 * El primer render (servidor y cliente) muestra siempre "—":
 * `useSyncExternalStore` sirve el snapshot del servidor (`null`) hasta
 * hidratar, y recién después pasa a leer el valor real y suscribirse
 * al tick — sin el doble setState manual de antes, que además disparaba
 * el aviso de React de "no llames a setState de forma síncrona dentro
 * de un efecto".
 */
export function ElapsedTimer({
  since,
  warnAfterMinutes,
  className,
}: {
  since: string;
  warnAfterMinutes?: number;
  className?: string;
}) {
  const elapsed = useSyncExternalStore(
    subscribeToTick,
    () => formatElapsed(since),
    noElapsedYet
  );

  const minutes = elapsed ? Number(elapsed.split(":")[0]) : 0;
  const isLate =
    elapsed !== null &&
    warnAfterMinutes !== undefined &&
    minutes >= warnAfterMinutes;

  return (
    <span
      className={cn(
        "text-xs tabular-nums text-muted-foreground",
        isLate && "font-semibold text-wine",
        className
      )}
    >
      {elapsed === null ? "—" : `Hace ${elapsed}`}
    </span>
  );
}
