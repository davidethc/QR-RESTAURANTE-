import { formatPrice } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { RejectDialog } from "./reject-dialog";
import {
  acceptOrder,
  markDelivered,
  startPreparing,
  markReady,
} from "@/lib/actions/orders";
import type { StaffOrder } from "@/types/staff";

/**
 * Tarjeta de pedido del panel.
 *
 * Jerarquía pensada para leerse de lejos y con prisa: primero DE QUÉ
 * MESA es (serif de display, el dato con el que el mesero camina),
 * luego qué lleva, y al final el precio en granate. El volumen (clay)
 * queda reservado al botón que hace avanzar el pedido — uno solo por
 * tarjeta — para que sea obvio dónde tocar sin leer.
 */
export function OrderCard({ order }: { order: StaffOrder }) {
  return (
    <div className="shadow-card rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display truncate text-[17px] font-semibold leading-tight text-foreground">
            {order.table_name ?? `Mesa ${order.table_number}`}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-tight text-muted-foreground">
              #{order.order_number}
            </span>
            <ElapsedTimer since={order.created_at} warnAfterMinutes={10} />
          </div>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 flex flex-col gap-1.5 border-t border-border/60 pt-3">
        {order.items.map((item) => (
          <p
            key={item.id}
            className="text-[15px] leading-snug text-foreground"
          >
            <span className="font-display font-semibold tabular-nums text-primary">
              {item.quantity}×
            </span>{" "}
            {item.product_name}
            {item.notes && (
              <span className="block text-[13px] italic leading-snug text-muted-foreground">
                {item.notes}
              </span>
            )}
          </p>
        ))}
      </div>

      {order.notes && (
        <p className="mt-2.5 rounded-xl bg-secondary/70 px-3 py-2 text-[13px] italic leading-snug text-muted-foreground">
          Nota: {order.notes}
        </p>
      )}

      <p className="font-display mt-3 text-lg font-semibold tabular-nums text-wine">
        {formatPrice(order.total)}
      </p>

      {order.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <ActionButton
            action={() => acceptOrder(order.id)}
            successMessage="Pedido aceptado — en preparación"
            className="clay clay-primary h-12 flex-1 rounded-full text-[15px] font-semibold"
          >
            Aceptar
          </ActionButton>
          <RejectDialog orderId={order.id} />
        </div>
      )}

      {order.status === "ACCEPTED" && (
        <ActionButton
          action={() => startPreparing(order.id)}
          successMessage="En preparación"
          className="clay clay-primary mt-3 h-12 w-full rounded-full text-[15px] font-semibold"
        >
          Preparar
        </ActionButton>
      )}

      {order.status === "PREPARING" && (
        <ActionButton
          action={() => markReady(order.id)}
          successMessage="Pedido listo"
          className="clay clay-primary mt-3 h-12 w-full rounded-full text-[15px] font-semibold"
        >
          Marcar listo
        </ActionButton>
      )}

      {order.status === "READY" && (
        <ActionButton
          action={() => markDelivered(order.id)}
          successMessage="Pedido entregado"
          className="clay clay-primary mt-3 h-12 w-full rounded-full text-[15px] font-semibold"
        >
          Marcar entregado
        </ActionButton>
      )}
    </div>
  );
}
