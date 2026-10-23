"use client";

import { useMemo, useState } from "react";
import { Banknote, CircleEllipsis, CreditCard, Landmark, Layers, Pencil } from "lucide-react";
import { AmountKeypad } from "@/components/shared/amount-keypad";
import { ChoiceCards } from "@/components/shared/choice-card";
import { posPressable } from "@/components/shared/pos-tone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { recordPayment, recordPayments } from "@/lib/actions/billing";
import { keypadToNumber, numberToKeypad } from "@/lib/keypad";
import { cashQuickAmounts, cashShortfall, changeDue, evaluateMultiMethod } from "@/lib/money";
import { notify } from "@/lib/notifications";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-method-labels";
import { cn, formatPrice } from "@/lib/utils";
import { PAYMENT_METHOD, type PaymentMethod } from "@/config/constants";
import type { Bill, BillPaymentContext, RecordPaymentResult } from "@/types/billing";
import type { LastPayment } from "./step-done";
import { StepFooter } from "./step-footer";

type MethodChoice = PaymentMethod | "MULTI";
type Editing = "received" | "amount" | "tip";

const TIP_PERCENTS = [0, 5, 10] as const;

function num(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Paso 3 · Método. Efectivo, tarjeta o transferencia como tarjetas grandes;
 * "Otro" y "Varios métodos" quedan a un toque más, abajo. En efectivo, el
 * teclado es para lo que entrega el cliente y el vuelto se ve enorme.
 */
export function StepMethod({
  bill,
  suggestedAmount,
  paymentItems,
  idempotencyKey,
  preferred,
  personLabel,
  onBack,
  onPaid,
}: {
  bill: Bill;
  suggestedAmount: number;
  paymentItems?: { order_item_id: string; quantity: number }[];
  idempotencyKey: string;
  preferred: Pick<BillPaymentContext, "preferredMethod" | "paysWithAmount"> | null;
  personLabel: string | null;
  onBack: () => void;
  onPaid: (result: RecordPaymentResult, info: Omit<LastPayment, "change">) => void;
}) {
  const [method, setMethod] = useState<MethodChoice>(preferred?.preferredMethod ?? PAYMENT_METHOD.CASH);
  const [amountText, setAmountText] = useState(() => numberToKeypad(suggestedAmount));
  const [tipText, setTipText] = useState("");
  const [receivedText, setReceivedText] = useState(() =>
    preferred?.preferredMethod === PAYMENT_METHOD.CASH ? numberToKeypad(preferred.paysWithAmount) : ""
  );
  const [editing, setEditing] = useState<Editing>("received");
  const [reference, setReference] = useState("");
  const [multi, setMulti] = useState({ cash: "", card: "", transfer: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = keypadToNumber(amountText);
  const tip = keypadToNumber(tipText);
  const due = Math.round((amount + tip) * 100) / 100;
  const received = keypadToNumber(receivedText);
  const isCash = method === PAYMENT_METHOD.CASH;
  const change = isCash ? changeDue(received > 0 ? received : due, due) : 0;
  const missing = isCash && received > 0 ? cashShortfall(received, due) : 0;

  const multiEval = useMemo(
    () => evaluateMultiMethod(amount, { cash: num(multi.cash), card: num(multi.card), transfer: num(multi.transfer) }, tip),
    [amount, multi, tip]
  );
  const multiKey = useIdempotencyKey(JSON.stringify([bill.id, amount, tip, multi, paymentItems]));

  const quick = useMemo(() => {
    try {
      return [{ label: "Exacto", value: due }, ...cashQuickAmounts(due).map((v) => ({ label: formatPrice(v), value: v }))];
    } catch {
      return [];
    }
  }, [due]);

  let block: string | null = null;
  if (amount <= 0) block = "Escribe el monto a cobrar.";
  else if (amount > bill.balance + 0.004) block = `No puedes cobrar más que el saldo (${formatPrice(bill.balance)}).`;
  else if (method === "MULTI") {
    if (!num(multi.cash) && !num(multi.card) && !num(multi.transfer)) block = "Indica cuánto va en cada método.";
    else block = multiEval.error;
  } else if (missing > 0) block = `Faltan ${formatPrice(missing)}: lo recibido no alcanza.`;

  const tipPct = TIP_PERCENTS.find((p) => Math.round(amount * p) === Math.round(tip * 100));

  async function submit() {
    if (block || submitting) return;
    if (!navigator.onLine) {
      notify.error("Sin conexión: espera a que vuelva la red para cobrar.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const items = paymentItems && paymentItems.length > 0 ? paymentItems : undefined;
    try {
      if (method === "MULTI") {
        const list = (
          [
            { method: "CASH", received: num(multi.cash) },
            { method: "CARD", received: num(multi.card) },
            { method: "TRANSFER", received: num(multi.transfer) },
          ] as const
        ).filter((p) => p.received > 0);
        const r = await recordPayments({
          billId: bill.id,
          amount,
          tipAmount: tip,
          payments: [...list],
          items,
          requestId: multiKey.get(),
          autoClose: true,
        });
        if (!r.ok) {
          setError(r.error);
          notify.error(r.error);
          return;
        }
        multiKey.renew();
        onPaid(
          {
            payment_id: r.data.payments[0]?.payment_id ?? "",
            change_amount: r.data.change_amount || null,
            replayed: r.data.replayed,
            closed: r.data.closed,
            bill: r.data.bill,
          },
          { amount, tip, methodLabel: "Varios métodos" }
        );
        return;
      }
      const r = await recordPayment({
        billId: bill.id,
        method,
        amount,
        tipAmount: tip,
        tenderedAmount: isCash && received > 0 ? received : undefined,
        reference: !isCash && reference.trim() ? reference.trim() : undefined,
        items,
        idempotencyKey,
        autoClose: true,
      });
      if (!r.ok) {
        setError(r.error);
        notify.error(r.error);
        return;
      }
      onPaid(r.data, { amount, tip, methodLabel: PAYMENT_METHOD_LABEL[method] });
    } finally {
      setSubmitting(false);
    }
  }

  const keypadTarget = editing === "amount" ? "amount" : editing === "tip" ? "tip" : isCash ? "received" : null;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
          <div className="flex flex-col gap-5">
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4">
              <div>
                <p className="text-meta text-muted-foreground">{personLabel ?? "A cobrar"}</p>
                <p className="font-display text-[2rem] font-semibold leading-none tabular-nums tracking-tight text-foreground">
                  {formatPrice(due)}
                </p>
                {tip > 0 && (
                  <p className="mt-1 text-meta text-muted-foreground">
                    {formatPrice(amount)} + {formatPrice(tip)} de propina
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-pressed={editing === "amount"}
                onClick={() => setEditing(editing === "amount" ? "received" : "amount")}
                className={cn(
                  posPressable,
                  "flex min-h-12 items-center gap-2 rounded-button border px-3 text-body-sm font-semibold",
                  editing === "amount" ? "border-foreground bg-foreground text-background" : "border-border bg-secondary text-foreground"
                )}
              >
                <Pencil className="size-4" aria-hidden /> Otro monto
              </button>
            </section>

            <section aria-labelledby="pay-method" className="flex flex-col gap-3">
              <h3 id="pay-method" className="text-lead font-semibold text-foreground">
                ¿Con qué paga?
              </h3>
              <ChoiceCards<MethodChoice>
                label="Método de pago"
                value={method}
                onChange={setMethod}
                size="md"
                options={[
                  { value: PAYMENT_METHOD.CASH, title: "Efectivo", description: "Calcula el vuelto.", icon: Banknote, tone: "money-in" },
                  { value: PAYMENT_METHOD.CARD, title: "Tarjeta", description: "Débito o crédito.", icon: CreditCard, tone: "info" },
                  { value: PAYMENT_METHOD.TRANSFER, title: "Transferencia", description: "Revisa el comprobante.", icon: Landmark, tone: "info" },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: PAYMENT_METHOD.OTHER, label: "Otro método", icon: CircleEllipsis },
                    { value: "MULTI", label: "Varios métodos", icon: Layers },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={method === o.value}
                    onClick={() => setMethod(o.value)}
                    className={cn(
                      posPressable,
                      "flex min-h-12 items-center gap-2 rounded-button border px-4 text-body-sm font-semibold",
                      method === o.value ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    <o.icon className="size-4" aria-hidden /> {o.label}
                  </button>
                ))}
                {preferred?.preferredMethod && (
                  <p className="flex min-h-12 items-center text-meta text-info-soft-foreground">
                    El cliente pidió pagar con {PAYMENT_METHOD_LABEL[preferred.preferredMethod].toLowerCase()}
                    {preferred.paysWithAmount ? ` (trae ${formatPrice(preferred.paysWithAmount)})` : ""}.
                  </p>
                )}
              </div>
            </section>

            <section aria-labelledby="pay-tip" className="flex flex-col gap-2">
              <h3 id="pay-tip" className="text-body font-semibold text-foreground">
                Propina
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {TIP_PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={tipPct === p && editing !== "tip"}
                    onClick={() => {
                      setTipText(numberToKeypad(Math.round(amount * p) / 100));
                      if (editing === "tip") setEditing("received");
                    }}
                    className={cn(
                      posPressable,
                      "min-h-12 rounded-button border text-body-sm font-semibold",
                      tipPct === p && editing !== "tip" ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    {p === 0 ? "Sin propina" : `${p}%`}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={editing === "tip"}
                  onClick={() => setEditing(editing === "tip" ? "received" : "tip")}
                  className={cn(
                    posPressable,
                    "min-h-12 rounded-button border text-body-sm font-semibold",
                    editing === "tip" || (tipPct === undefined && tip > 0) ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
                  )}
                >
                  Otra
                </button>
              </div>
            </section>

            {method === "MULTI" && (
              <section aria-labelledby="pay-multi" className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
                <h3 id="pay-multi" className="text-body font-semibold text-foreground">
                  ¿Cuánto en cada método?
                </h3>
                {(
                  [
                    ["cash", "Efectivo recibido"],
                    ["card", "Tarjeta"],
                    ["transfer", "Transferencia"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="grid grid-cols-[1fr_9rem] items-center gap-3">
                    <Label htmlFor={`multi-${key}`} className="text-body-sm font-medium">
                      {label}
                    </Label>
                    <Input
                      id={`multi-${key}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={multi[key]}
                      onChange={(e) => setMulti((m) => ({ ...m, [key]: e.target.value }))}
                      className="h-12 text-right text-lead tabular-nums"
                    />
                  </div>
                ))}
                <p aria-live="polite" className="flex items-baseline justify-between text-body-sm">
                  <span className="text-muted-foreground">Vuelto</span>
                  <span className="text-title font-semibold tabular-nums text-money-in-soft-foreground">
                    {formatPrice(multiEval.change)}
                  </span>
                </p>
              </section>
            )}

            {(method === PAYMENT_METHOD.CARD || method === PAYMENT_METHOD.TRANSFER || method === PAYMENT_METHOD.OTHER) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-reference" className="text-body-sm font-medium">
                  Referencia (opcional)
                </Label>
                <Input
                  id="pay-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={100}
                  placeholder="N.º de comprobante o autorización"
                  className="h-12 text-body"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {isCash && editing === "received" && (
              <div
                aria-live="polite"
                className={cn(
                  "flex items-center justify-between gap-3 rounded-card border-2 px-4 py-3",
                  missing > 0 ? "border-money-out-border bg-money-out-soft" : "border-money-in-border bg-money-in-soft"
                )}
              >
                <span className={cn("text-body font-semibold", missing > 0 ? "text-money-out-soft-foreground" : "text-money-in-soft-foreground")}>
                  {missing > 0 ? "Falta" : "Vuelto"}
                </span>
                <span
                  className={cn(
                    "font-display text-[2.25rem] font-semibold leading-none tabular-nums tracking-tight",
                    missing > 0 ? "text-money-out-soft-foreground" : "text-money-in-soft-foreground"
                  )}
                >
                  {formatPrice(missing > 0 ? missing : change)}
                </span>
              </div>
            )}
            {keypadTarget === "received" && (
              <AmountKeypad label="Recibido" value={receivedText} onChange={setReceivedText} quick={quick} tone="money-in" />
            )}
            {keypadTarget === "amount" && (
              <AmountKeypad
                label="Monto a cobrar"
                value={amountText}
                onChange={setAmountText}
                quick={[{ label: "Saldo", value: bill.balance }, ...(suggestedAmount !== bill.balance ? [{ label: "Sugerido", value: suggestedAmount }] : [])]}
              />
            )}
            {keypadTarget === "tip" && <AmountKeypad label="Propina" value={tipText} onChange={setTipText} />}
            {error && (
              <p role="alert" className="rounded-control bg-money-out-soft px-3 py-2 text-body-sm text-money-out-soft-foreground">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      <StepFooter
        onBack={onBack}
        hint={block}
        disabled={!!block}
        pending={submitting}
        needsNetwork
        primaryLabel={
          <>
            Cobrar <span className="tabular-nums">{formatPrice(due)}</span>
          </>
        }
        onPrimary={submit}
      />
    </>
  );
}
