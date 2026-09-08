"use client";

/**
 * Antes no existía: si la carta fallaba (base caída, red del local,
 * sesión rota), el comensal se quedaba en la pantalla de error genérica
 * de Next sin forma de recuperarse salvo cerrar y volver a escanear.
 * `reset()` reintenta el render del segmento sin recargar toda la app.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-xl font-bold">
        No pudimos cargar la carta
      </h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Puede ser tu conexión. Inténtalo otra vez; si sigue fallando, avisa a tu
        mesero.
      </p>
      <button
        type="button"
        onClick={reset}
        className="min-h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Reintentar
      </button>
      {/* El digest es lo único que permite cruzar este fallo con el log
          del servidor. Discreto, pero visible si hay que pedírselo al
          cliente por teléfono. */}
      {error.digest && (
        <p className="text-[11px] text-muted-foreground/60">
          Ref. {error.digest}
        </p>
      )}
    </main>
  );
}
