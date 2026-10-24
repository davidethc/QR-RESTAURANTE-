"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Ban,
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  Inbox,
  Loader2,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  TimerOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmOnlineOrder, fetchOnlineOrder } from "@/lib/actions/digital-menu";
import {
  PAYMENT_LABELS,
  SERVICE_LABELS,
  STEP_LABELS,
  TRACKING_STEPS,
  composeOnlineOrderMessage,
  formatCountdown,
  isFinalStep,
  orderLabel,
  trackingIndex,
  whatsappLink,
} from "@/lib/digital-menu";
import { cn, formatPrice } from "@/lib/utils";
import type { OnlineAddress, OnlineOrder, OnlineOrderStep } from "@/types/digital-menu";
import { contactStorageKey } from "../../../_components/order-sheet";

const STEP_ICONS: Record<OnlineOrderStep, LucideIcon> = {
  new: Inbox,
  confirmed: ShieldCheck,
  preparing: ChefHat,
  ready: PackageCheck,
  delivered: CheckCircle2,
  expired: TimerOff,
  rejected: Ban,
  cancelled: Ban,
};

const POLL_MS = 15_000;

export function OnlineOrderTracker({ initialOrder }: { initialOrder: OnlineOrder }) {
  const [order, setOrder] = useState(initialOrder);
  const [contact, setContact] = useState<{ phone?: string; address?: Partial<OnlineAddress> | null } | undefined>();
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const token = order.tracking_token;

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(contactStorageKey(token));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists on the client
      if (raw) setContact(JSON.parse(raw));
    } catch {
      // No stored contact: the message goes without phone/address.
    }
  }, [token]);

  // Clock for the expiry countdown (client only, avoids hydration mismatch).
  useEffect(() => {
    if (order.step !== "new") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the client clock
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [order.step]);

  // Anonymous customers have no Realtime channel: a light poll until the end.
  useEffect(() => {
    if (isFinalStep(order.step)) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetchOnlineOrder(token);
      if (r.ok) setOrder(r.data);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [order.step, token]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const r = await confirmOnlineOrder(token);
      if (r.ok) setOrder(r.data);
      else setError(r.error);
    });
  }

  const remaining = order.expires_at && now !== null ? Date.parse(order.expires_at) - now : null;
  const expiredLocally = order.step === "new" && remaining !== null && remaining <= 0;
  const step: OnlineOrderStep = expiredLocally ? "expired" : order.step;
  const failed = step === "expired" || step === "rejected" || step === "cancelled";
  const index = trackingIndex(step);
  const steps = TRACKING_STEPS;
  const message = composeOnlineOrderMessage(order, contact);
  const waUrl = whatsappLink(order.restaurant.whatsapp_number, message);
  const StepIcon = STEP_ICONS[step];

  return (
    <main className="min-h-dvh bg-background pb-12">
      <header className="bg-primary-dark text-primary-dark-foreground">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-3.5">
          <h1 className="font-display min-w-0 flex-1 truncate text-title font-bold">{order.restaurant.name}</h1>
          <span className="shrink-0 rounded-xl bg-honey px-3 py-1.5 font-display text-title font-bold tabular-nums text-honey-foreground">
            {orderLabel(order)}
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4">
        <section
          aria-live="polite"
          className={cn(
            "flex flex-col gap-3 rounded-2xl border p-4",
            failed ? "border-money-out-border bg-money-out-soft" : step === "new" ? "border-attention-border bg-attention-soft" : "border-money-in-border bg-money-in-soft"
          )}
        >
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card">
              <StepIcon aria-hidden className="size-6 text-foreground" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-title-sm font-bold text-foreground">
                {step === "new" ? "Falta un paso: confirma tu pedido" : STEP_LABELS[step]}
              </p>
              <p className="text-body-sm text-foreground/80">
                {step === "new" && "Envíalo por WhatsApp o confírmalo aquí para que el restaurante lo prepare."}
                {step === "confirmed" && "El restaurante lo está revisando y te avisará el costo del envío si aplica."}
                {step === "preparing" && "Tu pedido ya está en cocina."}
                {step === "ready" && (order.service_type === "pickup" ? "Ya puedes pasar a recogerlo." : "Sale en camino muy pronto.")}
                {step === "delivered" && "¡Gracias por tu pedido!"}
                {step === "expired" && "Venció sin confirmarse. Puedes hacer uno nuevo cuando quieras."}
                {step === "rejected" && "El restaurante no pudo aceptarlo. Escríbele por WhatsApp si tienes dudas."}
                {step === "cancelled" && "Este pedido fue cancelado."}
              </p>
            </div>
          </div>
          {step === "new" && remaining !== null && (
            <p className="flex items-center gap-1.5 text-body-sm font-semibold text-attention-soft-foreground">
              <Clock aria-hidden className="size-4" />
              Confírmalo en <span className="tabular-nums">{formatCountdown(remaining)}</span>
            </p>
          )}
          {step === "new" && (
            <div className="flex flex-col gap-2">
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={confirm}
                  className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-money-in px-4 text-body-lg font-semibold text-money-in-foreground transition-colors hover:bg-money-in/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <MessageCircle aria-hidden className="size-5" />
                  Enviar por WhatsApp
                </a>
              )}
              <Button type="button" variant="outline" onClick={confirm} disabled={pending} className="h-12 rounded-2xl bg-card text-body font-semibold">
                {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
                Confirmar sin WhatsApp
              </Button>
              {error && <p role="alert" className="text-body-sm font-semibold text-money-out-soft-foreground">{error}</p>}
            </div>
          )}
          {failed && (
            <Link
              href={`/pedir/${order.restaurant.slug}`}
              className="flex h-12 items-center justify-center rounded-2xl bg-card text-body font-semibold text-foreground"
            >
              Volver al menú
            </Link>
          )}
        </section>

        {!failed && (
          <ol aria-label="Estado del pedido" className="flex items-start justify-between gap-1 rounded-2xl border border-border bg-card px-3 py-4">
            {steps.map((s, i) => {
              const done = i <= index;
              const Icon = STEP_ICONS[s];
              return (
                <li key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center" aria-current={i === index ? "step" : undefined}>
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full border-2",
                      done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className={cn("text-caption leading-tight", done ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {STEP_LABELS[s]}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <section aria-label="Detalle del pedido" className="overflow-hidden rounded-2xl border border-border bg-card">
          <p className="border-b border-border px-4 py-3 text-body-sm font-semibold">
            {SERVICE_LABELS[order.service_type]}
            {order.customer_name ? ` · ${order.customer_name}` : ""}
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold">
                    {item.quantity} × {item.product_name}
                    {item.variant_name ? ` · ${item.variant_name}` : ""}
                  </p>
                  {item.options.length > 0 && (
                    <p className="text-meta text-muted-foreground">
                      {item.options.map((o) => (o.value_name ? `${o.name}: ${o.value_name}` : o.name)).join(", ")}
                    </p>
                  )}
                  {item.promotions.length > 0 && (
                    <p className="text-meta font-semibold text-money-in-soft-foreground">{item.promotions.join(" + ")}</p>
                  )}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  {item.promo_discount > 0 && <p className="text-meta text-muted-foreground line-through">{formatPrice(item.list_subtotal)}</p>}
                  <p className="font-semibold">{formatPrice(item.subtotal)}</p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-1.5 border-t border-border px-4 py-3 text-body">
            {order.service_type === "delivery" && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Envío</dt>
                <dd>{order.shipping_pending ? "Por cotizar" : order.shipping_cost === 0 ? "Gratis" : formatPrice(order.shipping_cost ?? 0)}</dd>
              </div>
            )}
            {order.preferred_payment_method && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pago</dt>
                <dd>
                  {PAYMENT_LABELS[order.preferred_payment_method]}
                  {order.pays_with_amount ? ` · con ${formatPrice(order.pays_with_amount)}` : ""}
                </dd>
              </div>
            )}
            <div className="flex justify-between font-display text-title-sm font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">
                {formatPrice(order.total)}
                {order.shipping_pending && <span className="text-body font-semibold text-muted-foreground"> + envío</span>}
              </dd>
            </div>
          </dl>
        </section>
        <p className="text-center text-caption text-muted-foreground">Guarda este enlace para ver el estado de tu pedido.</p>
      </div>
    </main>
  );
}
