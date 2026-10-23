"use client";

import { useEffect, useState } from "react";
import { getOrderContact, type OrderContact } from "@/lib/actions/counter-order";
import { Bike, Check, ChevronDown, ChevronRight, Copy, MoreHorizontal, ShoppingBag, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/lib/notifications";
import { cn, formatPrice } from "@/lib/utils";
import { posPressable } from "@/components/shared/pos-tone";
import {
  PROVIDER_LABEL,
  SERVICE_TYPE_LABEL,
  buildContactUrl,
  buildOrderCopyText,
  buildShippingCopyText,
  type CounterOrderView,
} from "@/lib/counter-order";
import { useChargeSheet } from "../../cash/_components/charge-sheet-host";
import { CounterOrderModal } from "./counter-order-modal";
import type { PublicCategory, StaffProductDetail } from "@/types/menu";

async function copyText(text: string, okMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(okMessage);
  } catch {
    notify.error("No se pudo copiar. Inténtalo de nuevo.");
  }
}

function totalLabel(o: CounterOrderView) {
  const pending = o.serviceType === "delivery" && o.deliveryProvider === "own" && o.shippingCost === null;
  return pending ? `Envío + ${formatPrice(o.total)}` : formatPrice(o.total);
}

/**
 * Pedidos de mostrador (M06): lista, detalle y edición. El alta ya no vive
 * aquí: "Nuevo pedido" abre el flujo de Caja desde la franja de arriba.
 */
