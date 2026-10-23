"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "@/components/shared/step-indicator";
import { notify } from "@/lib/notifications";
import { attendPaidBillCalls } from "@/lib/actions/waiter-calls";
import { closeBill, getBillPaymentContext, openBill, removeBillDiscount, setBillSplit } from "@/lib/actions/billing";
import { equalSplitProgress } from "@/lib/split-progress";
import { SPLIT_MODE, type SplitMode } from "@/config/constants";
import type { Bill, BillPaymentContext, RecordPaymentResult } from "@/types/billing";
import { useChargeAmounts } from "../use-charge-amounts";
import { CheckoutHeader } from "./checkout-header";
import { StepAccount } from "./step-account";
import { StepSplit } from "./step-split";
import { StepMethod } from "./step-method";
import { StepDone, type LastPayment } from "./step-done";

export type CheckoutStep = "account" | "split" | "method" | "done";

const STEPS = [
  { id: "account", label: "Cuenta" },
  { id: "split", label: "¿Cómo pagan?" },
  { id: "method", label: "Método" },
  { id: "done", label: "Listo" },
];

/**
 * Cobro por pasos (Caja). Mismo flujo en el panel derecho de /cash y en la
 * hoja de cobro que abren Mesas y Pedidos (charge-sheet.tsx):
 *   1. Cuenta: qué se consumió, descuentos, pagos previos y saldo.
 *   2. ¿Cómo pagan?: todo junto, partes iguales (una persona a la vez) o
 *      por productos.
 *   3. Método: efectivo (con teclado y vuelto), tarjeta o transferencia.
 *   4. Listo: confirmación y "Siguiente persona" si falta alguien.
 *
 * Todo el dinero lo calculan las RPCs (open_bill, set_bill_split,
 * record_payment[s]); aquí solo se pinta lo que devuelven y se arma el
 * siguiente pago. El saldo y quién pagó quedan siempre visibles arriba.
 */
