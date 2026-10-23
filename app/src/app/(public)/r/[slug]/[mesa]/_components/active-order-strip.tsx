"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { OrderStatusChip } from "./order-status-chip";
import { useTableStatus } from "./table-status-provider";
import { cn } from "@/lib/utils";
import type { SessionOrderSummary } from "@/types/staff";

// El más avanzado del grupo: si un pedido ya está listo, eso es lo que
// el cliente quiere ver resumido, no que otro siga pendiente.
const PROGRESS_ORDER = ["PENDING", "ACCEPTED", "PREPARING", "READY"];

/**
 * Lo que la mesa tiene en curso, en una línea.
 *
 * Antes eran hasta tres filas con tarjeta y borde sobre una banda
 * tostada — ~250px antes de que empezara la carta, justo después de
 * comprimir la cabecera para ganar ese espacio. Y las solicitudes se
 * anunciaban aquí arriba mientras el botón de abajo seguía diciendo
 * "Llamar mesero" como si no hubiera pasado nada.
 *
 * Ahora aquí solo vive el pedido, que es lo único donde el cliente
 * quiere entrar. El estado de las solicitudes se muestra en los propios
 * botones que las provocaron (ver service-buttons.tsx).
 */
export function ActiveOrderStrip({
  slug,
  tableNumber,
}: {
  slug: string;
  tableNumber: number;
}) {
  const { orders } = useTableStatus();
  const [expanded, setExpanded] = useState(false);

  function hrefFor(order: SessionOrderSummary) {
    return `/r/${slug}/${tableNumber}/order/${order.id}`;
  }

  if (orders.length === 0) return null;
  if (orders.length === 1) return <OrderRow order={orders[0]} href={hrefFor(orders[0])} />;

  const mostAdvanced = [...orders].sort(
    (a, b) => PROGRESS_ORDER.indexOf(b.status) - PROGRESS_ORDER.indexOf(a.status)
  )[0];

  return (
    <div>
      {/* Collapsed by default: with several orders, seeing every one is
          the exception, not the rule. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-secondary/60 active:bg-secondary"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          <ClipboardList aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-lg font-semibold text-foreground">
            {orders.length} pedidos en curso
          </span>
          <span className="text-meta text-muted-foreground">Toca para ver cada uno</span>
        </span>
        <OrderStatusChip status={mostAdvanced.status} />
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            expanded && "rotate-180"
          )}
        />
      </button>

      <div hidden={!expanded} className="border-t border-border bg-secondary/40">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} href={hrefFor(order)} nested />
        ))}
      </div>
    </div>
  );
}

function OrderRow({
  order,
  href,
  nested,
}: {
  order: SessionOrderSummary;
  href: string;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-secondary/60 active:bg-secondary",
        nested && "border-b border-border/70 last:border-b-0"
      )}
    >
      {!nested && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          <ClipboardList aria-hidden className="size-5" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-lg font-semibold text-foreground">
          Pedido #{order.order_number}
        </span>
        <span className="text-meta text-muted-foreground">
          {order.item_count} {order.item_count === 1 ? "plato" : "platos"} · Ver estado
        </span>
      </span>
      <OrderStatusChip status={order.status} />
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
