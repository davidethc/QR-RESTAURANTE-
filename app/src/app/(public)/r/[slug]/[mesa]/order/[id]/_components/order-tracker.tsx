"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import { getOrderStatus } from "@/lib/actions/orders";
import type { OrderStatus } from "@/config/constants";
import type { CustomerOrder } from "@/types/staff";

const POLL_MS = 4000;

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "PENDING", label: "Pedido recibido" },
  { status: "ACCEPTED", label: "Aceptado" },
  { status: "PREPARING", label: "Preparando" },
  { status: "READY", label: "Listo" },
  { status: "DELIVERED", label: "Entregado" },
];

const TERMINAL: OrderStatus[] = ["DELIVERED", "REJECTED", "CANCELLED"];

/**
 * "Aceptar" y "empezar a preparar" ahora pasan en la misma acción del
 * mesero (un solo RPC atómico) — el pedido nunca se queda visible en
 * ACCEPTED el tiempo suficiente como para que el sondeo del cliente lo
 * capture; salta directo a PREPARING. Por eso PREPARING dispara el
 * mismo aviso que antes disparaba ACCEPTED — si no, el cliente nunca
 * se entera de que su pedido fue aceptado hasta que está listo.
 */
function notifyTransition(status: OrderStatus, orderNumber: number) {
  if (status === "ACCEPTED" || status === "PREPARING")
    notify.orderAccepted(orderNumber);
  else if (status === "READY") notify.orderReadyForCustomer(orderNumber);
  else if (status === "DELIVERED") notify.orderDelivered(orderNumber);
  else if (status === "REJECTED") notify.orderRejected(orderNumber, null);
}

/**
 * El cliente es anónimo: no puede suscribirse a Realtime de Postgres
 * (RLS solo permite SELECT a personal autenticado). El seguimiento en
 * vivo se logra con un sondeo corto sobre el RPC seguro — el mismo
 * resultado visible ("se actualiza solo"), sin abrir la tabla a nadie.
 */
export function OrderTracker({ initialOrder }: { initialOrder: CustomerOrder }) {
  const [order, setOrder] = useState(initialOrder);
  const statusRef = useRef(initialOrder.status);

  useEffect(() => {
    if (TERMINAL.includes(statusRef.current)) return;

    const interval = setInterval(async () => {
      const result = await getOrderStatus(initialOrder.id);
      if (!result.ok) return;

      if (result.data.status !== statusRef.current) {
        notifyTransition(result.data.status, result.data.order_number);
        statusRef.current = result.data.status;
      }
      setOrder(result.data);

      if (TERMINAL.includes(result.data.status)) clearInterval(interval);
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [initialOrder.id]);

  const stepIndex = STEPS.findIndex((s) => s.status === order.status);
  const isRejectedOrCancelled =
    order.status === "REJECTED" || order.status === "CANCELLED";

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Pedido #{order.order_number}
        </h1>
        <p className="text-sm text-muted-foreground">
          Mesa {order.table_number} · {formatPrice(order.total)}
        </p>
      </div>

      {isRejectedOrCancelled ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">
            {order.status === "REJECTED"
              ? "No pudimos aceptar tu pedido"
              : "Pedido cancelado"}
          </p>
          {order.rejection_reason && (
            <p className="mt-1 text-sm text-destructive/90">
              Motivo: {order.rejection_reason}
            </p>
          )}
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, index) => {
            const done =
              index < stepIndex ||
              (index === stepIndex && order.status === "DELIVERED");
            const current = index === stepIndex && order.status !== "DELIVERED";
            return (
              <li key={step.status} className="flex items-center gap-3">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <Circle
                    className={cn(
                      "h-5 w-5 shrink-0",
                      current
                        ? "animate-pulse fill-primary/20 text-primary"
                        : "text-muted-foreground/40"
                    )}
                  />
                )}
                <span
                  className={cn(
                    "text-sm",
                    done || current
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-2 text-sm font-medium text-foreground">
          Detalle del pedido
        </p>
        <div className="flex flex-col gap-1.5">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {item.quantity} × {item.product_name}
                {item.notes && (
                  <span className="italic"> — {item.notes}</span>
                )}
              </span>
              <span className="text-foreground">
                {formatPrice(item.subtotal)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t pt-2 text-sm font-semibold">
          <span>Total</span>
          <span>{formatPrice(order.total)}</span>
        </div>
      </div>
    </div>
  );
}
