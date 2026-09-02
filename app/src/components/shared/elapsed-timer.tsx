"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function formatElapsed(since: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 1000)
  );
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * "Hace 05:32", actualizándose sola cada segundo. Se usa en tarjetas
 * de pedido y de solicitud para que el personal detecte demoras
 * sin tener que hacer cuentas ni recargar la página.
 *
 * `warnAfterMinutes` resalta el texto cuando el pedido lleva
 * demasiado tiempo esperando (regla de "pedido urgente" del wireframe).
 *
 * El primer render (servidor y cliente) muestra siempre "—": calcular
 * el tiempo transcurrido en el `useState` inicial hace que el servidor
 * y el cliente calculen valores distintos (pasan milisegundos reales
 * entre uno y otro), lo que React marca como error de hidratación.
 * El valor real se calcula recién en `useEffect`, que solo corre en
 * el cliente después de hidratar.
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
  const [elapsed, setElapsed] = useState<string | null>(null);

  useEffect(() => {
    setElapsed(formatElapsed(since));
    const id = setInterval(() => setElapsed(formatElapsed(since)), 1000);
    return () => clearInterval(id);
  }, [since]);

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
