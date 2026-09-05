import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { startPreparing, markReady } from "@/lib/actions/orders";
import type { StaffOrder } from "@/types/staff";

/**
 * Cocina no ve precios ni motivos de rechazo — solo lo que tiene que
 * cocinar. Letra grande y un solo botón por tarjeta: la pantalla vive
 * colgada, se mira desde lejos, no hay tiempo de leer texto chico.
 */
export function KitchenOrderCard({ order }: { order: StaffOrder }) {
  return (
    <div className="shadow-card flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-[26px] font-semibold leading-tight text-foreground">
          {order.table_name ?? `Mesa ${order.table_number}`}
        </p>
        <ElapsedTimer
          since={order.created_at}
          warnAfterMinutes={10}
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

      {order.status === "ACCEPTED" && (
        <ActionButton
          action={() => startPreparing(order.id)}
          successMessage="En preparación"
          size="lg"
          className="clay clay-primary h-16 rounded-full text-xl font-semibold"
        >
          Preparar
        </ActionButton>
      )}

      {order.status === "PREPARING" && (
        <ActionButton
          action={() => markReady(order.id)}
          successMessage="Pedido listo"
          size="lg"
          className="clay clay-primary h-16 rounded-full text-xl font-semibold"
        >
          Marcar listo
        </ActionButton>
      )}

      {order.status === "READY" && (
        <p className="font-display rounded-full bg-primary/10 py-3.5 text-center text-lg font-semibold text-primary">
          Listo — esperando al mesero
        </p>
      )}
    </div>
  );
}
