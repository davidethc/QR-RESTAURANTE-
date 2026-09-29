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
    <html
      lang="es"
      className="h-full antialiased"
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <body data-theme="admin" className="min-h-full flex flex-col bg-background">
        <title>Algo salió mal · Monky</title>
        <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="grid size-10 place-items-center rounded-control bg-secondary text-muted-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold text-foreground">
            Algo salió mal
          </h1>
          <p className="max-w-xs text-body-sm text-muted-foreground">
            Puede ser la conexión. Inténtalo otra vez; si sigue fallando,
            recarga la página.
          </p>
          <button
            type="button"
            onClick={retry}
            className="h-11 rounded-control bg-primary px-6 text-body-sm font-medium text-primary-foreground"
          >
            Reintentar
          </button>
          {error.digest && (
            <p className="text-caption text-muted-foreground/60">
              Ref. {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
