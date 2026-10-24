"use client";

import { useState, useTransition } from "react";
import { Loader2, Minus, MoreVertical, Pencil, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { posPressable } from "@/components/shared/pos-tone";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { addItemsToBill, getBill } from "@/lib/actions/billing";
import { cancelOrderItem, editOrderItem } from "@/lib/actions/orders";
import { notify } from "@/lib/notifications";
import { MAX_REASON_LENGTH, MIN_REASON_LENGTH } from "@/lib/validations/orders";
import { cn, formatPrice } from "@/lib/utils";
import type { Bill, BillItem, BillOrder } from "@/types/billing";

/**
 * Cantidad (−/+) y menú ⋮ de una línea de la cuenta, solo con las RPC que ya
 * existen y sus mismas reglas:
 *   +  add_items_to_bill: una unidad más como pedido nuevo (igual que
 *      "Agregar producto", con el mismo "Mandar a cocina"). No admite
 *      variantes ni opciones, así que esas líneas no tienen +.
 *   −  no hay RPC para restar una unidad: con cantidad 1 cancela la línea
 *      (cancel_order_item, con motivo); con más, se cancela desde ⋮.
 *   ⋮  Editar nota (edit_order_item) y Cancelar producto (cancel_order_item).
 * Cada bloqueo de la base se muestra antes, con su motivo.
 */
export function LineControls({
  bill,
  order,
  item,
  onBillChange,
}: {
  bill: Bill;
  order: BillOrder;
  item: BillItem;
  onBillChange: (bill: Bill) => void;
}) {
  const [dialog, setDialog] = useState<"add" | "note" | "cancel" | null>(null);
  const cancelBlock = cancelBlockReason(bill, order, item);
  const addBlock = addBlockReason(item);
  const minusBlock = item.quantity > 1 ? "Para quitar unidades, cancela el producto desde el menú ⋮." : cancelBlock;

  async function reload() {
    const r = await getBill(bill.id);
    if (r.ok) onBillChange(r.data);
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex items-center rounded-full border border-border bg-card">
        <StepButton
          label={minusBlock ? `Quitar uno: ${minusBlock}` : `Quitar ${item.product_name}`}
          title={minusBlock ?? undefined}
          disabled={!!minusBlock}
          onClick={() => setDialog("cancel")}
        >
          <Minus className="size-4" aria-hidden />
        </StepButton>
        <span className="w-7 text-center text-body-sm font-semibold tabular-nums text-foreground" aria-label={`Cantidad ${item.quantity}`}>
          {item.quantity}
        </span>
        <StepButton
          label={addBlock ? `Agregar uno: ${addBlock}` : `Agregar otro ${item.product_name}`}
          title={addBlock ?? undefined}
          disabled={!!addBlock}
          onClick={() => setDialog("add")}
        >
          <Plus className="size-4" aria-hidden />
        </StepButton>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Más acciones de ${item.product_name}`}
            className={cn(posPressable, "flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            <MoreVertical className="size-5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => setDialog("note")}>
            <Pencil className="size-4" aria-hidden /> {item.notes ? "Editar nota" : "Agregar nota"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11 flex-col items-start gap-0.5 text-money-out-soft-foreground"
            disabled={!!cancelBlock}
            onSelect={() => setDialog("cancel")}
          >
            <span className="flex items-center gap-2">
              <XCircle className="size-4" aria-hidden /> Cancelar producto
            </span>
            {cancelBlock && <span className="text-caption text-muted-foreground">{cancelBlock}</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "add" && (
        <AddOneDialog bill={bill} item={item} onClose={() => setDialog(null)} onAdded={onBillChange} />
      )}
      {dialog === "note" && <NoteDialog item={item} onClose={() => setDialog(null)} onSaved={reload} />}
      {dialog === "cancel" && !cancelBlock && <CancelDialog item={item} onClose={() => setDialog(null)} onDone={reload} />}
    </div>
  );
}

/** Mismas reglas que cancel_order_item, para avisar antes de intentarlo. */
function cancelBlockReason(bill: Bill, order: BillOrder, item: BillItem): string | null {
  if (typeof item.cancelled !== "boolean") return "Cancelar desde Caja todavía no está disponible.";
  if (bill.discounts.some((d) => d.order_item_id === item.id)) return "Tiene un descuento: quítalo primero.";
  const alive = order.items.filter((i) => !i.cancelled);
  if (alive.length <= 1) return "Es el único producto del pedido.";
  return null;
}

function addBlockReason(item: BillItem): string | null {
  if (!item.product_id) return "El producto ya no está en la carta.";
  if (item.variant_name || (item.options?.length ?? 0) > 0) return "Tiene variante u opciones: usa Agregar producto.";
  return null;
}

function StepButton({
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={cn(
        posPressable,
        "flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted",
        disabled && "cursor-not-allowed text-muted-foreground/50 hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}

function AddOneDialog({
  bill,
  item,
  onClose,
  onAdded,
}: {
  bill: Bill;
  item: BillItem;
  onClose: () => void;
  onAdded: (bill: Bill) => void;
}) {
  const [sendToKitchen, setSendToKitchen] = useState(false);
  const [pending, setPending] = useState(false);
  const key = useIdempotencyKey(JSON.stringify([item.product_id, item.notes, sendToKitchen]));

  async function submit() {
    if (!item.product_id) return;
    setPending(true);
    const r = await addItemsToBill({
      billId: bill.id,
      items: [{ productId: item.product_id, quantity: 1, notes: item.notes ?? undefined }],
      idempotencyKey: key.get(),
      sendToKitchen,
    });
    setPending(false);
    if (!r.ok) {
      notify.error(r.error);
      return;
    }
    key.renew();
    notify.success(
      r.data.replayed ? "Ese producto ya estaba agregado" : sendToKitchen ? "Agregado y enviado a cocina" : "Agregado a la cuenta"
    );
    onAdded(r.data);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar 1 × {item.product_name}</DialogTitle>
          <DialogDescription>
            Suma {formatPrice(item.unit_price)} a la cuenta como un pedido nuevo
            {Number((item as BillItem & { promo_discount?: number }).promo_discount ?? 0) > 0
              ? " (precio de lista; la promoción vigente se aplica al guardarlo)."
              : "."}
          </DialogDescription>
        </DialogHeader>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-control border border-border px-3">
          <span className="text-body-sm font-semibold">Mandar a cocina</span>
          <Switch checked={sendToKitchen} onCheckedChange={setSendToKitchen} aria-label="Mandar a cocina" />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={onClose}>
            Volver
          </Button>
          <Button type="button" className="h-11 bg-money-in text-money-in-foreground hover:bg-money-in/90" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({ item, onClose, onSaved }: { item: BillItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (notes === (item.notes ?? "")) {
      onClose();
      return;
    }
    start(async () => {
      const r = await editOrderItem(item.id, { notes });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await onSaved();
      notify.success("Nota guardada");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nota de {item.product_name}</DialogTitle>
          <DialogDescription>Cocina la ve en la comanda.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={200}
          rows={2}
          aria-label="Nota"
          aria-invalid={!!error}
          className="rounded-control text-body-sm"
        />
        {error && (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={onClose}>
            Volver
          </Button>
          <Button type="button" className="h-11" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ item, onClose, onDone }: { item: BillItem; onClose: () => void; onDone: () => Promise<void> }) {
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
      const r = await cancelOrderItem(item.id, reason);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await onDone();
      notify.success("Producto cancelado");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Cancelar {item.quantity} × {item.product_name}
          </DialogTitle>
          <DialogDescription>
            Resta {formatPrice(item.subtotal)} de la cuenta. Queda registrado con el motivo y cocina lo ve cancelado.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor={`cancel-${item.id}`} className="mb-1.5 block text-body-sm font-semibold">
            Motivo
          </label>
          <Textarea
            id={`cancel-${item.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REASON_LENGTH}
            rows={2}
            aria-invalid={!!error}
            className="rounded-control text-body-sm"
          />
          {error && (
            <p role="alert" className="mt-1.5 text-body-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={onClose}>
            Volver
          </Button>
          <Button type="button" variant="destructive" className="h-11" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Cancelar producto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
