"use client";

import { RotateCw, WifiOff } from "lucide-react";

/**
 * If the menu fails (database down, venue wifi, broken session) the
 * customer gets a way back instead of Next's generic error screen.
 * `reset()` retries rendering the segment without reloading the app.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full border border-attention-border bg-attention-soft text-attention-soft-foreground">
          <WifiOff aria-hidden className="size-6" />
        </span>
        <h1 className="font-display text-title font-bold">No pudimos cargar la carta</h1>
        <p className="text-body-sm text-muted-foreground">
          Puede ser tu conexión. Inténtalo otra vez; si sigue fallando, avisa a tu
          mesero.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-body font-semibold text-primary-foreground"
        >
          <RotateCw aria-hidden className="size-4" />
          Reintentar
        </button>
        {/* The digest is the only way to match this failure with the
            server log. Discreet, but readable over the phone. */}
        {error.digest && (
          <p className="text-caption text-muted-foreground">Ref. {error.digest}</p>
        )}
      </div>
    </main>
  );
}
