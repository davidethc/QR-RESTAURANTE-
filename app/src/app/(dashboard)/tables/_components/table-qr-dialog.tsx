"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buildScanUrl, getQrUrlWarning } from "@/lib/qr";

export function TableQrDialog({
  tableLabel,
  qrToken,
}: {
  tableLabel: string;
  qrToken: string;
}) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const scanUrl = buildScanUrl(qrToken);
    setWarning(getQrUrlWarning());
    QRCode.toDataURL(scanUrl, { width: 512, margin: 2 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, qrToken]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${tableLabel.toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  }

  return (
    // Esta card completa es un <Link> (tables/page.tsx, Server Component,
    // no puede llevar onClick): evita que abrir/usar el diálogo del QR
    // navegue a /orders. Vive acá porque este archivo sí es "use client".
    <div onClick={(e) => e.preventDefault()}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full rounded-full border-border/70 text-[13px] font-semibold"
          >
            <QrCode className="h-4 w-4" /> Ver QR
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR — {tableLabel}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt={`QR de ${tableLabel}`} className="h-56 w-56" />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center text-sm text-muted-foreground">
                Generando…
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Apunta la cámara del celular aquí para probar el enlace.
            </p>
            {/* Un QR impreso con el dominio equivocado es papel tirado:
                el aviso tiene que salir ANTES de imprimir. */}
            {warning && (
              <p className="flex items-start gap-2 rounded-lg bg-honey-soft px-3 py-2 text-[13px] text-honey-soft-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {warning}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-center">
            <Button onClick={handleDownload} disabled={!dataUrl}>
              <Download className="h-4 w-4" /> Descargar PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
