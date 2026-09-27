"use client";

import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botón "Imprimir" del ticket. Con `?print=1` (como lo abren "Imprimir
 * ticket"/"Pre-cuenta"/"Reimprimir") dispara `window.print()` solo, una
 * vez que las fuentes terminaron de cargar — antes de eso el navegador
 * puede paginar con la tipografía de reserva y el ticket sale con otro
 * ancho de columna. `autoPrint` llega como prop desde el Server Component
 * (ya leyó `searchParams`) en vez de leerlo acá con `useSearchParams`, que
 * exigiría envolver la página en `<Suspense>` solo para esto.
 */
export function PrintButton({ autoPrint }: { autoPrint: boolean }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!autoPrint || firedRef.current) return;
    firedRef.current = true;
    document.fonts.ready.then(() => {
      window.print();
    });
  }, [autoPrint]);

  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="clay clay-primary h-12 w-full rounded-full text-[15px] font-semibold print:hidden"
    >
      <Printer aria-hidden data-icon="inline-start" /> Imprimir
    </Button>
  );
}
