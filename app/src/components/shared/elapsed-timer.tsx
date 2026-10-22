"use client";

import { useNow } from "@/components/shared/clock";
import { cn } from "@/lib/utils";

function elapsedMinutes(since: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/**
 * "Hace 5 min", actualizándose sola. Se usa en tarjetas de pedido y de
 * solicitud para que el personal detecte demoras sin tener que hacer
 * cuentas ni recargar la página.
 *
 * Muestra minutos (no segundos), así que se apoya en el reloj compartido
 * de 15 s (`clock.ts`) en vez de un temporizador por tarjeta.
 *
 * `warnAfterMinutes` resalta el texto cuando el pedido lleva
 * demasiado tiempo esperando (regla de "pedido urgente" del wireframe).
 *
 * El primer render (servidor y cliente) muestra siempre "—":
 * `useNow` sirve `null` hasta hidratar.
 */
export function ElapsedTimer({
  since,
  warnAfterMinutes,
  className,
  prefix = "Hace",
}: {
  since: string;
  warnAfterMinutes?: number;
  className?: string;
  /** Texto antes del cronómetro ("Enviado hace" en la cocina). */
  prefix?: string;
}) {
  const now = useNow("minute");
  const minutes = now === null ? null : elapsedMinutes(since, now);
  const isLate =
    minutes !== null &&
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
      {minutes === null ? "—" : `${prefix} ${formatMinutes(minutes)}`}
    </span>
  );
}
