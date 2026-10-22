"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Smartphone, Ban } from "lucide-react";
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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div className="min-w-0 max-w-prose">
          <h2 id="devices-title" className="text-lg font-semibold text-foreground">
            Dispositivos con acceso por PIN
          </h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            En un dispositivo vinculado, cualquier miembro del equipo entra solo con su PIN. Sin
            vincular, el PIN no funciona.
          </p>
        </div>
        {keyConfigured ? (
          <LinkDeviceDialog restaurantId={restaurantId} />
        ) : null}
      </div>

      {!keyConfigured && (
        <p className="m-4 rounded-control border border-dashed border-border bg-muted p-3 text-meta text-muted-foreground">
          Falta configurar <code className="font-mono text-foreground">SUPABASE_SECRET_KEY</code> en
          el servidor para vincular dispositivos.
        </p>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Smartphone className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium text-foreground">Aún no hay dispositivos vinculados</p>
          <p className="max-w-sm text-body-sm text-muted-foreground">
            Vincula la primera tablet o computadora del local para que el equipo entre en segundos.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{d.name ?? "Sin nombre"}</p>
                <p className="text-meta text-muted-foreground" suppressHydrationWarning>
                  {STATUS_LABEL[d.status]}
                  {d.status === "ACTIVE" && ` · Último uso: ${formatDate(d.last_used_at)}`}
                  {d.status === "PENDING" && d.link_expires_at && ` · Vence ${formatDate(d.link_expires_at)}`}
                </p>
              </div>
              <div className="flex gap-2">
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
                    <Button variant="outline" className="min-h-11 text-destructive">
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
