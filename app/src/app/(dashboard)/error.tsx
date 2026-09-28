"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RecoverableError } from "@/components/shared/recoverable-error";

/**
 * Error de una página del panel. El layout (barra de navegación, hoja de
 * cobro) sigue en pie: solo se reemplaza el contenido, así el personal puede
 * reintentar o irse a otra sección sin recargar todo.
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center">
      <RecoverableError
        title="Esta pantalla no cargó"
        description="Puede ser la conexión del local. Reintenta; si sigue fallando, avisa al encargado."
        digest={error.digest}
        onRetry={retry}
      >
        <Button asChild variant="outline" className="h-11 rounded-full px-6 text-body-sm font-semibold">
          <Link href="/today">Ir al inicio</Link>
        </Button>
      </RecoverableError>
    </main>
  );
}
