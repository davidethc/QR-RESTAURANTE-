"use client";

import { useRouter } from "next/navigation";
import { LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { unlockPinLogin } from "@/lib/actions/staff-admin";

export function UnlockPinButton({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  return (
    <section aria-labelledby="pin-unlock-title" className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-control border border-attention-border bg-attention-soft text-attention-soft-foreground">
          <LockOpen className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="pin-unlock-title" className="text-body font-semibold leading-tight text-foreground">PIN bloqueado</h2>
          <p className="text-meta leading-snug text-muted-foreground">
            Si el equipo se quedó sin entrar por PIN tras varios intentos
            fallidos, puedes devolverles el acceso.
          </p>
        </div>
      </div>
      <ConfirmDialog
        title="¿Desbloquear el acceso por PIN?"
        description="El equipo podrá volver a iniciar sesión con su PIN en los dispositivos del local."
        confirmLabel="Desbloquear"
        successMessage="Acceso por PIN desbloqueado"
        action={() => unlockPinLogin({ restaurantId })}
        onSuccess={() => router.refresh()}
        trigger={
          <Button type="button" variant="outline" className="min-h-11 w-full">
            <LockOpen aria-hidden />
            Desbloquear acceso por PIN
          </Button>
        }
      />
    </section>
  );
}
