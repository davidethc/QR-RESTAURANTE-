import { Bell, Receipt } from "lucide-react";
import { CallStatusBadge } from "@/components/shared/status-badge";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { handleCall } from "@/lib/actions/waiter-calls";
import type { StaffWaiterCall } from "@/types/staff";

export function CallCard({ call }: { call: StaffWaiterCall }) {
  const Icon = call.type === "BILL" ? Receipt : Bell;
  const label = call.type === "BILL" ? "Solicita la cuenta" : "Solicita atención";

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-wine" />
          <div>
            <p className="font-semibold text-foreground">
              Mesa {call.table_number}
            </p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
        <CallStatusBadge status={call.status} />
      </div>

      <ElapsedTimer since={call.created_at} warnAfterMinutes={5} className="mt-2" />

      {call.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <ActionButton
            action={() => handleCall(call.id, "ACCEPTED")}
            successMessage="En proceso"
            className="flex-1"
          >
            Atender
          </ActionButton>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="flex-1">
                Rechazar
              </Button>
            }
            title="¿Rechazar solicitud?"
            destructive
            confirmLabel="Rechazar"
            action={() => handleCall(call.id, "REJECTED")}
            successMessage="Solicitud rechazada"
          />
        </div>
      )}

      {call.status === "ACCEPTED" && (
        <ActionButton
          action={() => handleCall(call.id, "ATTENDED")}
          successMessage="Solicitud atendida"
          className="mt-3 w-full"
        >
          Marcar atendida
        </ActionButton>
      )}
    </div>
  );
}
