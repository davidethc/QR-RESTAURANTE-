import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSessionOrders } from "@/lib/actions/orders";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import type { OrderStatus } from "@/config/constants";

const ACTIVE_STATUSES = new Set<OrderStatus>([
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
]);

/**
 * Si el cliente vuelve a la carta con un pedido en curso, se lo
 * recordamos — regla de negocio: "el cliente puede ver el estado
 * de su pedido en cualquier momento", no solo justo después de pedir.
 */
export async function ActiveOrdersBanner({
  slug,
  tableNumber,
}: {
  slug: string;
  tableNumber: number;
}) {
  const result = await getSessionOrders();
  if (!result.ok) return null;

  const active = result.data.filter((order) =>
    ACTIVE_STATUSES.has(order.status)
  );
  if (active.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b bg-accent/40 px-4 py-3">
      {active.map((order) => (
        <Link
          key={order.id}
          href={`/r/${slug}/${tableNumber}/order/${order.id}`}
          className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
        >
          <span className="text-sm font-medium text-foreground">
            Pedido #{order.order_number}
          </span>
          <span className="flex items-center gap-1.5">
            <OrderStatusBadge status={order.status} />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </span>
        </Link>
      ))}
    </div>
  );
}
