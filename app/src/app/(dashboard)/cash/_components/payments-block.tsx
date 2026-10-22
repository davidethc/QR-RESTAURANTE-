"use client";

import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { voidPaymentWithRefund } from "@/lib/actions/billing";
import { notify } from "@/lib/notifications";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import { cn, formatPrice } from "@/lib/utils";
import type { PaymentMethod } from "@/config/constants";
import type { Bill, BillPayment, BillPaymentContext } from "@/types/billing";

type PayState = "Pagado" | "Pago parcial" | "Pago pendiente" | "Anulado";

export function paymentState(bill: Bill): PayState {
  if (bill.status === "VOID") return "Anulado";
  if (bill.status === "PAID" || bill.status === "CLOSED" || (bill.total > 0 && bill.balance <= 0)) return "Pagado";
  if (bill.paid_total > 0) return "Pago parcial";
  return "Pago pendiente";
}

const STATE_CLASS: Record<PayState, string> = {
  Pagado: "bg-secondary text-foreground",
  "Pago parcial": "bg-warning-soft text-warning-soft-foreground",
  "Pago pendiente": "bg-warning-soft text-warning-soft-foreground",
  Anulado: "bg-destructive-soft text-destructive",
};

const timeFormat = new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit" });

function paymentLine(p: BillPayment): string {
  const hasChange = (p.change_amount ?? 0) > 0;
  const time = timeFormat.format(new Date(p.received_at));
  return `Pago de ${formatPrice(p.amount)}${hasChange ? " con cambio" : ""} en ${PAYMENT_METHOD_LABEL[p.method]} · ${time}`;
}

function paymentHint(p: BillPayment): string | undefined {
  if (p.method !== "CASH" || p.tendered_amount === null) return undefined;
  return `Recibido ${formatPrice(p.tendered_amount)} · Cambio ${formatPrice(p.change_amount ?? 0)}`;
}

const REFUND_METHODS: PaymentMethod[] = ["CASH", "CARD", "TRANSFER"];

/**
 * Bloque de pagos del detalle de la cuenta (M07-T07) + anulación con
 * reembolso (M07-T08, solo OWNER/ADMIN: la hoja entera lo es).
 */
export function PaymentsBlock({
  bill,
  context,
  onBillChange,
}: {
  bill: Bill;
  context: BillPaymentContext | null;
  onBillChange: (bill: Bill) => void;
}) {
  const [voiding, setVoiding] = useState<BillPayment | null>(null);
  const state = paymentState(bill);
  const completed = bill.payments.filter((p) => p.status === "COMPLETED");
  const canVoid = bill.status !== "VOID";
  const preferred = context?.preferredMethod
    ? `${PAYMENT_METHOD_LABEL[context.preferredMethod]}${context.paysWithAmount ? ` con ${formatPrice(context.paysWithAmount)}` : ""}`
    : null;

  return (
    <section aria-labelledby="adj-payments" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 id="adj-payments" className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
          Pagos
        </h3>
        <Badge className={cn("rounded-full", STATE_CLASS[state])}>{state}</Badge>
      </div>

      {preferred && (
        <p className="rounded-control bg-primary-soft px-3 py-2 text-body-sm text-primary">
          Cliente seleccionó pagar en {preferred}
        </p>
      )}

      {completed.length === 0 ? (
        <p className="text-meta text-muted-foreground">Todavía no se registró ningún pago.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {completed.map((p) => {
            const number = context?.paymentNumbers[p.id];
            return (
              <li
                key={p.id}
                className="flex min-h-11 items-center justify-between gap-2 rounded-control bg-secondary px-3 py-1.5 text-body-sm"
              >
                <span className="min-w-0 text-foreground" title={paymentHint(p)}>
                  {number !== undefined && <span className="font-semibold">Transacción #{number} · </span>}
                  {paymentLine(p)}
                  {p.tip_amount > 0 && (
                    <span className="text-muted-foreground"> · propina {formatPrice(p.tip_amount)}</span>
                  )}
                  {paymentHint(p) && <span className="block text-meta text-muted-foreground">{paymentHint(p)}</span>}
                </span>
                {canVoid && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 shrink-0 px-3 text-meta font-semibold"
                    onClick={() => setVoiding(p)}
                  >
                    <Undo2 data-icon="inline-start" aria-hidden /> Anular
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {voiding && (
        <VoidPaymentDialog
          payment={voiding}
          onClose={() => setVoiding(null)}
          onVoided={(next) => {
            setVoiding(null);
            onBillChange(next);
          }}
        />
      )}
    </section>
  );
}

function VoidPaymentDialog({
  payment,
  onClose,
  onVoided,
}: {
  payment: BillPayment;
  onClose: () => void;
  onVoided: (bill: Bill) => void;
}) {
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>(payment.method);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = refundMethod !== payment.method;
  const reasonOk = reason.trim().length >= 3;

  async function submit() {
    if (!reasonOk) {
      setError("Escribe el motivo (mínimo 3 caracteres).");
      return;
    }
    setPending(true);
    setError(null);
    const result = await voidPaymentWithRefund({
      paymentId: payment.id,
      reason,
      refundMethod,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    notify.success(`Pago anulado · reembolso en ${PAYMENT_METHOD_LABEL[refundMethod]}`);
    onVoided(result.data.bill);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anular pago de {formatPrice(payment.amount)}</DialogTitle>
          <DialogDescription>
            Pagado en {PAYMENT_METHOD_LABEL[payment.method]}. Elige cómo se devuelve el dinero.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-semibold">Método del reembolso</p>
            <ToggleGroup
              type="single"
              variant="outline"
              value={refundMethod}
              onValueChange={(v) => v && setRefundMethod(v as PaymentMethod)}
              className="grid w-full grid-cols-3 gap-2"
            >
              {REFUND_METHODS.map((m) => (
                <ToggleGroupItem
                  key={m}
                  value={m}
                  className="h-12 min-w-0 rounded-control px-1 text-body-sm font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary"
                >
                  {PAYMENT_METHOD_LABEL[m]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {changed && (
              <p className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning-soft-foreground">
                El reembolso será distinto al método original: quedará registrado en seguridad.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="void-reason" className="text-body-sm font-semibold">
              Motivo
            </label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="Ej. cobro duplicado"
            />
          </div>
          {error && (
            <p role="alert" className="text-body-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-11" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" className="h-11" onClick={submit} disabled={pending || !reasonOk}>
            {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
            Anular pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
