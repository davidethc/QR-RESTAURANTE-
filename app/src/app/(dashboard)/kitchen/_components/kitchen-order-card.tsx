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
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-bold text-foreground">
          {order.table_name ?? `Mesa ${order.table_number}`}
        </p>
        <ElapsedTimer
          since={order.created_at}
          warnAfterMinutes={10}
          className="text-base font-semibold"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {order.items.map((item) => (
          <p key={item.id} className="text-lg text-foreground">
            <span className="font-bold">{item.quantity}×</span>{" "}
            {item.product_name}
            {item.notes && (
              <span className="block text-base italic text-muted-foreground">
                {item.notes}
              </span>
            )}
          </p>
        ))}
      </div>

      {order.notes && (
        <p className="text-base italic text-muted-foreground">
          Nota: {order.notes}
        </p>
      )}

      {order.status === "ACCEPTED" && (
        <ActionButton
          action={() => startPreparing(order.id)}
          successMessage="En preparación"
          size="lg"
          className="h-14 text-lg font-bold"
        >
          Preparar
        </ActionButton>
      )}

      {order.status === "PREPARING" && (
        <ActionButton
          action={() => markReady(order.id)}
          successMessage="Pedido listo"
          size="lg"
          className="h-14 text-lg font-bold"
        >
          Marcar listo
        </ActionButton>
      )}

      {order.status === "READY" && (
        <p className="rounded-lg bg-primary/10 py-3 text-center text-lg font-semibold text-primary">
          Listo — esperando al mesero
        </p>
      )}
    </div>
  );
}
