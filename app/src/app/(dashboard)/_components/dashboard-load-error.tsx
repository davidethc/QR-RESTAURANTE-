"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecoverableError } from "@/components/shared/recoverable-error";

/**
 * Lo que pinta el layout del panel cuando `getMyRestaurant` falla por algo
 * pasajero (red del local, la base reiniciándose). Antes eso mandaba a
 * /login y el personal perdía la pantalla a mitad de servicio aunque su
 * sesión estuviera bien. `router.refresh()` vuelve a correr el layout.
 */
export function DashboardLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <main className="flex min-h-full flex-col items-center justify-center">
      <RecoverableError
        title="No pudimos cargar el panel"
        description="Puede ser la conexión del local. Tu sesión sigue abierta: reintenta en unos segundos."
        retrying={pending}
        onRetry={() => startTransition(() => router.refresh())}
      />
    </main>
  );
}
