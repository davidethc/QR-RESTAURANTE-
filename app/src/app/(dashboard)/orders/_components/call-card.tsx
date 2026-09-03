import { Bell, Receipt } from "lucide-react";
import { CallStatusBadge } from "@/components/shared/status-badge";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { handleCall } from "@/lib/actions/waiter-calls";
import { formatPrice } from "@/lib/utils";
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
              {call.table_name ?? `Mesa ${call.table_number}`}
            </p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
        <CallStatusBadge status={call.status} />
      </div>

      <ElapsedTimer since={call.created_at} warnAfterMinutes={5} className="mt-2" />

      {call.type === "BILL" && (
        <div className="mt-3 rounded-lg border bg-muted/40 p-3">
          {call.session_orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay pedidos registrados en esta mesa.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Con un solo pedido en la sesión (el caso normal, una
                  persona pidiendo) no tiene sentido separar por grupo —
                  se ve exactamente como antes. Agrupar por pedido solo
                  aporta cuando varias personas escanearon el mismo QR y
                  pidieron por rondas distintas: así el mesero ve de un
                  vistazo qué costó cada tanda, sin tener que preguntar. */}
              {call.session_orders.map((order, oi) => (
                <div key={order.order_number} className="flex flex-col gap-1">
                  {call.session_orders.length > 1 && (
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Pedido #{order.order_number}</span>
                      <span>{formatPrice(order.subtotal)}</span>
                    </div>
                  )}
                  {order.items.map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-sm text-foreground"
                    >
                      <span>
                        {item.quantity} × {item.product_name}
                      </span>
                      <span>{formatPrice(item.subtotal)}</span>
                    </div>
                  ))}
                  {call.session_orders.length > 1 &&
                    oi < call.session_orders.length - 1 && (
                      <div className="mt-1 border-t" />
                    )}
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t pt-1 text-sm font-semibold text-wine">
                <span>Total</span>
                <span>{formatPrice(call.session_total)}</span>
              </div>
            </div>
          )}
        </div>
      )}

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
