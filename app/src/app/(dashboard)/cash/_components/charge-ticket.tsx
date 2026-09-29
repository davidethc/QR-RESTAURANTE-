"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatPrice } from "@/lib/utils";
import { ORDER_STATUS, SPLIT_MODE } from "@/config/constants";
import type { OrderStatus } from "@/config/constants";
import type { Bill } from "@/types/billing";

const ORDER_BADGE: Partial<Record<OrderStatus, { label: string; variant: "secondary" | "outline" }>> = {
  [ORDER_STATUS.PENDING]: { label: "Por aceptar", variant: "outline" },
  [ORDER_STATUS.ACCEPTED]: { label: "En cocina", variant: "outline" },
  [ORDER_STATUS.PREPARING]: { label: "En cocina", variant: "outline" },
  [ORDER_STATUS.READY]: { label: "Listo para llevar", variant: "outline" },
  [ORDER_STATUS.DELIVERED]: { label: "Entregado", variant: "secondary" },
};

/**
 * Ticket de la cuenta: ítems agrupados por pedido, cada grupo con el estado
 * del pedido en cocina. En modo "por ítems" cada fila es un checkbox con
 * toda la fila como blanco táctil (44 px o más): un cuadrito de 20 px sería
 * casi imposible de acertar con prisa en una tablet.
 *
 * Solo pinta: la selección y lo que queda por pagar los calcula la hoja.
 */
export function ChargeTicket({
  bill,
  remainingByItem,
  selectedItems,
  onToggleItem,
}: {
  bill: Bill;
  remainingByItem: Record<string, number>;
  selectedItems: Record<string, boolean>;
  onToggleItem: (itemId: string, checked: boolean) => void;
}) {
  const orders = bill.orders.filter((o) => o.billable);
  const selectable = bill.status === "OPEN" && bill.split_mode === SPLIT_MODE.ITEMS;

  if (orders.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-body-sm text-muted-foreground">
        Esta cuenta todavía no tiene pedidos.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4" aria-label="Consumo de la cuenta">
      {orders.map((order) => {
        const badge = ORDER_BADGE[order.status];
        return (
          <li key={order.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 border-b border-dashed border-border/80 pb-1.5">
              <span className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
                Pedido #{order.order_number}
              </span>
              {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
            </div>
            <ul className="flex flex-col">
              {order.items.map((item) => {
                const remaining = remainingByItem[item.id] ?? item.quantity;
                const paid = remaining <= 0;
                const showCheckbox = selectable && !paid;
                const line = (
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-body leading-snug">
                    <span className={cn("min-w-0 text-foreground", paid && "text-muted-foreground line-through decoration-1")}>
                      <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.product_name}
                      {remaining > 0 && remaining < item.quantity && (
                        <span className="text-meta text-muted-foreground"> · quedan {remaining}</span>
                      )}
                      {item.notes && (
                        <span className="block text-caption text-muted-foreground">{item.notes}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {paid && <span className="text-caption font-semibold text-success">Pagado</span>}
                      <span className="tabular-nums text-foreground">{formatPrice(item.subtotal)}</span>
                    </span>
                  </span>
                );
                return (
                  <li key={item.id}>
                    {showCheckbox ? (
                      <label
                        htmlFor={`bill-item-${item.id}`}
                        className={cn(
                          "-mx-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 transition-colors active:bg-secondary",
                          selectedItems[item.id] && "bg-primary-soft"
                        )}
                      >
                        <Checkbox
                          id={`bill-item-${item.id}`}
                          className="size-5 shrink-0"
                          checked={!!selectedItems[item.id]}
                          onCheckedChange={(checked) => onToggleItem(item.id, checked === true)}
                        />
                        {line}
                      </label>
                    ) : (
                      <div className="flex min-h-9 items-center py-1">{line}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
