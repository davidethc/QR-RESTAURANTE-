"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { AlertTriangle, Download, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CopyLinkField } from "@/components/shared/copy-link-field";
import { buildCartaUrl, getQrUrlWarning } from "@/lib/qr";

/**
 * El link de la carta para fuera del local. A diferencia del QR de una
 * mesa, no abre sesión: el cliente ve la carta completa y el pedido
 * sale por WhatsApp.
 */
export function CartaLinkDialog({
  slug,
  hasWhatsapp,
}: {
  slug: string;
  hasWhatsapp: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = buildCartaUrl(slug);
  const warning = open ? getQrUrlWarning() : null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 512, margin: 2 }).then((png) => {
      if (!cancelled) setDataUrl(png);
    });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-carta-${slug}.png`;
    a.click();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="h-4 w-4" /> Link de carta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carta para compartir</DialogTitle>
          <DialogDescription>
            Para Instagram, Google Maps o para mandar a quien no está en el
            local. Ve la misma carta, pero solo puede pedir por WhatsApp:
            no llega a cocina ni a ninguna mesa.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="QR de la carta" className="h-48 w-48" />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center text-sm text-muted-foreground">
              Generando…
            </div>
          )}
          <CopyLinkField url={url} label="link de la carta" />
          {!hasWhatsapp && (
            <p className="flex items-start gap-2 rounded-lg bg-honey-soft px-3 py-2 text-meta text-honey-soft-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Falta el número de WhatsApp en Configuración. Sin él, quien
              abra este link puede ver la carta pero no pedir.
            </p>
          )}
          {warning && (
            <p className="flex items-start gap-2 rounded-lg bg-honey-soft px-3 py-2 text-meta text-honey-soft-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {warning}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-center">
          <Button onClick={handleDownload} disabled={!dataUrl}>
            <Download className="h-4 w-4" /> Descargar QR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
