"use client";

import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { requestBillAsStaff } from "@/lib/actions/waiter-calls";

/**
 * El mesero marca que esta mesa pidió la cuenta, cuando se la piden de viva
 * voz en vez de por el teléfono.
 *
 * Solo se muestra si la mesa tiene consumo (`active_total > 0`), que es la
 * misma condición que valida la base: así el botón nunca aparece en un caso
 * en el que fallaría.
 */
export function RequestBillButton({
  tableId,
  tableLabel,
}: {
  tableId: string;
  tableLabel: string;
}) {
  const router = useRouter();

  return (
    <div onClick={(e) => e.preventDefault()}>
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full rounded-full text-[13px] font-semibold text-muted-foreground"
          >
            <Receipt className="h-4 w-4" /> Pidió la cuenta
          </Button>
        }
        title="¿Marcar que pidió la cuenta?"
        description={`${tableLabel} quedará en la pestaña Solicitudes, como si el cliente la hubiera pedido desde su teléfono.`}
        confirmLabel="Marcar"
        action={() => requestBillAsStaff(tableId)}
        successMessage="Cuenta solicitada"
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
