import {
  ChefHat,
  CircleCheck,
  CircleX,
  Hourglass,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";
import { toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/config/constants";

/**
 * How a customer reads an order state: always icon + text + tone, never
 * color alone. Same semantic palette as the staff POS (amber = waiting /
 * in the kitchen, green = ready, red = rejected), so a waiter looking at
 * the customer's phone reads the same thing they see on their panel.
 */
export const CUSTOMER_ORDER_STATE: Record<
  OrderStatus,
  { label: string; tone: PosTone; icon: LucideIcon }
> = {
  PENDING: { label: "Esperando aprobación", tone: "info", icon: Hourglass },
  ACCEPTED: { label: "En cocina", tone: "attention", icon: ChefHat },
  PREPARING: { label: "En cocina", tone: "attention", icon: ChefHat },
  READY: { label: "Listo", tone: "money-in", icon: CircleCheck },
  DELIVERED: { label: "Entregado", tone: "neutral", icon: PackageCheck },
  REJECTED: { label: "Rechazado", tone: "money-out", icon: CircleX },
  CANCELLED: { label: "Cancelado", tone: "money-out", icon: CircleX },
};

export function OrderStatusChip({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const state = CUSTOMER_ORDER_STATE[status];
  const Icon = state.icon;
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-caption font-semibold",
        toneSoft[state.tone],
        className
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
      {state.label}
    </span>
  );
}
