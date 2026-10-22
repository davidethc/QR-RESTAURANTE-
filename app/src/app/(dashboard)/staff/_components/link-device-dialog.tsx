"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CopyLinkField } from "@/components/shared/copy-link-field";
import { createDeviceLink, listDevicesAction } from "@/lib/actions/devices";
import { getSiteOrigin } from "@/lib/qr";

const POLL_MS = 3000;

export function LinkDeviceDialog({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ deviceId: string; url: string; expiresAt: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setError(null);
    setLink(null);
    setQr(null);
    setLinkedName(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      router.refresh();
    }
  }

  function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDeviceLink({
        restaurantId,
        name: name.trim() ? name.trim() : undefined,
      });
      if (!result.ok) return setError(result.error);
      setLink({
        deviceId: result.data.deviceId,
        url: `${getSiteOrigin()}/activar?token=${result.data.token}`,
        expiresAt: result.data.expiresAt,
      });
    });
  }

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toDataURL(link.url, { width: 512, margin: 2 }).then((png) => {
      if (!cancelled) setQr(png);
    });
    return () => {
      cancelled = true;
    };
  }, [link]);

  // "Detectando el dispositivo…": consulta la lista hasta que el enlace se use.
  useEffect(() => {
    if (!link || linkedName) return;
    const deviceId = link.deviceId;
    const timer = setInterval(async () => {
      const result = await listDevicesAction(restaurantId);
      if (!result.ok) return;
      const device = result.data.find((d) => d.id === deviceId);
      if (device?.status === "ACTIVE") setLinkedName(device.name ?? "El dispositivo");
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [link, linkedName, restaurantId]);

  const expires = link
    ? new Date(link.expiresAt).toLocaleTimeString("es", { timeStyle: "short" })
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="min-h-11">
          <Plus aria-hidden /> Vincular dispositivo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular dispositivo</DialogTitle>
          <DialogDescription>
            {link
              ? "Escanea el código con el dispositivo o abre el enlace en él. Sirve una sola vez."
              : "Genera un enlace para la tablet o computadora que quieres vincular."}
          </DialogDescription>
        </DialogHeader>

        {!link ? (
          <form onSubmit={generate} className="flex flex-col gap-3">
            <label className="text-body-sm font-medium text-foreground" htmlFor="new-device-name">
              Nombre (opcional, lo podrás cambiar al activar)
            </label>
            <Input
              id="new-device-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tablet de meseros…"
              autoComplete="off"
              maxLength={60}
              className="min-h-11"
            />
            {error && <p className="text-body-sm text-destructive">{error}</p>}
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Generar enlace
            </Button>
          </form>
        ) : linkedName ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" role="status">
            <CheckCircle2 className="size-10 text-success-indicator" aria-hidden />
            <p className="font-medium text-foreground">{linkedName} quedó vinculado</p>
            <Button className="mt-2 min-h-11" onClick={() => handleOpenChange(false)}>
              Listo
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Código QR para vincular el dispositivo" className="size-52" />
            ) : (
              <div className="grid size-52 place-items-center text-body-sm text-muted-foreground">Generando…</div>
            )}
            <CopyLinkField url={link.url} label="enlace de vinculación" />
            <p className="flex items-center gap-2 text-body-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Detectando el dispositivo… vence a las {expires}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
