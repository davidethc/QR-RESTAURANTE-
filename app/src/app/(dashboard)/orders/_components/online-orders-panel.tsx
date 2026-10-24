"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Ban,
  Bike,
  Check,
  ChevronDown,
  Clock,
  Globe,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Store,
  TimerOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { posPressable, toneBar, toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { useLiveEvents } from "../../_components/staff-live-provider";
import { notify } from "@/lib/notifications";
import {
  acceptOnlineOrder,
  listPendingOnlineOrders,
  rejectOnlineOrder,
  reviewOnlineOrder,
} from "@/lib/actions/digital-menu";
import { PAYMENT_LABELS, SERVICE_LABELS, formatAddress, formatCountdown, orderLabel, parseMoneyInput } from "@/lib/digital-menu";
import { cn, formatPrice } from "@/lib/utils";
import type { DigitalMenuStatus, StaffOnlineContact, StaffOnlineOrder } from "@/types/digital-menu";

/**
 * Pedidos › En línea: web orders (menú digital a domicilio / para recoger)
 * waiting for Aceptar / Rechazar. They never reach the generic board buttons:
 * the database refuses accept_order / reject_order for `source = 'web'`.
 */
export function OnlineOrdersPanel({
  restaurantId,
  initialOrders,
  canHandle,
  menuStatus,
}: {
  restaurantId: string;
  initialOrders: StaffOnlineOrder[];
  canHandle: boolean;
  menuStatus: DigitalMenuStatus | null;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [now, setNow] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const r = await listPendingOnlineOrders(restaurantId);
    if (r.ok) setOrders(r.data);
  }, [restaurantId]);

  // One shared Realtime subscription (StaffLiveProvider): reload on order changes.
  useLiveEvents(["orders"], reload);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client clock for the countdowns
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const unreviewed = orders.filter((o) => o.statusReview === "new").length;
  const statusLabel =
    menuStatus === "active" ? "Menú digital activo" : menuStatus === "paused" ? "Menú digital en pausa" : null;

  return (
    <section
      aria-labelledby="online-orders-title"
      className="flex flex-col overflow-hidden rounded-card border border-border bg-secondary/60"
    >
      <header className="relative flex flex-wrap items-center gap-2.5 border-b border-border bg-card px-3.5 py-3">
        <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", toneBar[orders.length > 0 ? "attention" : "info"])} />
        <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border", toneSoft.info)}>
          <Globe className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="online-orders-title" className="text-body font-semibold text-foreground">
            En línea · domicilio y para recoger
          </h2>
          <p className="text-meta text-muted-foreground">
            {statusLabel ? `${statusLabel}. ` : ""}Revisa, acepta o rechaza; al aceptar pasa a cocina.
          </p>
        </div>
        {unreviewed > 0 && (
          <span className={cn("rounded-full border px-2 py-0.5 text-body-sm font-semibold", toneSoft.attention)}>
            {unreviewed} {unreviewed === 1 ? "nuevo" : "nuevos"}
          </span>
        )}
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-body-sm font-semibold tabular-nums",
            orders.length > 0 ? toneSoft.attention : "border-border bg-secondary text-muted-foreground"
          )}
        >
          {orders.length}
        </span>
      </header>
      {orders.length === 0 ? (
        <p className="px-4 py-5 text-center text-body-sm text-muted-foreground">
          No hay pedidos en línea por atender. Los del menú digital llegan aquí.
        </p>
      ) : (
        <ul className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => (
            <OnlineOrderCard key={o.id} order={o} now={now} canHandle={canHandle} onDone={reload} />
          ))}
        </ul>
      )}
    </section>
  );
}

