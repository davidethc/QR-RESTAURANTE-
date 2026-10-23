"use client";

import { Check, PackageCheck, QrCode, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ElapsedTimer } from "@/components/shared/elapsed-timer";
import { ActionButton } from "@/components/shared/action-button";
import { toneSoft, toneSolid } from "@/components/shared/pos-tone";
import { RejectDialog } from "./reject-dialog";
import { ORDER_STATUS_META } from "./order-tone";
import { acceptOrder } from "@/lib/actions/orders";
import type { StaffOrder } from "@/types/staff";

/**
 * Tarjeta de pedido del tablero, con la misma anatomía que las tarjetas de
 * Caja: icono del lugar, nombre, chip de estado (color + icono + texto) y
 * el monto a la derecha; debajo lo que lleva y UNA acción primaria de un
 * toque. Rechazar queda en rojo, como acción secundaria.
 *
 * El mesero solo acepta/rechaza (PENDING) y entrega (ACCEPTED, PREPARING
 * o READY). "Preparar" y "Marcar listo" son de la cocina.
 */
export function OrderCard({
  order,
  onDone,
  onDeliver,
  confirmNotReady = false,
}: {
  order: StaffOrder;
  /** Se llama al completar una acción con éxito. El tablero lo usa
   *  para recargar sin depender de que llegue el evento propio. */
  onDone?: () => void;
  /** "Entregado": el tablero lo difiere unos segundos con "Deshacer". */
  onDeliver?: () => void;
  /** La cocina de este restaurante marca "Listo" y este pedido todavía
   *  no lo está: se pregunta antes de entregar. */
  confirmNotReady?: boolean;
}) {
  const meta = ORDER_STATUS_META[order.status];
  const isQr = order.source === "digital_menu";
  const isCounter = order.table_kind !== "TABLE";
  const PlaceGlyph = isQr ? QrCode : isCounter ? ShoppingBag : UtensilsCrossed;
  const canDeliver =
    order.status === "ACCEPTED" ||
    order.status === "PREPARING" ||
    order.status === "READY";
  const isReady = order.status === "READY";
  const deliverClassName = cn(
    "h-12 w-full rounded-button text-body font-semibold",
    isReady ? toneSolid["money-in"] : "border-border bg-card text-foreground hover:bg-muted"
  );

  return (
    <article className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none flex flex-col rounded-card border border-border bg-card shadow-sm">
      <header className="flex flex-col gap-2 p-3.5 pb-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-control border",
              isQr ? toneSoft.attention : "border-border bg-secondary text-foreground"
            )}
          >
            <PlaceGlyph className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-body font-semibold leading-tight text-foreground">
              {order.place_label ?? order.table_name ?? `Mesa ${order.table_number}`}
            </p>
            <span className="flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-caption text-muted-foreground">
              <span className="tabular-nums">#{order.order_number}</span>
              {isQr && <span>· QR</span>}
              <span aria-hidden>·</span>
              <ElapsedTimer since={order.created_at} warnAfterMinutes={10} className="truncate text-caption" />
            </span>
          </div>
        </div>
        {meta && (
          <span className={cn("inline-flex w-fit max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold leading-tight", toneSoft[meta.tone])}>
            <meta.icon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{meta.label}</span>
          </span>
        )}
      </header>

      <ul className="flex flex-col gap-1 border-t border-border px-3.5 py-3">
        {order.items.map((item) => (
          <li key={item.id} className="text-body-sm leading-snug text-foreground">
            <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.product_name}
            {item.notes && (
              <span className="block text-caption italic leading-snug text-muted-foreground">{item.notes}</span>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mx-3.5 mb-3 rounded-control border border-attention-border bg-attention-soft px-3 py-2 text-caption leading-snug text-attention-soft-foreground">
          <span className="font-semibold">Nota:</span> {order.notes}
        </p>
      )}

      <div className="flex items-baseline justify-between gap-2 border-t border-border px-3.5 py-2.5">
        <span className="text-caption font-medium text-muted-foreground">Total</span>
        <span className="text-lead font-semibold tabular-nums text-foreground">{formatPrice(order.total)}</span>
      </div>

      {order.status === "PENDING" && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-border p-3">
          <ActionButton
            onSuccess={onDone}
            action={() => acceptOrder(order.id)}
            successMessage="Pedido aprobado — va a cocina"
            className={cn("h-12 min-w-[7.5rem] flex-1 rounded-button text-body font-semibold", toneSolid["money-in"])}
          >
            <Check data-icon="inline-start" aria-hidden />
            {isQr ? "Aprobar" : "Aceptar"}
          </ActionButton>
          <RejectDialog orderId={order.id} onDone={onDone} />
        </div>
      )}

      {canDeliver && onDeliver && (
        <div className="mt-auto border-t border-border p-3">
          {confirmNotReady && !isReady ? (
            <ConfirmDialog
              trigger={
                <Button variant="outline" className={deliverClassName}>
                  <PackageCheck data-icon="inline-start" aria-hidden />
                  Entregado
                </Button>
              }
              title="Cocina aún no lo marcó listo"
              description="¿Ya lo llevaste a la mesa? Se quitará de la pantalla de cocina."
              confirmLabel="Sí, ya lo entregué"
              cancelLabel="Todavía no"
              action={async () => {
                onDeliver();
                return { ok: true, data: undefined };
              }}
            />
          ) : (
            <Button variant={isReady ? "default" : "outline"} className={deliverClassName} onClick={onDeliver}>
              <PackageCheck data-icon="inline-start" aria-hidden />
              Entregado
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