export function CheckoutPanel({
  tableSessionId,
  fallbackLabel,
  canManage,
  onBillChange,
  onSettled,
  onClose,
}: {
  tableSessionId: string;
  fallbackLabel: string;
  /** OWNER/ADMIN: descuentos, anular pagos, cancelar ventas. */
  canManage: boolean;
  /** Avisa cada cambio de la cuenta (para refrescar la lista sin esperar). */
  onBillChange?: (bill: Bill) => void;
  /** La cuenta quedó CLOSED y quien cobra tocó "Listo". */
  onSettled?: () => void;
  /** Cerrar el panel/hoja sin terminar. */
  onClose?: () => void;
}) {
  const [bill, setBillState] = useState<Bill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<CheckoutStep>("account");
  const [context, setContext] = useState<BillPaymentContext | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [lastPayment, setLastPayment] = useState<LastPayment | null>(null);
  const [splitPending, startSplit] = useTransition();
  const [closePending, startClose] = useTransition();
  const [removePending, startRemove] = useTransition();

  const setBill = useCallback(
    (next: Bill) => {
      setBillState(next);
      onBillChange?.(next);
    },
    [onBillChange]
  );

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    openBill(tableSessionId).then((r) => {
      setLoading(false);
      if (!r.ok) {
        setLoadError(r.error);
        return;
      }
      setBillState(r.data);
    });
  }, [tableSessionId]);

  useEffect(() => {
    // Sincroniza con la RPC openBill (sistema externo): marcar `loading`
    // antes de la red es parte de esa sincronización.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const billId = bill?.id;
  const paymentsCount = bill?.payments.length ?? 0;
  useEffect(() => {
    if (!billId) return;
    let alive = true;
    getBillPaymentContext(billId).then((r) => {
      if (alive && r.ok) setContext(r.data);
    });
    return () => {
      alive = false;
    };
  }, [billId, paymentsCount]);

  const { remainingByItem, paymentItems, suggestedAmount } = useChargeAmounts(bill, selectedItems);
  const progress = useMemo(
    () =>
      bill && bill.split_mode === SPLIT_MODE.EQUAL
        ? equalSplitProgress(bill.total, bill.split_parts, bill.paid_total)
        : null,
    [bill]
  );

  if (loading && !bill) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center" role="status">
        <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Cargando la cuenta…</span>
      </div>
    );
  }

  if (loadError || !bill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert" className="text-body text-money-out-soft-foreground">
          {loadError ?? "No se pudo abrir la cuenta."}
        </p>
        <Button variant="outline" className="h-12 px-5" onClick={load}>
          <RotateCcw aria-hidden /> Reintentar
        </Button>
      </div>
    );
  }

  const blockedReason =
    bill.status === "VOID"
      ? "Cuenta anulada: no se puede cobrar."
      : context?.allOrdersCancelled
        ? "Todos los pedidos se cancelaron: no hay nada que cobrar."
        : null;

  function changeSplit(mode: SplitMode, parts?: number) {
    if (!bill) return;
    const nextParts = parts ?? (mode === SPLIT_MODE.EQUAL ? Math.max(2, bill.split_parts || 2) : 1);
    if (mode === bill.split_mode && nextParts === bill.split_parts) return;
    startSplit(async () => {
      const r = await setBillSplit({ billId: bill.id, mode, parts: nextParts });
      if (!r.ok) {
        notify.error(r.error);
        return;
      }
      setBill(r.data);
      setSelectedItems({});
    });
  }

  function handlePaid(result: RecordPaymentResult, info: Omit<LastPayment, "change">) {
    setBill(result.bill);
    setSelectedItems({});
    setIdempotencyKey(crypto.randomUUID());
    setLastPayment({ ...info, change: result.change_amount ?? 0, replayed: result.replayed });
    if (result.bill.status === "PAID" || result.bill.status === "CLOSED") {
      void attendPaidBillCalls(tableSessionId);
    }
    setStep("done");
  }

  function handleClose() {
    if (!bill) return;
    startClose(async () => {
      const r = await closeBill(bill.id);
      if (!r.ok) {
        notify.error(r.error);
        return;
      }
      setBill(r.data);
      notify.success("Cuenta cerrada");
    });
  }

  function handleRemoveDiscount(discountId: string) {
    startRemove(async () => {
      const r = await removeBillDiscount({ discountId });
      if (!r.ok) {
        notify.error(r.error);
        return;
      }
      setBill(r.data);
      notify.success("Descuento retirado");
    });
  }

  const placeName = bill.place_label || fallbackLabel;
  // Si la cuenta ya está pagada o cerrada, la confirmación es el único paso útil.
  const effectiveStep: CheckoutStep =
    bill.status === "CLOSED" && step !== "done" ? "done" : step;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <CheckoutHeader bill={bill} placeName={placeName} progress={progress} onClose={onClose} />

      {!blockedReason && bill.status === "OPEN" && (
        <div className="border-b border-border bg-card px-4 py-1 md:px-6">
          <StepIndicator
            steps={STEPS}
            current={effectiveStep}
            onStepClick={(id) => effectiveStep !== "done" && setStep(id as CheckoutStep)}
          />
        </div>
      )}

      <div key={effectiveStep} className="flex min-h-0 flex-1 flex-col animate-pos-step motion-reduce:animate-none">
        {effectiveStep === "account" && (
          <StepAccount
            bill={bill}
            context={context}
            canManage={canManage}
            blockedReason={blockedReason}
            closePending={closePending}
            removePending={removePending}
            onBillChange={(b) => {
              setBill(b);
              setSelectedItems({});
              setIdempotencyKey(crypto.randomUUID());
            }}
            onRemoveDiscount={handleRemoveDiscount}
            onCloseBill={handleClose}
            onNext={() => setStep("split")}
          />
        )}
        {effectiveStep === "split" && (
          <StepSplit
            bill={bill}
            progress={progress}
            pending={splitPending}
            selectedItems={selectedItems}
            remainingByItem={remainingByItem}
            suggestedAmount={suggestedAmount}
            onToggleItem={(id, checked) => setSelectedItems((prev) => ({ ...prev, [id]: checked }))}
            onChangeSplit={changeSplit}
            onBack={() => setStep("account")}
            onNext={() => setStep("method")}
          />
        )}
        {effectiveStep === "method" && (
          <StepMethod
            bill={bill}
            suggestedAmount={suggestedAmount}
            paymentItems={paymentItems}
            idempotencyKey={idempotencyKey}
            preferred={context}
            personLabel={
              progress?.current
                ? `Persona ${progress.current} de ${bill.split_parts}`
                : bill.split_mode === SPLIT_MODE.ITEMS
                  ? "Lo que marcaste"
                  : null
            }
            onBack={() => setStep("split")}
            onPaid={handlePaid}
          />
        )}
        {effectiveStep === "done" && (
          <StepDone
            bill={bill}
            context={context}
            last={lastPayment}
            progress={progress}
            closePending={closePending}
            onCloseBill={handleClose}
            onNextPerson={() => {
              setLastPayment(null);
              setStep(bill.split_mode === SPLIT_MODE.ITEMS ? "split" : "method");
            }}
            onFinish={() => {
              setLastPayment(null);
              if (bill.status === "CLOSED") onSettled?.();
              else setStep("account");
            }}
          />
        )}
      </div>
    </div>
  );
}
