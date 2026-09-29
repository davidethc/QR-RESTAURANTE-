import { Check } from "lucide-react";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { markReady } from "@/lib/actions/orders";
import type { StaffOrder } from "@/types/staff";
import { sentToKitchenAt } from "./kitchen-statuses";

/**
 * Cocina no ve precios ni motivos de rechazo — solo lo que tiene que
 * cocinar. Letra grande y como mucho un botón por tarjeta: la pantalla
 * vive colgada, se mira desde lejos, no hay tiempo de leer texto chico.
 *
 * `readyStep` = el ajuste `kitchen_ready_step` del restaurante:
 * - true: ACCEPTED/PREPARING llevan el botón "Listo"; READY solo avisa
 *   que espera al mesero.
 * - false: la cocina solo mira. Ningún botón; la comanda desaparece
 *   cuando el mesero la marca entregada.
 */
export function KitchenOrderCard({
  order,
  readyStep,
  onDone,
}: {
  order: StaffOrder;
  readyStep: boolean;
  onDone?: () => void;
}) {
  const isReady = order.status === "READY";

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-display font-semibold leading-tight text-foreground">
          {order.place_label ?? order.table_name ?? `Mesa ${order.table_number}`}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <ElapsedTimer
            since={isReady && order.ready_at ? order.ready_at : sentToKitchenAt(order)}
            prefix={isReady ? "Listo hace" : "Enviado hace"}
            warnAfterMinutes={isReady ? 5 : 15}
            className="rounded-full bg-secondary px-2.5 py-1 text-body-lg font-semibold text-foreground"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        {order.items.map((item) => (
          <p key={item.id} className="text-xl leading-snug text-foreground">
            <span className="font-semibold tabular-nums text-primary">
              {item.quantity}×
            </span>{" "}
            {item.product_name}
            {item.notes && (
              <span className="block text-lg italic leading-snug text-foreground">
                {item.notes}
              </span>
            )}
          </p>
        ))}
      </div>

      {order.notes && (
        <p className="rounded-card bg-muted px-3 py-2 text-lg italic leading-snug text-foreground">
          Nota: {order.notes}
        </p>
      )}

      {readyStep && !isReady && (
        <ActionButton
          onSuccess={onDone}
          action={() => markReady(order.id)}
          size="lg"
          className="h-12 text-lg font-semibold"
        >
          <Check data-icon="inline-start" aria-hidden className="size-5" />
          Listo
        </ActionButton>
      )}

      {isReady && (
        <p className="rounded-badge bg-success-soft py-3.5 text-center text-lg font-semibold text-success-soft-foreground">
          Esperando al mesero
        </p>
      )}
    </div>
  );
}
