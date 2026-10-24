"use client";

import { useCallback, useRef, useState } from "react";
import {
  Check,
  ChefHat,
  CircleCheck,
  Hourglass,
  PackageCheck,
  Send,
  type LucideIcon,
} from "lucide-react";
import { toneSoft, toneSolid } from "@/components/shared/pos-tone";
import {
  CUSTOMER_ORDER_STATE,
  OrderStatusChip,
} from "../../../_components/order-status-chip";
import { cn, formatPrice } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import { getOrderStatus } from "@/lib/actions/orders";
import { getSessionBill } from "@/lib/actions/billing";
import { useSessionUpdates } from "@/hooks/use-session-updates";
import type { OrderStatus } from "@/config/constants";
import type { CustomerOrder } from "@/types/staff";
import type { SessionBill } from "@/types/billing";

const MAX_FAILURES = 3;

/**
 * Four steps, the way the customer lives it: sent, waiting for the waiter's
 * approval, in the kitchen, and ready/delivered. "Accept" and "start
 * preparing" are one waiter action, so ACCEPTED and PREPARING are the same
 * kitchen step. READY and DELIVERED share the last step: some kitchens never
 * mark "Listo" and the order jumps straight from the kitchen to delivered.
 */
const STEPS: {
  key: string;
  label: string;
  currentLabel: string;
  icon: LucideIcon;
  statuses: OrderStatus[];
}[] = [
  { key: "sent", label: "Pedido enviado", currentLabel: "Pedido enviado", icon: Send, statuses: [] },
  {
    key: "approval",
    label: "Aprobado por el mesero",
    currentLabel: "Esperando aprobación del mesero",
    icon: Hourglass,
    statuses: ["PENDING"],
  },
  {
    key: "kitchen",
    label: "Preparado en cocina",
    currentLabel: "En cocina",
    icon: ChefHat,
    statuses: ["ACCEPTED", "PREPARING"],
  },
  {
    key: "done",
    label: "Entregado",
    currentLabel: "Listo",
    icon: PackageCheck,
    statuses: ["READY", "DELIVERED"],
  },
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

  const stepIndex = STEPS.findIndex((s) => s.statuses.includes(order.status));
  const isDelivered = order.status === "DELIVERED";
  const isReady = order.status === "READY";
  const readyLabel =
    order.table_kind === "COUNTER" ? "Pasa a recoger" : "¡Listo! Ya sale";
  const isRejectedOrCancelled =
    order.status === "REJECTED" || order.status === "CANCELLED";
  const state = CUSTOMER_ORDER_STATE[order.status];
  const StateIcon = state.icon;
  const heroTitle = isReady
    ? readyLabel
    : order.status === "PENDING"
      ? "Esperando aprobación"
      : order.status === "REJECTED"
        ? "No pudimos aceptar tu pedido"
        : order.status === "CANCELLED"
          ? "Pedido cancelado"
          : state.label;
  const heroBody = isReady
    ? order.table_kind === "COUNTER"
      ? "Tu pedido te espera en el mostrador."
      : "Tu pedido va camino a tu mesa."
    : order.status === "PENDING"
      ? "El mesero revisa tu pedido y lo pasa a cocina."
      : order.status === "ACCEPTED" || order.status === "PREPARING"
        ? "La cocina está preparando tu pedido."
        : order.status === "DELIVERED"
          ? "Buen provecho."
          : order.rejection_reason
            ? `Motivo: ${order.rejection_reason}`
            : "Si tienes dudas, pregúntale al mesero.";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-display font-bold leading-tight text-foreground">
            Pedido #{order.order_number}
          </h1>
          <p className="mt-0.5 text-body-sm text-muted-foreground">
            Mesa {order.table_number} · {order.items.length}{" "}
            {order.items.length === 1 ? "producto" : "productos"}
          </p>
        </div>
        <OrderStatusChip status={order.status} className="mt-1.5" />
      </div>

      {sessionBill && (sessionBill.status === "PAID" || sessionBill.status === "CLOSED") && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-money-in-border bg-money-in-soft p-4"
        >
          <CircleCheck aria-hidden className="size-6 shrink-0 text-money-in-soft-foreground" />
          <div>
            <p className="text-body font-semibold text-money-in-soft-foreground">Pagado · ¡gracias!</p>
            <p className="text-body-sm text-muted-foreground">
              Cuenta #{sessionBill.bill_number} · {formatPrice(sessionBill.total)}
            </p>
          </div>
        </div>
      )}

      {/* Hero: the state in one sentence, with icon + tone. */}
      <div
        role={isRejectedOrCancelled ? "alert" : "status"}
        aria-live="polite"
        className={cn(
          "flex items-start gap-3.5 rounded-2xl border p-4",
          toneSoft[state.tone],
          state.tone === "neutral" && "bg-card"
        )}
      >
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            toneSolid[state.tone]
          )}
        >
          <StateIcon aria-hidden className="size-6" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-title font-bold leading-tight">{heroTitle}</p>
          <p className="mt-1 text-body-sm text-foreground/80">{heroBody}</p>
        </div>
      </div>

      {!isRejectedOrCancelled && (
        <ol
          aria-label="Progreso del pedido"
          className="flex flex-col rounded-2xl border border-border bg-card px-4 py-2"
        >
          {STEPS.map((step, index) => {
            const done = index < stepIndex || (index === stepIndex && isDelivered);
            const current = index === stepIndex && !isDelivered;
            const Icon = step.icon;
            const last = index === STEPS.length - 1;
            return (
              <li
                key={step.key}
                aria-current={current ? "step" : undefined}
                className="relative flex items-center gap-3 py-2.5"
              >
                {!last && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-[17px] top-[calc(50%+18px)] h-[calc(100%-36px)] w-0.5 rounded-full",
                      done ? "bg-money-in" : "bg-border"
                    )}
                  />
                )}
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border-2",
                    done && "border-money-in bg-money-in text-money-in-foreground",
                    current && cn("border-transparent", toneSolid[state.tone]),
                    !done && !current && "border-border bg-card text-muted-foreground"
                  )}
                >
                  {done ? (
                    <Check aria-hidden className="size-4" strokeWidth={3} />
                  ) : (
                    <Icon aria-hidden className="size-4" strokeWidth={2.25} />
                  )}
                </span>
                <span
                  className={cn(
                    "text-body",
                    current ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {current
                    ? step.key === "done" && isReady
                      ? readyLabel
                      : step.currentLabel
                    : step.label}
                  {current && <span className="sr-only"> (paso actual)</span>}
                  {done && <span className="sr-only"> (hecho)</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <section aria-labelledby="order-detail" className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 id="order-detail" className="border-b border-border bg-secondary/60 px-4 py-2.5 text-body-sm font-bold text-foreground">
          Detalle del pedido
        </h2>
        <ul className="flex flex-col divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="min-w-0 text-body text-foreground">
                <span className="font-semibold tabular-nums text-primary">{item.quantity}×</span>{" "}
                {item.product_name}
                {item.notes && (
                  <span className="block text-meta italic text-muted-foreground">{item.notes}</span>
                )}
              </span>
              <span className="shrink-0 text-body tabular-nums">{formatPrice(item.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-border px-4 py-3">
          <span className="text-body font-semibold text-muted-foreground">Total</span>
          <span className="font-display text-title font-bold tabular-nums text-foreground">
            {formatPrice(order.total)}
          </span>
        </div>
      </section>
    </div>
  );
}
