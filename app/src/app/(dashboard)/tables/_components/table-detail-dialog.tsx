"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Ban, ClipboardList, Loader2, MoreHorizontal, Plus } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { OrderStatusBadge } from "@/components/shared/status-badge";
import { ReleaseTableButton } from "./release-table-button";
import { cancelOrderWithReason, openTable, transferOrder } from "@/lib/actions/orders";
import { cancelOrderWithReasonSchema } from "@/lib/validations/orders";
import { notify } from "@/lib/notifications";
import { formatPrice } from "@/lib/utils";
import { isOccupied, tableLabel } from "./tables-panel";
import type { PanelTable } from "@/lib/queries/tables-panel";
import type { OrderStatus, UserRole } from "@/config/constants";

interface Props {
  table: PanelTable;
  zoneTables: PanelTable[];
  justOpenedSessionId: string | null;
  onOpened: (sessionId: string) => void;
  onClose: () => void;
  role: UserRole;
  canServeTable: boolean;
  billingEnabled: boolean;
  maxWaiterDiscountPct: number;
}

type Sub = null | "transfer" | "cancel";

export function TableDetailDialog({
  table,
  zoneTables,
  justOpenedSessionId,
  onOpened,
  onClose,
  role,
  canServeTable,
  billingEnabled,
  maxWaiterDiscountPct,
}: Props) {
  const router = useRouter();
  const [sub, setSub] = useState<Sub>(null);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const label = tableLabel(table);
  const sessionId = table.sessionId ?? justOpenedSessionId;
  const occupied = isOccupied(table, justOpenedSessionId ? { [table.id]: justOpenedSessionId } : {});
  const order = table.orders[0] ?? null;
  const free = zoneTables.filter((t) => !isOccupied(t, {}) && t.id !== table.id);

  function open() {
    startTransition(async () => {
      const r = await openTable(table.id);
      if (!r.ok) return notify.error(r.error);
      onOpened(r.data.sessionId);
      notify.success(`${label} abierta`);
      router.refresh();
    });
  }

  function transfer(targetId: string) {
    if (!order) return;
    startTransition(async () => {
      const r = await transferOrder(order.id, targetId);
      if (!r.ok) return notify.error(r.error);
      notify.success("Pedido transferido");
      onClose();
      router.refresh();
    });
  }

  function cancel() {
    if (!order) return;
    const parsed = cancelOrderWithReasonSchema.safeParse({ orderId: order.id, reason });
    if (!parsed.success) {
      setReasonError(parsed.error.issues.find((i) => i.path[0] === "reason")?.message ?? "Escribe el motivo.");
      return;
    }
    startTransition(async () => {
      const r = await cancelOrderWithReason(order.id, parsed.data.reason);
      if (!r.ok) {
        setReasonError(r.error);
        return notify.error(r.error);
      }
      notify.success("Pedido cancelado");
      onClose();
      router.refresh();
    });
  }

  if (sub === "transfer") {
    return (
      <Dialog open onOpenChange={(o) => !o && setSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir pedido</DialogTitle>
            <DialogDescription>
              {free.length > 0
                ? `Selecciona la mesa a la que se moverá el pedido de la ${label.toLowerCase()}.`
                : "No hay mesas disponibles en esta zona en este momento."}
            </DialogDescription>
          </DialogHeader>
          {free.length > 0 && (
            <ul className="grid grid-cols-2 gap-2">
              {zoneTables.map((t) => {
                const current = t.id === table.id;
                const disabled = current || isOccupied(t, {}) || pending;
                return (
                  <li key={t.id}>
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() => transfer(t.id)}
                      className="h-11 w-full rounded-control"
                    >
                      {tableLabel(t)}
                      {current && " (Actual)"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter>
            <Button variant="ghost" className="h-11 rounded-control" onClick={() => setSub(null)}>
              Volver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (sub === "cancel") {
    return (
      <Dialog open onOpenChange={(o) => !o && setSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
            <DialogDescription>El pedido será cancelado y no podrás deshacer esta acción.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="cancel-reason">Motivo</FieldLabel>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
            />
            {reasonError && <FieldError errors={[{ message: reasonError }]} />}
          </Field>
          <DialogFooter>
            <Button variant="ghost" className="h-11 rounded-control" onClick={() => setSub(null)}>
              Volver
            </Button>
            <Button variant="destructive" disabled={pending} onClick={cancel} className="h-11 rounded-control">
              {pending && <Loader2 className="animate-spin" />} Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {occupied
              ? table.billRequested
                ? "Esta mesa está esperando la cuenta."
                : table.customerLabel ?? "Mesa ocupada."
              : `${label} disponible. Abre la mesa para empezar a agregar productos.`}
          </DialogDescription>
        </DialogHeader>

        {!occupied && canServeTable && (
          <Button disabled={pending} onClick={open} className="h-11 rounded-control">
            {pending && <Loader2 className="animate-spin" />} Abrir mesa
          </Button>
        )}

        {occupied && (
          <div className="flex flex-col gap-3">
            {order ? (
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                {table.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-body-sm font-semibold">
                        Pedido #{o.folio} <span className="font-normal text-muted-foreground">· {o.shortCode}</span>
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <OrderStatusBadge status={o.status as OrderStatus} />
                        {o.isNew && <span className="text-tiny font-semibold text-success-soft-foreground">Nueva</span>}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-card bg-muted px-3 py-3 text-meta text-muted-foreground">
                No has agregado productos aún.
              </p>
            )}

            {table.total > 0 && (
              <p className="flex justify-between text-body font-semibold">
                <span>Total a pagar</span>
                <span className="tabular-nums">{formatPrice(table.total)}</span>
              </p>
            )}

            {canServeTable && (
              <div className="flex flex-col gap-2">
                <Button asChild variant="outline" className="h-11 rounded-control">
                  <Link href={`/tables/${table.id}/order`}>
                    {order ? <Plus className="size-4" /> : <ClipboardList className="size-4" />}
                    {order ? "Agregar productos" : "Ir a productos"}
                  </Link>
                </Button>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <ReleaseTableButton
                      tableId={table.id}
                      tableLabel={label}
                      role={role}
                      billingEnabled={billingEnabled}
                      maxWaiterDiscountPct={maxWaiterDiscountPct}
                      tableSessionId={sessionId ?? undefined}
                    />
                  </div>
                  {order && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" aria-label="Más acciones" className="size-11 rounded-control">
                          <MoreHorizontal className="size-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="min-h-11" onSelect={() => setSub("transfer")}>
                          <ArrowRightLeft className="size-4" /> Transferir pedido
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11 text-destructive" onSelect={() => setSub("cancel")}>
                          <Ban className="size-4" /> Cancelar pedido
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
