"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, MoreHorizontal, Plus, Wallet } from "lucide-react";
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
import { EmptyState } from "@/components/shared/empty-state";
import { notify } from "@/lib/notifications";
import { formatPrice } from "@/lib/utils";
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

/** Pedidos de mostrador (M06): lista, alta, detalle y edición. */
export function CounterOrdersPanel({
  orders,
  categories,
  details,
  billingEnabled,
  canCharge,
}: {
  orders: CounterOrderView[];
  categories: PublicCategory[];
  details: Record<string, StaffProductDetail>;
  billingEnabled: boolean;
  canCharge: boolean;
}) {
  const [modal, setModal] = useState<{ editing: CounterOrderView | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = orders.find((o) => o.id === detailId) ?? null;

  return (
    <section aria-labelledby="counter-orders-title" className="px-4 pb-24 pt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="counter-orders-title" className="text-title-sm font-semibold">
          Pedidos de mostrador
        </h2>
        <Button className="min-h-11" onClick={() => setModal({ editing: null })}>
          <Plus className="size-4" /> Nuevo pedido
        </Button>
      </div>

      {orders.length === 0 ? (
        <EmptyState title="Sin pedidos de mostrador" description="Crea el primero con + Nuevo pedido." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {orders.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setDetailId(o.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-card border border-border bg-card px-4 py-3 text-left active:bg-secondary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">
                    #{o.folio} · {o.customerName ?? SERVICE_TYPE_LABEL[o.serviceType]}
                  </span>
                  <span className="block text-meta text-muted-foreground">
                    {SERVICE_TYPE_LABEL[o.serviceType]}
                    {o.deliveryProvider && o.deliveryProvider !== "own" ? ` · ${PROVIDER_LABEL[o.deliveryProvider]}` : ""}
                    {" · "}
                    {new Date(o.createdAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className="shrink-0 text-body font-semibold tabular-nums">{totalLabel(o)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <DetailDialog
          order={detail}
          canCharge={billingEnabled && canCharge}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setModal({ editing: detail });
          }}
        />
      )}

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
  onClose,
  onEdit,
}: {
  order: CounterOrderView;
  canCharge: boolean;
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
          {canCharge && order.tableSessionId && (
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
              <DropdownMenuItem className="min-h-11" onSelect={onEdit}>
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
