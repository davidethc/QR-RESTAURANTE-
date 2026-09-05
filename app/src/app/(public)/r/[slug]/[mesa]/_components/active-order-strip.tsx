"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { OrderStatusBadge } from "@/components/shared/status-badge";
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
    <div className="border-b border-border bg-card">
      {/* Colapsado por defecto: con varios pedidos, ver el detalle de
          todos es la excepción, no la norma. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
      >
        <span className="flex-1 text-[15px] font-medium text-foreground">
          {orders.length} pedidos en curso
        </span>
        <OrderStatusBadge status={mostAdvanced.status} />
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      <div hidden={!expanded}>
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
        "flex min-h-13 items-center gap-3 bg-card px-4 py-3 active:bg-muted",
        nested ? "border-t border-border/60 pl-6" : "border-b border-border"
      )}
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="text-[15px] font-medium text-foreground">
          Pedido #{order.order_number}
        </span>
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {order.item_count} {order.item_count === 1 ? "plato" : "platos"}
        </span>
      </span>
      <OrderStatusBadge status={order.status} />
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
