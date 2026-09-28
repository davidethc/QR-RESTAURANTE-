import { Check } from "lucide-react";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
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
    <div className="shadow-card flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="font-display text-display font-semibold leading-tight text-foreground">
          {order.place_label ?? order.table_name ?? `Mesa ${order.table_number}`}
        </p>
        <ElapsedTimer
          since={isReady && order.ready_at ? order.ready_at : sentToKitchenAt(order)}
          prefix={isReady ? "Listo hace" : "Enviado hace"}
          warnAfterMinutes={isReady ? 5 : 15}
          className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-base font-semibold"
        />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
        {order.items.map((item) => (
          <p key={item.id} className="text-xl leading-snug text-foreground">
            <span className="font-display font-semibold tabular-nums text-primary">
              {item.quantity}×
            </span>{" "}
            {item.product_name}
            {item.notes && (
              <span className="block text-lg italic leading-snug text-muted-foreground">
                {item.notes}
              </span>
            )}
          </p>
        ))}
      </div>

      {order.notes && (
        <p className="rounded-xl bg-secondary/70 px-3 py-2 text-lg italic leading-snug text-muted-foreground">
          Nota: {order.notes}
        </p>
      )}

      {readyStep && !isReady && (
        <ActionButton
          onSuccess={onDone}
          action={() => markReady(order.id)}
          size="lg"
          className="clay clay-primary h-16 rounded-full text-xl font-semibold"
        >
          <Check data-icon="inline-start" aria-hidden />
          Listo
        </ActionButton>
      )}

      {isReady && (
        <p className="font-display rounded-full bg-success/10 py-3.5 text-center text-lg font-semibold text-success">
          Esperando al mesero
        </p>
      )}
    </div>
  );
}
