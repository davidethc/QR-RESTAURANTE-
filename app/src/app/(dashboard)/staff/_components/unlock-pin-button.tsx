"use client";

import { useRouter } from "next/navigation";
import { LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { unlockPinLogin } from "@/lib/actions/staff-admin";

export function UnlockPinButton({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-3">
      <p className="text-body-sm text-muted-foreground">
        Si el equipo se quedó sin entrar por PIN tras varios intentos fallidos,
        puedes devolverles el acceso.
      </p>
      <ConfirmDialog
        title="¿Desbloquear el acceso por PIN?"
        description="El equipo podrá volver a iniciar sesión con su PIN en los dispositivos del local."
        confirmLabel="Desbloquear"
        successMessage="Acceso por PIN desbloqueado"
        action={() => unlockPinLogin({ restaurantId })}
        onSuccess={() => router.refresh()}
        trigger={
          <Button type="button" variant="outline" className="min-h-11">
            <LockOpen aria-hidden />
            Desbloquear acceso por PIN
          </Button>
        }
      />
    </div>
  );
}
