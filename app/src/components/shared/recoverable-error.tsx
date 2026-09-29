"use client";

import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Pantalla de "algo falló, pero se puede reintentar". Misma composición que
 * `EmptyState` (ícono en círculo, título display, texto corto) para que un
 * error pasajero no parezca que la app se rompió.
 *
 * El digest es lo único que permite cruzar el fallo con el log del servidor:
 * discreto, pero visible si hay que pedírselo al personal por teléfono.
 */
export function RecoverableError({
  title,
  description,
  onRetry,
  retrying = false,
  digest,
  children,
}: {
  title: string;
  description: string;
  onRetry: () => void;
  retrying?: boolean;
  digest?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center"
    >
      <span className="mb-2 flex size-10 items-center justify-center rounded-control bg-secondary text-muted-foreground">
        <AlertTriangle className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-body font-semibold leading-tight text-foreground">{title}</p>
      <p className="max-w-xs text-meta leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={onRetry} disabled={retrying} className="h-10">
          {retrying ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <RotateCw aria-hidden />
          )}
          Reintentar
        </Button>
        {children}
      </div>
      {digest && (
        <p className="mt-2 text-caption text-muted-foreground/60">Ref. {digest}</p>
      )}
    </div>
  );
}
