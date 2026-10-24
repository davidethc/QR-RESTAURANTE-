"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Printer, XCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cancelOrderItem, editOrderItem } from "@/lib/actions/orders";
import { notify } from "@/lib/notifications";
import { cn, formatPrice } from "@/lib/utils";
import {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
} from "@/lib/validations/orders";
import { ProductSheet } from "./product-sheet";
import type { TicketItemView, TicketView } from "@/lib/queries/staff-catalog";
import type { StaffProductDetail } from "@/types/menu";
import type { LinePromo } from "@/lib/actions/promotions";
import { promotionLabel } from "@/lib/promotions";
import { PromoChip, PromoPrice } from "../../../../cash/_components/checkout/promo-line";

function hour(iso: string) {
  return new Date(iso).toLocaleTimeString("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Detalle de comandas del pedido: cada una es desplegable y desde ahí se
 * editan sus productos, se cancela un producto con motivo o se imprime.
 */
export function TicketsDetail({
  tableLabel,
  tickets,
  details,
  linePromos,
}: {
  tableLabel: string;
  tickets: TicketView[];
  details: Record<string, StaffProductDetail>;
  /** Net subtotal and promo snapshot per line (M13); empty until read. */
  linePromos?: Map<string, LinePromo>;
}) {
  const router = useRouter();
  // Collapsed tickets; every ticket starts open, including ones sent later.
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [editMode, setEditMode] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<TicketItemView | null>(null);
  const [editing, setEditing] = useState<{ ticket: TicketView; item: TicketItemView } | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);

  useEffect(() => {
    if (!printId) return;
    const done = () => setPrintId(null);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printId]);

  if (tickets.length === 0) return null;
  const printing = tickets.find((t) => t.id === printId);

  return (
    <section aria-label="Comandas del pedido">
      <h2 className="mb-3 text-lead font-semibold text-foreground">
        Comandas enviadas <span className="text-body-sm font-medium tabular-nums text-muted-foreground">· {tickets.length}</span>
      </h2>
      <ul className="space-y-2">
        {tickets.map((ticket) => {
          const isOpen = !closed.has(ticket.id);
          const editable = editMode === ticket.id;
          return (
            <li key={ticket.id} className="rounded-card border border-border bg-card shadow-sm">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setClosed((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(ticket.id)) next.add(ticket.id);
                    return next;
                  })
                }
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-card px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/50 motion-reduce:transition-none"
              >
                <span className="text-body font-semibold">
                  Comanda #{ticket.number} · {hour(ticket.createdAt)} · Por{" "}
                  {ticket.authorName ?? "personal"}
                </span>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 py-3">
                  <ul className="space-y-2">
                    {ticket.items.map((item) => {
                      const promo = linePromos?.get(item.id);
                      const hasPromo = !!promo && promo.promo_discount > 0 && !item.cancelled;
                      return (
                      <li key={item.id} className="flex items-start gap-2">
                        <span className={cn("min-w-0 flex-1", item.cancelled && "line-through opacity-60")}>
                          <span className="block text-body-sm font-medium">
                            {item.quantity} × {item.productName}
                          </span>
                          {item.options.length > 0 && (
                            <span className="block text-meta text-muted-foreground">
                              {item.options.join(", ")}
                            </span>
                          )}
                          {item.notes && (
                            <span className="block text-meta text-muted-foreground">{item.notes}</span>
                          )}
                          {hasPromo && (promo.promotions?.length ?? 0) > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {promo.promotions!.map((r) => (
                                <PromoChip key={r.id || r.type} label={promotionLabel(r)} />
                              ))}
                            </span>
                          )}
                        </span>
                        {hasPromo ? (
                          <PromoPrice list={item.unitPrice * item.quantity} net={promo.subtotal} className="flex-col items-end gap-0 text-body-sm" />
                        ) : (
                          <span className="tabular-nums text-body-sm text-wine">
                            {formatPrice(promo?.subtotal ?? item.unitPrice * item.quantity)}
                          </span>
                        )}
                        {editable && !item.cancelled && (
                          <span className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-11 rounded-full"
                              aria-label={`Editar ${item.productName}`}
                              disabled={!item.productId}
                              onClick={() => setEditing({ ticket, item })}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-11 rounded-full text-destructive"
                              aria-label={`Cancelar ${item.productName}`}
                              onClick={() => setCancelling(item)}
                            >
                              <XCircle className="size-4" />
                            </Button>
                          </span>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={editable ? "default" : "outline"}
                      className="min-h-11 rounded-control"
                      onClick={() => setEditMode(editable ? null : ticket.id)}
                    >
                      <Pencil className="size-4" /> Editar productos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 rounded-control"
                      onClick={() => setPrintId(ticket.id)}
                    >
                      <Printer className="size-4" /> Imprimir comanda
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {cancelling && (
        <CancelItemDialog
          item={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
            router.refresh();
          }}
        />
      )}

      {editing && editing.item.productId && (
        <ProductSheet
          key={editing.item.id}
          product={{
            id: editing.item.productId,
            name: editing.item.productName,
            price: editing.item.unitPrice,
          }}
          detail={details[editing.item.productId]}
          initial={{
            id: editing.item.id,
            productId: editing.item.productId,
            name: editing.item.productName,
            price: editing.item.unitPrice,
            quantity: editing.item.quantity,
            notes: editing.item.notes ?? "",
            variantId: editing.item.variantId ?? undefined,
          }}
          sentLine
          onClose={() => setEditing(null)}
          onConfirm={async (line) => {
            const { item } = editing;
            const changes: { variantId?: string; notes?: string } = {};
            if (line.variantId && line.variantId !== item.variantId) changes.variantId = line.variantId;
            if (line.notes !== (item.notes ?? "")) changes.notes = line.notes;
            if (changes.variantId === undefined && changes.notes === undefined) {
              setEditing(null);
              return notify.error("No hay cambios que guardar");
            }
            const result = await editOrderItem(item.id, changes);
            if (!result.ok) return notify.error(result.error);
            setEditing(null);
            notify.success("Producto actualizado");
            router.refresh();
          }}
        />
      )}

      {printing && <PrintTicket tableLabel={tableLabel} ticket={printing} />}
    </section>
  );
}

function CancelItemDialog({
  item,
  onClose,
  onDone,
}: {
  item: TicketItemView;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (reason.trim().length < MIN_REASON_LENGTH) {
      setError(`Escribe el motivo (mínimo ${MIN_REASON_LENGTH} caracteres).`);
      return;
    }
    setError(null);
    start(async () => {
      const result = await cancelOrderItem(item.id, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify.success("Producto cancelado");
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar {item.productName}</DialogTitle>
          <DialogDescription>
            Queda registrado con el motivo. Cocina verá el producto cancelado.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="cancel-reason" className="mb-1.5 block text-body-sm font-semibold">
            Motivo
          </label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON_LENGTH}
            rows={2}
            aria-invalid={!!error}
            aria-describedby={error ? "cancel-reason-error" : undefined}
            className="rounded-control text-body-sm"
          />
          {error && (
            <p id="cancel-reason-error" role="alert" className="mt-1.5 text-body-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={onClose}>
            Volver
          </Button>
          <Button type="button" variant="destructive" className="min-h-11" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Cancelar producto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Comanda para impresora térmica de 80 mm: solo ella sale al imprimir. */
function PrintTicket({ tableLabel, ticket }: { tableLabel: string; ticket: TicketView }) {
  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 4mm; }
        @media print {
          body * { visibility: hidden !important; }
          .print-ticket, .print-ticket * { visibility: visible !important; }
          .print-ticket { position: absolute; left: 0; top: 0; width: 72mm; display: block !important; }
        }
      `}</style>
      <div className="print-ticket hidden font-mono text-[12px] leading-tight text-black">
        <p className="text-center text-[14px] font-bold">{tableLabel}</p>
        <p className="text-center">
          Comanda #{ticket.number} · {hour(ticket.createdAt)}
        </p>
        <p className="mb-2 text-center">Por {ticket.authorName ?? "personal"}</p>
        <hr />
        {ticket.items
          .filter((i) => !i.cancelled)
          .map((i) => (
            <div key={i.id} className="my-1">
              <p className="font-bold">
                {i.quantity} x {i.productName}
              </p>
              {i.options.length > 0 && <p>  {i.options.join(", ")}</p>}
              {i.notes && <p>  {i.notes}</p>}
            </div>
          ))}
      </div>
    </>
  );
}