function OnlineOrderCard({
  order,
  now,
  canHandle,
  onDone,
}: {
  order: StaffOnlineOrder;
  now: number | null;
  canHandle: boolean;
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<StaffOnlineContact | null>(null);
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [shipping, setShipping] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [isNew, setIsNew] = useState(order.statusReview === "new");

  const remaining = !order.confirmedAt && order.expiresAt && now !== null ? Date.parse(order.expiresAt) - now : null;
  const expired = remaining !== null && remaining <= 0;
  const tone: PosTone = expired ? "money-out" : order.confirmedAt ? "money-in" : "attention";
  const delivery = order.serviceType === "delivery";

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !contact) {
      startTransition(async () => {
        const r = await reviewOnlineOrder(order.id);
        if (r.ok) {
          setContact(r.data);
          setIsNew(false);
        } else setError(r.error);
      });
    }
  }

  function accept() {
    setError(null);
    const cost = delivery ? parseMoneyInput(shipping) : null;
    if (cost !== null && Number.isNaN(cost)) {
      setError("Escribe el envío como 1.50 o déjalo vacío para cotizarlo después.");
      return;
    }
    startTransition(async () => {
      const r = await acceptOnlineOrder({ orderId: order.id, shippingCost: cost ?? undefined });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      notify.success(`Pedido ${orderLabel(order)} aceptado: pasó a cocina`);
      await onDone();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const r = await rejectOnlineOrder({ orderId: order.id, reason: reason || undefined });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      notify.success(`Pedido ${orderLabel(order)} rechazado`);
      await onDone();
    });
  }

  const ServiceIcon = delivery ? Bike : Store;

  return (
    <li className="relative flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-sm">
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", toneBar[tone])} />
      <div className="flex flex-col gap-2 p-3.5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-title-sm font-bold tabular-nums">{orderLabel(order)}</span>
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft.info)}>
            <ServiceIcon aria-hidden className="size-3.5" /> {SERVICE_LABELS[order.serviceType]}
          </span>
          {isNew && (
            <span className={cn("rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft.attention)}>Nuevo</span>
          )}
        </div>
        <p className="text-body font-semibold text-foreground">{order.customerName ?? "Cliente"}</p>
        <p
          className={cn(
            "flex items-center gap-1.5 text-body-sm font-semibold",
            expired ? "text-money-out-soft-foreground" : order.confirmedAt ? "text-money-in-soft-foreground" : "text-attention-soft-foreground"
          )}
        >
          {expired ? (
            <><TimerOff aria-hidden className="size-4" /> Venció sin confirmar</>
          ) : order.confirmedAt ? (
            <><ShieldCheck aria-hidden className="size-4" /> Confirmado por el cliente</>
          ) : (
            <>
              <Clock aria-hidden className="size-4" /> Sin confirmar · vence en{" "}
              <span className="tabular-nums">{remaining !== null ? formatCountdown(remaining) : "…"}</span>
            </>
          )}
        </p>

        <ul className="flex flex-col gap-0.5 text-body-sm">
          {order.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-2">
              <span className="min-w-0">
                {i.quantity} × {i.name}
                {i.variantName ? ` · ${i.variantName}` : ""}
                {i.notes && <span className="block text-meta text-muted-foreground">Nota: {i.notes}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{formatPrice(i.subtotal)}</span>
            </li>
          ))}
        </ul>
        {order.generalComment && (
          <p className="rounded-control border border-border bg-secondary px-2.5 py-1.5 text-meta">“{order.generalComment}”</p>
        )}
        <dl className="flex flex-col gap-0.5 border-t border-border pt-2 text-body-sm">
          {order.preferredPaymentMethod && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Pago preferido</dt>
              <dd>
                {PAYMENT_LABELS[order.preferredPaymentMethod]}
                {order.paysWithAmount ? ` · con ${formatPrice(order.paysWithAmount)}` : ""}
              </dd>
            </div>
          )}
          {delivery && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Envío</dt>
              <dd>{order.shippingCost === null ? "Por cotizar" : order.shippingCost === 0 ? "Gratis" : formatPrice(order.shippingCost)}</dd>
            </div>
          )}
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">
              {formatPrice(order.total)}
              {delivery && order.shippingCost === null ? " + envío" : ""}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(posPressable, "flex min-h-12 items-center justify-between rounded-button border border-border px-3 text-body-sm font-semibold hover:bg-muted")}
        >
          {open ? "Ocultar datos de contacto" : "Ver datos de contacto"}
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="flex flex-col gap-1.5 rounded-control border border-border bg-secondary/60 px-3 py-2 text-body-sm">
            {!contact ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 aria-hidden className="size-4 animate-spin" /> Cargando…
              </span>
            ) : (
              <>
                {contact.customerPhone && (
                  <a href={`tel:${contact.customerPhone.replace(/[^\d+]/g, "")}`} className="flex min-h-10 items-center gap-2 font-semibold underline underline-offset-2">
                    <Phone aria-hidden className="size-4" /> {contact.customerPhone}
                  </a>
                )}
                {delivery && contact.deliveryAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold">{formatAddress(contact.deliveryAddress)}</p>
                      {contact.deliveryAddress.entre_calles && <p className="text-meta">Entre {contact.deliveryAddress.entre_calles}</p>}
                      {contact.deliveryAddress.referencias && <p className="text-meta">{contact.deliveryAddress.referencias}</p>}
                      {contact.deliveryAddress.lat != null && contact.deliveryAddress.lng != null && (
                        <a
                          href={`https://maps.google.com/?q=${contact.deliveryAddress.lat},${contact.deliveryAddress.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-meta font-semibold underline underline-offset-2"
                        >
                          Ver ubicación en el mapa
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {!expired && (
        <div className="mt-auto flex flex-col gap-2 border-t border-border bg-secondary/40 p-3">
          {!canHandle ? (
            <p className="text-meta text-muted-foreground">Para aceptarlo necesitas ser dueño, administrador, mesero o tener la caja abierta.</p>
          ) : mode === "reject" ? (
            <>
              <label className="flex flex-col gap-1 text-body-sm font-semibold">
                Motivo (opcional, lo ve el cliente)
                <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej.: no tenemos ese plato hoy" className="h-12" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setMode("idle")} disabled={pending} className="h-12">
                  <X aria-hidden className="size-4" /> Volver
                </Button>
                <Button type="button" onClick={reject} disabled={pending} className="h-12 bg-money-out text-money-out-foreground hover:bg-money-out/90">
                  {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Ban aria-hidden className="size-4" />} Rechazar
                </Button>
              </div>
            </>
          ) : (
            <>
              {delivery && order.shippingCost === null && (
                <label className="flex flex-col gap-1 text-body-sm font-semibold">
                  Costo de envío (opcional)
                  <Input value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="decimal" placeholder="Ej.: 1.50 · vacío = cotizar después" className="h-12" />
                </label>
              )}
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                <Button type="button" variant="outline" onClick={() => setMode("reject")} disabled={pending} className="h-12 px-4">
                  <Ban aria-hidden className="size-4" /> Rechazar
                </Button>
                <Button type="button" onClick={accept} disabled={pending} className="h-12 bg-money-in text-money-in-foreground hover:bg-money-in/90">
                  {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />} Aceptar y enviar a cocina
                </Button>
              </div>
            </>
          )}
          {error && <p role="alert" className="text-meta font-semibold text-money-out-soft-foreground">{error}</p>}
        </div>
      )}
    </li>
  );
}
