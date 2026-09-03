"use client";

import { useRouter } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { closeTableSession } from "@/lib/actions/tables";

/**
 * Señal explícita del personal de que una mesa quedó libre — necesaria
 * para el caso que "Pedir cuenta" no cubre: el cliente pagó en efectivo,
 * o simplemente se fue sin pasar por esa pantalla. Sin este botón, la
 * sesión de esa mesa seguiría "activa" para siempre y el próximo
 * cliente que escanee el mismo QR se mezclaría con la cuenta anterior
 * (resolve_table_qr reutiliza la sesión activa de la mesa).
 */
export function ReleaseTableButton({
  tableId,
  tableLabel,
}: {
  tableId: string;
  tableLabel: string;
}) {
  const router = useRouter();

  return (
    // Mismo motivo que TableQrDialog: esta card es un <Link> (Server
    // Component, no puede llevar onClick) — hay que evitar que abrir el
    // diálogo navegue a /orders.
    <div onClick={(e) => e.preventDefault()}>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <DoorOpen className="h-4 w-4" /> Liberar mesa
          </Button>
        }
        title="¿Liberar esta mesa?"
        description={`${tableLabel} quedará disponible para el próximo cliente. Usa esto cuando la cuenta se cobró sin pasar por "Pedir cuenta" (efectivo, o el cliente ya se fue).`}
        confirmLabel="Liberar"
        action={() => closeTableSession(tableId)}
        successMessage="Mesa liberada"
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
