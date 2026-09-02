import { formatPrice } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { RejectDialog } from "./reject-dialog";
import { acceptOrder, markDelivered } from "@/lib/actions/orders";
import type { StaffOrder } from "@/types/staff";

export function OrderCard({ order }: { order: StaffOrder }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">
            #{order.order_number} · Mesa {order.table_number}
          </p>
          <ElapsedTimer since={order.created_at} warnAfterMinutes={10} />
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {order.items.map((item) => (
          <p key={item.id} className="text-sm text-foreground">
            {item.quantity} × {item.product_name}
            {item.notes && (
              <span className="text-muted-foreground"> — {item.notes}</span>
            )}
          </p>
        ))}
      </div>

      {order.notes && (
        <p className="mt-2 text-sm italic text-muted-foreground">
          Nota: {order.notes}
        </p>
      )}

      <p className="mt-2 text-sm font-semibold text-wine">
        {formatPrice(order.total)}
      </p>

      {order.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <ActionButton
            action={() => acceptOrder(order.id)}
            successMessage="Pedido aceptado"
            className="flex-1"
          >
            Aceptar
          </ActionButton>
          <RejectDialog orderId={order.id} />
        </div>
      )}

      {(order.status === "ACCEPTED" || order.status === "PREPARING") && (
        <p className="mt-3 text-sm text-muted-foreground">
          Esperando a cocina…
        </p>
      )}

      {order.status === "READY" && (
        <ActionButton
          action={() => markDelivered(order.id)}
          successMessage="Pedido entregado"
          className="mt-3 w-full"
        >
          Marcar entregado
        </ActionButton>
      )}
    </div>
  );
}