export function CounterOrdersPanel({
  orders,
  categories,
  details,
  billingEnabled,
  canCharge,
  emptyAction,
}: {
  orders: CounterOrderView[];
  categories: PublicCategory[];
  details: Record<string, StaffProductDetail>;
  billingEnabled: boolean;
  canCharge: boolean;
  emptyAction?: React.ReactNode;
}) {
  const [modal, setModal] = useState<{ editing: CounterOrderView } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, OrderContact>>({});
  const baseDetail = orders.find((o) => o.id === detailId) ?? null;
  const contact = detailId ? contacts[detailId] : undefined;
  const detail = baseDetail && contact ? { ...baseDetail, ...contact } : baseDetail;

  // Teléfono y dirección ya no vienen en la lista: se piden al abrir el detalle.
  useEffect(() => {
    if (!detailId || contacts[detailId]) return;
    let live = true;
    getOrderContact(detailId).then((r) => {
      if (live && r.ok) setContacts((c) => ({ ...c, [detailId]: r.data }));
    });
    return () => {
      live = false;
    };
  }, [detailId, contacts]);

  return (
    <section aria-labelledby="counter-orders-title" className="rounded-card border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span aria-hidden className="flex size-9 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
          <ShoppingBag className="size-4" />
        </span>
        <h2 id="counter-orders-title" className="text-body font-semibold text-foreground">
          Para llevar y domicilio
        </h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-caption font-semibold tabular-nums text-muted-foreground">
          {orders.length}
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <p className="text-body-sm font-semibold text-foreground">Sin pedidos de mostrador hoy</p>
          <p className="max-w-xs text-meta text-muted-foreground">Para llevar y domicilio aparecen aquí con su folio y total.</p>
          {emptyAction && <div className="mt-2">{emptyAction}</div>}
        </div>
      ) : (
        <ul className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => {
            const Glyph = o.serviceType === "delivery" ? Bike : ShoppingBag;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(o.id)}
                  className={cn(
                    posPressable,
                    "flex min-h-14 w-full items-center gap-3 rounded-card border border-border bg-card px-3 py-2.5 text-left hover:border-border-strong hover:shadow-sm"
                  )}
                >
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-control border border-border bg-secondary text-foreground">
                    <Glyph className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold leading-tight">
                      #{o.folio} · {o.customerName ?? SERVICE_TYPE_LABEL[o.serviceType]}
                    </span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {SERVICE_TYPE_LABEL[o.serviceType]}
                      {o.deliveryProvider && o.deliveryProvider !== "own" ? ` · ${PROVIDER_LABEL[o.deliveryProvider]}` : ""}
                      {" · "}
                      {new Date(o.createdAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="shrink-0 text-body font-semibold tabular-nums">{totalLabel(o)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {detail && (
        <DetailDialog
          order={detail}
          canCharge={billingEnabled && canCharge}
          contactReady={Boolean(contact)}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setModal({ editing: detail });
          }}
        />
      )}

      {/* Solo para editar: el alta usa el flujo "Nuevo pedido" de Caja. */}
      <CounterOrderModal
        open={modal !== null}
        onOpenChange={(o) => !o && setModal(null)}
        editing={modal?.editing ?? null}
        categories={categories}
        details={details}
        billingEnabled={billingEnabled}
        canCharge={canCharge}
      />
    </section>
  );
}

function DetailDialog({
  order,
  canCharge,
  contactReady,
  onClose,
  onEdit,
}: {
  order: CounterOrderView;
  canCharge: boolean;
  contactReady: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { openCharge } = useChargeSheet();
  const [showShipping, setShowShipping] = useState(false);
  const [copied, setCopied] = useState(false);
  const contactUrl = buildContactUrl(order.customerPhone);
  const shippingText = buildShippingCopyText(order.deliveryAddress);
  const a = order.deliveryAddress;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Pedido #{order.folio} · {SERVICE_TYPE_LABEL[order.serviceType]}
          </DialogTitle>
          <DialogDescription>
            {order.customerName ?? "Sin nombre"}
            {order.customerPhone ? ` · ${order.customerPhone}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          {canCharge && order.tableSessionId && order.status !== "CANCELLED" && (
            <Button
              className="min-h-11 flex-1"
              onClick={() => {
                onClose();
                openCharge({
                  tableSessionId: order.tableSessionId as string,
                  tableLabel: `${SERVICE_TYPE_LABEL[order.serviceType]} #${order.folio}`,
                });
              }}
            >
              <Wallet className="size-4" /> Cobrar {formatPrice(order.total)}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-11" aria-label="Más acciones">
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11" onSelect={() => copyText(buildOrderCopyText(order), "Pedido copiado")}>
                Copiar pedido
              </DropdownMenuItem>
              {contactUrl ? (
                <DropdownMenuItem asChild className="min-h-11">
                  <a href={contactUrl} target="_blank" rel="noopener noreferrer">
                    Contactar cliente
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="min-h-11">
                  Contactar cliente (sin teléfono)
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="min-h-11" disabled={!contactReady} onSelect={onEdit}>
                Editar pedido
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {order.externalOrderId && (
          <p className="text-body-sm">
            {order.deliveryProvider ? PROVIDER_LABEL[order.deliveryProvider] : "Plataforma"} · pedido {order.externalOrderId}
          </p>
        )}

        {a && (
          <div className="rounded-control border border-border">
            <button
              type="button"
              aria-expanded={showShipping}
              onClick={() => setShowShipping((s) => !s)}
              className="flex min-h-11 w-full items-center justify-between px-3 text-body-sm font-semibold"
            >
              Mostrar datos de envío
              <ChevronDown className={`size-4 transition-transform ${showShipping ? "rotate-180" : ""}`} />
            </button>
            {showShipping && (
              <div className="border-t border-border px-3 py-2 text-body-sm">
                <pre className="whitespace-pre-wrap font-sans">{shippingText}</pre>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-1 min-h-11"
                  onClick={async () => {
                    await copyText(shippingText, "Datos de envío copiados");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            )}
          </div>
        )}

        <ul className="space-y-1 text-body-sm">
          {order.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-2">
              <span className="min-w-0">
                {i.quantity} × {i.name}
                {i.notes ? <span className="text-muted-foreground"> ({i.notes})</span> : null}
              </span>
              <span className="tabular-nums">{formatPrice(i.subtotal)}</span>
            </li>
          ))}
        </ul>
        {order.generalComment && <p className="text-body-sm text-muted-foreground">{order.generalComment}</p>}
        <div className="flex justify-between border-t border-border pt-2 text-body font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{totalLabel(order)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
