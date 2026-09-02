"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TableQrDialog({
  restaurantName,
  tableLabel,
  qrToken,
}: {
  restaurantName: string;
  tableLabel: string;
  qrToken: string;
}) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const scanUrl = `${window.location.origin}/scan/${qrToken}`;
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

  function handlePrint() {
    if (!dataUrl) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>QR — ${tableLabel}</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; }
            img { width: 320px; height: 320px; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            h2 { font-size: 16px; font-weight: normal; color: #555; margin-top: 0; }
            p { margin-top: 16px; font-size: 14px; color: #555; }
          </style>
        </head>
        <body>
          <h1>${restaurantName}</h1>
          <h2>${tableLabel}</h2>
          <img src="${dataUrl}" alt="QR" />
          <p>Escanea para ver la carta y pedir</p>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
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
        </div>
        <DialogFooter className="gap-2 sm:justify-center">
          <Button variant="outline" onClick={handleDownload} disabled={!dataUrl}>
            <Download className="h-4 w-4" /> Descargar PNG
          </Button>
          <Button onClick={handlePrint} disabled={!dataUrl}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
