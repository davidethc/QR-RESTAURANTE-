"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notifications";
import { buildScanUrl, getQrUrlWarning } from "@/lib/qr";
import type { TableStatusRow } from "@/types/staff";

// Hoja A4 en milímetros, y una cuadrícula de 3x4: doce QR por hoja es
// la disposición estándar de las herramientas de impresión de códigos.
const A4 = { w: 210, h: 297 };
const MARGIN = 12;
const COLS = 3;
const ROWS = 4;

/**
 * Todos los QR del restaurante en un PDF listo para la imprenta.
 *
 * Antes solo se podía imprimir un QR a la vez desde su diálogo: con
 * veinte mesas eran veinte diálogos y veinte impresiones. Y aquello
 * abría una ventana con `document.write` interpolando el nombre del
 * local sin escapar, así que un nombre tan normal como "Café & Té"
 * bastaba para romper la página.
 *
 * `jspdf` se carga con importación dinámica: solo se descarga cuando el
 * dueño toca este botón, así que **no añade ni un byte al paquete que
 * recibe el cliente en la carta**, que es la restricción que manda en
 * todo el proyecto.
 */
export function TablesPdfButton({
  restaurantName,
  slug,
  tables,
}: {
  restaurantName: string;
  slug: string;
  tables: TableStatusRow[];
}) {
  const [isPending, setIsPending] = useState(false);

  async function handleDownload() {
    const warning = getQrUrlWarning();
    if (warning && !window.confirm(`${warning}\n\n¿Descargar de todas formas?`)) {
      return;
    }

    setIsPending(true);
    try {
      // Dinámico a propósito — ver el comentario de arriba.
      const { jsPDF } = await import("jspdf");
      // `compress` no es opcional aquí: sin él, cinco QR pesaban 5 MB
      // y con veinte mesas el archivo pasaría de 20 MB — imposible de
      // mandar por WhatsApp a la imprenta, que es para lo que existe.
      const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

      const cellW = (A4.w - MARGIN * 2) / COLS;
      const cellH = (A4.h - MARGIN * 2) / ROWS;
      const perPage = COLS * ROWS;

      for (const [index, table] of tables.entries()) {
        if (index > 0 && index % perPage === 0) doc.addPage();

        const slot = index % perPage;
        const x = MARGIN + (slot % COLS) * cellW;
        const y = MARGIN + Math.floor(slot / COLS) * cellH;

        // Líneas de corte: sin ellas hay que recortar a ojo.
        doc.setDrawColor(200);
        doc.setLineWidth(0.1);
        doc.rect(x, y, cellW, cellH);

        const label = table.name ?? `Mesa ${table.number}`;

        doc.setFontSize(9);
        doc.setTextColor(110);
        doc.text(restaurantName, x + cellW / 2, y + 8, {
          align: "center",
          maxWidth: cellW - 8,
        });

        doc.setFontSize(15);
        doc.setTextColor(20);
        doc.text(label, x + cellW / 2, y + 16, {
          align: "center",
          maxWidth: cellW - 8,
        });

        const qrSize = Math.min(cellW, cellH) - 28;
        const dataUrl = await QRCode.toDataURL(buildScanUrl(table.qr_token), {
          width: 420,
          margin: 1,
        });
        doc.addImage(
          dataUrl,
          "PNG",
          x + (cellW - qrSize) / 2,
          y + 20,
          qrSize,
          qrSize
        );

        doc.setFontSize(8);
        doc.setTextColor(110);
        doc.text(
          "Escanea para ver la carta y pedir",
          x + cellW / 2,
          y + cellH - 5,
          { align: "center", maxWidth: cellW - 6 }
        );
      }

      doc.save(`qr-${slug}.pdf`);
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "No se pudo generar el PDF"
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleDownload}
      disabled={isPending || tables.length === 0}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4" />
      )}
      PDF de QR
    </Button>
  );
}
