"use client";

import Image from "next/image";
import { ChefHat, CircleCheck, Clock, PackageCheck, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { cn, formatPrice } from "@/lib/utils";
import { ORDER_STATUS, SPLIT_MODE } from "@/config/constants";
import type { OrderStatus } from "@/config/constants";
import { linePromoView } from "@/lib/promotions";
import type { Bill, BillItem, BillOrder } from "@/types/billing";
import type { PromoLineFields } from "@/types/promotions";
import { PromoChip, PromoPrice } from "./checkout/promo-line";

const ORDER_BADGE: Partial<Record<OrderStatus, { label: string; tone: PosTone; icon: LucideIcon }>> = {
  [ORDER_STATUS.PENDING]: { label: "Por aceptar", tone: "attention", icon: Clock },
  [ORDER_STATUS.ACCEPTED]: { label: "En cocina", tone: "attention", icon: ChefHat },
  [ORDER_STATUS.PREPARING]: { label: "En cocina", tone: "attention", icon: ChefHat },
  [ORDER_STATUS.READY]: { label: "Listo para llevar", tone: "info", icon: PackageCheck },
  [ORDER_STATUS.DELIVERED]: { label: "Entregado", tone: "money-in", icon: CircleCheck },
};

/**
 * Ticket de la cuenta: ítems agrupados por pedido, cada grupo con el estado
 * del pedido en cocina. En modo "por ítems" cada fila es un checkbox con
 * toda la fila como blanco táctil (44 px o más): un cuadrito de 20 px sería
 * casi imposible de acertar con prisa en una tablet.
 *
 * Solo pinta: la selección y lo que queda por pagar los calcula la hoja.
 * Una línea con promoción (M13) muestra su etiqueta, el precio de lista
 * tachado y el subtotal neto (el que suma la cuenta).
 */
export function ChargeTicket({
  bill,
  remainingByItem,
  selectedItems,
  onToggleItem,
  selectable: selectableProp,
  lineActions,
}: {
  bill: Bill;
  /** Controles por línea (cantidad, menú); solo en líneas vivas y sin modo selección. */
  lineActions?: (item: BillItem, order: BillOrder) => React.ReactNode;
  /** Forzar si las filas se pueden marcar (por defecto: modo "por ítems"). */
  selectable?: boolean;
  remainingByItem: Record<string, number>;
  selectedItems: Record<string, boolean>;
  onToggleItem: (itemId: string, checked: boolean) => void;
}) {
  const orders = bill.orders.filter((o) => o.billable);
  const selectable = selectableProp ?? (bill.status === "OPEN" && bill.split_mode === SPLIT_MODE.ITEMS);

  if (orders.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-4 py-8 text-center text-body-sm text-muted-foreground">
        Esta cuenta todavía no tiene pedidos.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4 rounded-card border border-border bg-card p-4" aria-label="Consumo de la cuenta">
      {orders.map((order) => {
        const badge = ORDER_BADGE[order.status];
        return (
          <li key={order.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 pb-1">
              <span className="text-body-sm font-semibold text-foreground">Pedido #{order.order_number}</span>
              {badge && (
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft[badge.tone])}>
                  <badge.icon className="size-3.5" aria-hidden /> {badge.label}
                </span>
              )}
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {order.items.map((item) => {
                const remaining = remainingByItem[item.id] ?? item.quantity;
                const cancelled = item.cancelled === true;
                const paid = !cancelled && remaining <= 0;
                const showCheckbox = selectable && !paid && !cancelled;
                const actions = !selectable && !cancelled && lineActions ? lineActions(item, order) : null;
                const promo = linePromoView(item as BillItem & PromoLineFields);
                const showPromo = promo.hasPromo && !cancelled;
                const line = (
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <ItemThumb src={item.image_url} name={item.product_name} dimmed={cancelled || paid} />
                    <span className={cn("min-w-0 flex-1 text-body leading-snug", (cancelled || paid) && "text-muted-foreground")}>
                      <span className={cn("block font-semibold text-foreground", (cancelled || paid) && "font-medium text-muted-foreground line-through decoration-1")}>
                        {!actions && <span className="tabular-nums">{item.quantity}× </span>}
                        {item.product_name}
                        {item.variant_name ? <span className="font-normal text-muted-foreground"> · {item.variant_name}</span> : null}
                      </span>
                      <span className="block text-caption tabular-nums text-muted-foreground">
                        {formatPrice(item.unit_price)} c/u
                        {remaining > 0 && remaining < item.quantity && !cancelled && <> · quedan {remaining}</>}
                      </span>
                      {(item.options ?? []).map((o, k) => (
                        <span key={k} className="block text-caption text-muted-foreground">
                          + {o.qty > 1 ? `${o.qty}× ` : ""}{o.value_name}
                          {o.price_modifier ? ` (${formatPrice(o.price_modifier * o.qty)})` : ""}
                        </span>
                      ))}
                      {item.notes && <span className="block text-caption text-muted-foreground">{item.notes}</span>}
                      {showPromo && promo.labels.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {promo.labels.map((l) => (
                            <PromoChip key={l} label={l} />
                          ))}
                        </span>
                      )}
                    </span>
                  </span>
                );
                const trailing = (
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    {showPromo ? (
                      <PromoPrice list={promo.listSubtotal} net={item.subtotal} netClassName="text-body" className="flex-col items-end gap-0" />
                    ) : (
                      <span className={cn("text-body font-semibold tabular-nums text-foreground", cancelled && "font-medium text-muted-foreground line-through")}>
                        {formatPrice(item.subtotal)}
                      </span>
                    )}
                    {cancelled && <span className="text-caption font-semibold text-money-out-soft-foreground">Cancelado</span>}
                    {paid && (
                      <span className="inline-flex items-center gap-1 text-caption font-semibold text-money-in-soft-foreground">
                        <CircleCheck className="size-3.5" aria-hidden /> Pagado
                      </span>
                    )}
                  </span>
                );
                return (
                  <li key={item.id}>
                    {showCheckbox ? (
                      <label
                        htmlFor={`bill-item-${item.id}`}
                        className={cn(
                          "-mx-2 flex min-h-14 cursor-pointer items-center gap-3 rounded-control px-2 py-2 transition-colors duration-150 active:bg-secondary",
                          selectedItems[item.id] && "bg-money-in-soft ring-2 ring-money-in-border"
                        )}
                      >
                        <Checkbox
                          id={`bill-item-${item.id}`}
                          className="size-5 shrink-0"
                          checked={!!selectedItems[item.id]}
                          onCheckedChange={(checked) => onToggleItem(item.id, checked === true)}
                        />
                        {line}
                        {trailing}
                      </label>
                    ) : (
                      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 py-2">
                        {line}
                        {actions}
                        {trailing}
                      </div>
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

/** Foto del producto o, si no hay, un ícono en el mismo lugar. */
function ItemThumb({ src, name, dimmed }: { src?: string | null; name: string; dimmed?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-secondary text-muted-foreground",
        dimmed && "opacity-60"
      )}
    >
      {src ? (
        <Image src={src} alt={name} fill sizes="48px" className="object-cover" />
      ) : (
        <UtensilsCrossed className="size-5" aria-hidden />
      )}
    </span>
  );
}
