import { Bell, Receipt } from "lucide-react";
import { CallStatusBadge } from "@/components/shared/status-badge";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { handleCall } from "@/lib/actions/waiter-calls";
import { formatPrice, cn } from "@/lib/utils";
import type { StaffWaiterCall } from "@/types/staff";

/**
 * Tarjeta de solicitud (llamar al mesero / pedir la cuenta).
 *
 * Antes se veía igual que un pedido y se perdía entre ellos. Ahora se
 * lee como un aviso: un disco de color con el ícono a la izquierda
 * dice de un vistazo QUÉ pide la mesa (campana = atención, recibo =
 * cuenta) sin necesidad de leer, y mientras está pendiente la tarjeta
 * lleva un anillo del color de ese aviso — así en una lista mixta el
 * ojo va primero a lo que nadie ha atendido todavía. El detalle de la
 * cuenta va en su propio panel para que se lea como una nota de
 * consumo y no como más contenido de la tarjeta.
 */
export function CallCard({ call }: { call: StaffWaiterCall }) {
  const isBill = call.type === "BILL";
  const Icon = isBill ? Receipt : Bell;
  const label = isBill ? "Solicita la cuenta" : "Solicita atención";
  const pending = call.status === "PENDING";

  return (
    <div
      className={cn(
        "shadow-card rounded-2xl border bg-card p-4",
        pending
          ? isBill
            ? "border-wine/30 ring-1 ring-wine/15"
            : "border-primary/30 ring-1 ring-primary/15"
          : "border-border/70"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              isBill
                ? "bg-wine/12 text-wine"
                : "bg-primary/12 text-primary"
            )}
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="font-display truncate text-[17px] font-semibold leading-tight text-foreground">
              {call.table_name ?? `Mesa ${call.table_number}`}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-tight text-muted-foreground">
              <span className="font-medium text-foreground/80">{label}</span>
              <ElapsedTimer since={call.created_at} warnAfterMinutes={5} />
            </p>
          </div>
        </div>
        <CallStatusBadge status={call.status} />
      </div>

      {isBill && (
        <div className="mt-3 rounded-xl border border-border/60 bg-secondary/50 p-3">
          {call.session_orders.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
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
                    <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>Pedido #{order.order_number}</span>
                      <span className="tabular-nums">
                        {formatPrice(order.subtotal)}
                      </span>
                    </div>
                  )}
                  {order.items.map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between gap-3 text-[14px] leading-snug text-foreground"
                    >
                      <span>
                        <span className="font-semibold tabular-nums">
                          {item.quantity}×
                        </span>{" "}
                        {item.product_name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatPrice(item.subtotal)}
                      </span>
                    </div>
                  ))}
                  {call.session_orders.length > 1 &&
                    oi < call.session_orders.length - 1 && (
                      <div className="mt-1 border-t border-border/60" />
                    )}
                </div>
              ))}
              <div className="mt-1 flex items-baseline justify-between border-t border-border/60 pt-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <span className="font-display text-xl font-semibold tabular-nums text-wine">
                  {formatPrice(call.session_total)}
                </span>
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
            className="clay clay-primary h-12 flex-1 rounded-full text-[15px] font-semibold"
          >
            Atender
          </ActionButton>
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-full border-border/70 text-[15px] font-semibold"
              >
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
          className="clay clay-primary mt-3 h-12 w-full rounded-full text-[15px] font-semibold"
        >
          Marcar atendida
        </ActionButton>
      )}
    </div>
  );
}
