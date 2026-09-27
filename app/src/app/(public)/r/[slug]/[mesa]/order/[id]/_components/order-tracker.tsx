"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import { getOrderStatus } from "@/lib/actions/orders";
import { getSessionBill } from "@/lib/actions/billing";
import { useSessionUpdates } from "@/hooks/use-session-updates";
import type { OrderStatus } from "@/config/constants";
import type { CustomerOrder } from "@/types/staff";
import type { SessionBill } from "@/types/billing";

const MAX_FAILURES = 3;

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
 * Seguimiento en vivo del pedido.
 *
 * Antes era un sondeo cada 4 s con una Server Action. Como React
 * serializa las Server Actions, ese ciclo competía con la propia
 * navegación del cliente: tocar "Volver a la carta" podía quedarse
 * esperando detrás de una consulta en vuelo.
 *
 * Ahora escucha la señal de Realtime de su mesa (un aviso vacío que
 * emite un trigger de Postgres) y solo consulta cuando algo cambió. La
 * tabla `orders` sigue sin estar abierta a `anon`: los datos siguen
 * llegando por el RPC seguro que valida la cookie en el servidor.
 */
export function OrderTracker({
  initialOrder,
  channelName,
  initialSessionBill = null,
}: {
  initialOrder: CustomerOrder;
  /** null = sin sesión de mesa viva: no se suscribe ni consulta. */
  channelName: string | null;
  /** null = sin cobro activo o sin cuenta todavía. Ver get_session_bill. */
  initialSessionBill?: SessionBill;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [sessionBill, setSessionBill] = useState(initialSessionBill);
  const statusRef = useRef(initialOrder.status);
  const billStatusRef = useRef(initialSessionBill?.status ?? null);
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    const orderDone = TERMINAL.includes(statusRef.current);
    // La cuenta pasa a CLOSED cuando la sesión de mesa terminó: ya no hay
    // nada más que pueda cambiar. Mientras tanto (null, OPEN o PAID) se
    // sigue consultando — el cliente puede pedir la cuenta y pagar bien
    // después de que su pedido ya se entregó.
    const billDone = billStatusRef.current === "CLOSED";
    if (orderDone && billDone) return;

    const [orderResult, billResult] = await Promise.all([
      orderDone ? null : getOrderStatus(initialOrder.id),
      billDone ? null : getSessionBill(),
    ]);

    if (orderResult) {
      if (!orderResult.ok) {
        // Antes se ignoraba el fallo y se seguía sondeando en silencio
        // para siempre, incluso con la sesión ya expirada.
        if (++failures.current >= MAX_FAILURES) notify.error(orderResult.error);
      } else {
        failures.current = 0;
        if (orderResult.data.status !== statusRef.current) {
          notifyTransition(orderResult.data.status, orderResult.data.order_number);
          statusRef.current = orderResult.data.status;
        }
        setOrder(orderResult.data);
      }
    }

    if (billResult && billResult.ok) {
      billStatusRef.current = billResult.data?.status ?? null;
      setSessionBill(billResult.data);
    }
  }, [initialOrder.id]);

  useSessionUpdates({ channelName, onUpdate: refresh });

  const stepIndex = STEPS.findIndex((s) => s.status === order.status);
  const isRejectedOrCancelled =
    order.status === "REJECTED" || order.status === "CANCELLED";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6 px-4 py-6"
    >
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Pedido #{order.order_number}
        </h1>
        <p className="text-sm text-muted-foreground">
          Mesa {order.table_number} ·{" "}
          <span className="font-medium tabular-nums text-wine">
            {formatPrice(order.total)}
          </span>
        </p>
      </div>

      {sessionBill && (sessionBill.status === "PAID" || sessionBill.status === "CLOSED") && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4"
        >
          <CheckCircle2 aria-hidden className="h-6 w-6 shrink-0 text-success" />
          <div>
            <p className="font-medium text-success">Pagado · ¡gracias!</p>
            <p className="text-sm text-muted-foreground">
              Cuenta #{sessionBill.bill_number} · {formatPrice(sessionBill.total)}
            </p>
          </div>
        </div>
      )}

      {isRejectedOrCancelled ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4"
        >
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
        <ol
          aria-live="polite"
          aria-label="Progreso del pedido"
          className="flex flex-col gap-4 rounded-2xl bg-card p-4"
        >
          {STEPS.map((step, index) => {
            const done =
              index < stepIndex ||
              (index === stepIndex && order.status === "DELIVERED");
            const current = index === stepIndex && order.status !== "DELIVERED";
            return (
              <li
                key={step.status}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg",
                  current && "bg-primary-soft px-2 py-1.5"
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                ) : (
                  <Circle
                    className={cn(
                      "h-5 w-5 shrink-0",
                      current
                        ? "animate-pulse fill-primary-soft text-primary"
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
                  {current && (
                    <span className="sr-only"> (paso actual)</span>
                  )}
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
              <span className="text-wine">
                {formatPrice(item.subtotal)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t pt-2 text-sm font-semibold tabular-nums">
          <span>Total</span>
          <span className="text-wine">{formatPrice(order.total)}</span>
        </div>
      </div>
    </motion.div>
  );
}
