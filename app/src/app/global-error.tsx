"use client";

import "./globals.css";

/**
 * Último recurso: falló el layout raíz. Reemplaza al documento entero, así
 * que trae su propio <html>/<body> y los estilos globales (no hereda nada
 * del layout). Sin fuentes propias a propósito: debe cargar aunque la red
 * esté mal.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">
        <title>Algo salió mal · Monky</title>
        <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="font-display text-xl font-bold">Algo salió mal</h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Puede ser la conexión. Inténtalo otra vez; si sigue fallando,
            recarga la página.
          </p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Reintentar
          </button>
          {error.digest && (
            <p className="text-[11px] text-muted-foreground/60">
              Ref. {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
