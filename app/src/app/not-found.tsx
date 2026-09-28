import type { Metadata } from "next";

export const metadata: Metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-xl font-bold">Página no encontrada</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        El enlace no existe o ya no está disponible. Si llegaste escaneando un
        QR, pide ayuda al personal del restaurante.
      </p>
    </main>
  );
}
