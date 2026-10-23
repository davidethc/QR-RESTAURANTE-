"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Clock3, Loader2, MonitorSmartphone, Pencil, Smartphone } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { toneSoft } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notify } from "@/lib/notifications";
import { renameDevice, revokeDevice } from "@/lib/actions/devices";
import type { DeviceRow } from "@/lib/validations/devices";
import { LinkDeviceDialog } from "./link-device-dialog";

const STATUS_LABEL = { ACTIVE: "Vinculado", PENDING: "Esperando vinculación", REVOKED: "Revocado" } as const;

function formatDate(value: string | null) {
  if (!value) return "Sin uso todavía";
  return new Date(value).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

function RenameDialog({
  restaurantId,
  device,
  onClose,
}: {
  restaurantId: string;
  device: DeviceRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(device.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await renameDevice({ restaurantId, deviceId: device.id, name });
      if (!result.ok) return setError(result.error);
      notify.success("Nombre actualizado");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Cambiar nombre</DialogTitle>
            <DialogDescription>Así lo verás en la lista de dispositivos.</DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre del dispositivo"
            autoComplete="off"
            maxLength={60}
            className="min-h-11"
          />
          {error && <p className="text-body-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Guardar nombre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DevicesPanel({
  restaurantId,
  devices,
  keyConfigured,
}: {
  restaurantId: string;
  devices: DeviceRow[];
  keyConfigured: boolean;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<DeviceRow | null>(null);
  const visible = devices.filter((d) => d.status !== "REVOKED");

  return (
    <section aria-labelledby="devices-title" className="rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-control border border-info-border bg-info-soft text-info-soft-foreground">
          <MonitorSmartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="devices-title" className="text-body font-semibold leading-tight text-foreground">
            Dispositivos con acceso por PIN
          </h2>
          <p className="mt-0.5 text-meta leading-snug text-muted-foreground">
            En un dispositivo vinculado, cualquier miembro del equipo entra solo con su PIN. Sin
            vincular, el PIN no funciona.
          </p>
        </div>
        {keyConfigured && visible.length > 0 ? (
          <LinkDeviceDialog restaurantId={restaurantId} />
        ) : null}
      </div>

      {!keyConfigured && (
        <p className="m-4 rounded-control border border-attention-border bg-attention-soft p-3 text-meta text-attention-soft-foreground">
          Falta configurar <code className="font-mono">SUPABASE_SECRET_KEY</code> en
          el servidor para vincular dispositivos.
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="Aún no hay dispositivos vinculados"
          description="Vincula la primera tablet o computadora del local para que el equipo entre en segundos."
          action={keyConfigured ? <LinkDeviceDialog restaurantId={restaurantId} /> : undefined}
        />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-control border border-border bg-secondary text-muted-foreground">
                  <Smartphone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold text-foreground">{d.name ?? "Sin nombre"}</p>
                  <p className="text-caption text-muted-foreground" suppressHydrationWarning>
                    {d.status === "ACTIVE" && `Último uso: ${formatDate(d.last_used_at)}`}
                    {d.status === "PENDING" && d.link_expires_at && `Vence ${formatDate(d.link_expires_at)}`}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold",
                    toneSoft[d.status === "ACTIVE" ? "money-in" : d.status === "PENDING" ? "attention" : "neutral"]
                  )}
                >
                  {d.status === "ACTIVE" ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Clock3 className="size-3.5" aria-hidden />}
                  {STATUS_LABEL[d.status]}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 sm:pl-[3.25rem]">
                {d.status === "ACTIVE" && (
                  <Button variant="outline" className="min-h-11" onClick={() => setRenaming(d)}>
                    <Pencil aria-hidden /> Renombrar
                  </Button>
                )}
                <ConfirmDialog
                  destructive
                  title={d.status === "ACTIVE" ? "¿Revocar el acceso de este dispositivo?" : "¿Cancelar este enlace?"}
                  description={
                    d.status === "ACTIVE"
                      ? "El corte es inmediato: nadie podrá entrar con PIN desde aquí y, si hay una sesión abierta, se cierra en su siguiente acción. Puedes volver a vincularlo cuando quieras."
                      : "El enlace dejará de funcionar. Puedes generar otro cuando quieras."
                  }
                  confirmLabel={d.status === "ACTIVE" ? "Revocar acceso" : "Cancelar enlace"}
                  successMessage={d.status === "ACTIVE" ? "Acceso revocado" : "Enlace cancelado"}
                  action={() => revokeDevice({ deviceId: d.id })}
                  onSuccess={() => router.refresh()}
                  trigger={
                    <Button variant="outline" className="min-h-11 text-money-out-soft-foreground hover:text-money-out-soft-foreground">
                      <Ban aria-hidden /> {d.status === "ACTIVE" ? "Revocar" : "Cancelar"}
                    </Button>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {renaming && (
        <RenameDialog restaurantId={restaurantId} device={renaming} onClose={() => setRenaming(null)} />
      )}
    </section>
  );
}
