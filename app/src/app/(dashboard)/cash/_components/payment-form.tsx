"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, CreditCard, Landmark, CircleEllipsis, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { recordPayment, recordPayments } from "@/lib/actions/billing";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { Badge } from "@/components/ui/badge";
import { recordPaymentSchema, type RecordPaymentInput } from "@/lib/validations/billing";
import { cashQuickAmounts, cashShortfall, changeDue, evaluateMultiMethod } from "@/lib/money";
import { cn, formatPrice } from "@/lib/utils";
import { PAYMENT_METHOD } from "@/config/constants";
import type { PaymentMethod } from "@/config/constants";
import type { Bill, BillPaymentContext, RecordPaymentResult } from "@/types/billing";

const METHODS: { value: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { value: PAYMENT_METHOD.CASH, label: "Efectivo", icon: Banknote },
  { value: PAYMENT_METHOD.CARD, label: "Tarjeta", icon: CreditCard },
  { value: PAYMENT_METHOD.TRANSFER, label: "Transferencia", icon: Landmark },
  { value: PAYMENT_METHOD.OTHER, label: "Otro", icon: CircleEllipsis },
];

/**
 * Convierte el valor crudo de un <input type="number"> a lo que espera
 * el schema: vacío -> undefined (deja que zod aplique su propio default o
 * su propio "obligatorio"), cualquier otra cosa -> Number(v). Sin esto,
 * `valueAsNumber` convierte "" en NaN y money() lo rechaza con "escribe un
 * monto válido" incluso en campos opcionales como la propina o el efectivo
 * recibido (vacío = "cobra el cambio exacto", un caso real, no un error).
 */
function emptyToUndefined(v: string) {
  return v === "" ? undefined : Number(v);
}

const TIP_PERCENTS = [0, 5, 10] as const;

export type PaymentFormStatus = {
  amount: number;
  submitting: boolean;
  /** Por qué no se puede cobrar todavía (null = listo). El botón lo muestra. */
  blockReason?: string | null;
};

const MULTI = "MULTI" as const;

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Formulario de cobro dentro de la hoja de cuenta. La forma de pago, el
 * monto y la propina los edita quien cobra; los ítems a pagar (modo "por
 * ítems") los decide la hoja (ChargeSheet) y llegan ya armados — no son
 * un campo visible de este formulario.
 *
 * El botón de enviar NO vive aquí: está en la barra fija de la hoja
 * (ChargeFooter) y apunta a este form con `form={formId}`, así el saldo y
 * la acción quedan siempre a la vista aunque el formulario se desplace.
 * `onStatusChange` le avisa a la hoja el monto y si hay un envío en curso
 * para pintar ese botón.
 */
export function PaymentForm({
  formId,
  bill,
  suggestedAmount,
  resetToken,
  paymentItems,
  idempotencyKey,
  onPaid,
  onStatusChange,
  preferred,
}: {
  formId: string;
  bill: Bill;
  suggestedAmount: number;
  /** Cambia cuando el monto sugerido debe pisar lo que se escribió
   *  (cambió el modo de división, las partes, o los ítems elegidos). */
  resetToken: string;
  paymentItems?: { order_item_id: string; quantity: number }[];
  idempotencyKey: string;
  onPaid: (result: RecordPaymentResult) => void;
  onStatusChange: (status: PaymentFormStatus) => void;
  /** Lo que el cliente indicó al pedir (M07-T03): se precarga, editable. */
  preferred?: Pick<BillPaymentContext, "preferredMethod" | "paysWithAmount"> | null;
}) {
  // Ver la nota en product-dialog.tsx: RHF lee refs al invocar
  // handleSubmit, incompatible con el React Compiler.
  "use no memo";
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      billId: bill.id,
      method: PAYMENT_METHOD.CASH,
      amount: suggestedAmount,
      tipAmount: 0,
      idempotencyKey,
      autoClose: true,
    },
  });

  const [multi, setMulti] = useState(false);
  const [multiCash, setMultiCash] = useState("");
  const [multiCard, setMultiCard] = useState("");
  const [multiTransfer, setMultiTransfer] = useState("");

  // Método preferido: se aplica una vez por cuenta/preferencia, sin pisar
  // lo que quien cobra ya haya cambiado.
  const prefKey = preferred?.preferredMethod ? `${bill.id}:${preferred.preferredMethod}:${preferred.paysWithAmount ?? ""}` : "";
  useEffect(() => {
    if (!preferred?.preferredMethod) return;
    setValue("method", preferred.preferredMethod);
    if (preferred.preferredMethod === PAYMENT_METHOD.CASH && preferred.paysWithAmount) {
      setValue("tenderedAmount", preferred.paysWithAmount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey]);

  useEffect(() => {
    setValue("billId", bill.id);
  }, [bill.id, setValue]);

  useEffect(() => {
    setValue("idempotencyKey", idempotencyKey);
  }, [idempotencyKey, setValue]);

  useEffect(() => {
    setValue("amount", suggestedAmount, { shouldValidate: false });
    // Solo cuando cambia algo estructural (resetToken), no en cada tecla:
    // `setValue`/`suggestedAmount` se omiten del array a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const method = useWatch({ control, name: "method" });
  const amount = useWatch({ control, name: "amount" });
  const tipAmount = useWatch({ control, name: "tipAmount" });
  const tenderedAmount = useWatch({ control, name: "tenderedAmount" });

  const amountValue = Number(amount) || 0;
  const tipValue = Number(tipAmount) || 0;

  const dueNow = amountValue + tipValue;
  const tenderedNumber = Number(tenderedAmount) || 0;
  const cashMissing =
    method === PAYMENT_METHOD.CASH && tenderedNumber > 0 ? cashShortfall(tenderedNumber, dueNow) : 0;
  const change = useMemo(() => {
    if (method !== PAYMENT_METHOD.CASH) return null;
    return changeDue(tenderedNumber > 0 ? tenderedNumber : dueNow, dueNow);
  }, [method, dueNow, tenderedNumber]);

  const multiEval = useMemo(
    () =>
      evaluateMultiMethod(
        amountValue,
        { cash: num(multiCash), card: num(multiCard), transfer: num(multiTransfer) },
        tipValue
      ),
    [amountValue, multiCash, multiCard, multiTransfer, tipValue]
  );

  const multiCount = [multiCash, multiCard, multiTransfer].filter((v) => num(v) > 0).length;
  let blockReason: string | null = null;
  if (amountValue <= 0) blockReason = "Escribe el monto a cobrar.";
  else if (multi) {
    if (multiCount === 0) blockReason = "Indica cuánto se cobra en cada método.";
    else blockReason = multiEval.error;
  } else if (cashMissing > 0) {
    blockReason = `Faltan ${formatPrice(cashMissing)}: el efectivo recibido no alcanza.`;
  }

  useEffect(() => {
    onStatusChange({ amount: amountValue, submitting: isSubmitting, blockReason });
    // `onStatusChange` es un setState del padre: estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountValue, isSubmitting, blockReason]);

  const multiFingerprint = JSON.stringify([bill.id, amountValue, tipValue, multiCash, multiCard, multiTransfer, paymentItems]);
  const multiKey = useIdempotencyKey(multiFingerprint);

  const quickCash = useMemo(() => {
    try {
      return cashQuickAmounts(amountValue + tipValue);
    } catch {
      return [];
    }
  }, [amountValue, tipValue]);

  // Qué chip de propina está activo: el que da exactamente la propina
  // escrita; si se escribió otra cifra no se marca ninguno.
  const tipPercentValue = useMemo(() => {
    const match = TIP_PERCENTS.find(
      (pct) => Math.round(amountValue * pct) === Math.round(tipValue * 100)
    );
    return match === undefined ? "" : String(match);
  }, [amountValue, tipValue]);

  function onSubmit(values: RecordPaymentInput) {
    // El botón ya se deshabilita sin red (ChargeFooter); esto cubre el Enter
    // dentro del formulario.
    if (!navigator.onLine) {
      notify.error("Sin conexión: espera a que vuelva la red para cobrar.");
      return;
    }
    if (multi) {
      if (blockReason) {
        notify.error(blockReason);
        return;
      }
      const list = (
        [
          { method: "CASH", received: num(multiCash) },
          { method: "CARD", received: num(multiCard) },
          { method: "TRANSFER", received: num(multiTransfer) },
        ] as const
      ).filter((p) => p.received > 0);
      return recordPayments({
        billId: bill.id,
        amount: values.amount,
        tipAmount: values.tipAmount,
        payments: [...list],
        items: paymentItems && paymentItems.length > 0 ? paymentItems : undefined,
        requestId: multiKey.get(),
        autoClose: true,
      }).then((result) => {
        if (!result.ok) {
          setError("root", { message: result.error });
          notify.error(result.error);
          return;
        }
        multiKey.renew();
        setMultiCash("");
        setMultiCard("");
        setMultiTransfer("");
        onPaid({
          payment_id: result.data.payments[0]?.payment_id ?? "",
          change_amount: result.data.change_amount || null,
          replayed: result.data.replayed,
          closed: result.data.closed,
          bill: result.data.bill,
        });
      });
    }
    if (blockReason) {
      notify.error(blockReason);
      return;
    }
    return recordPayment({
      ...values,
      billId: bill.id,
      idempotencyKey,
      items: paymentItems && paymentItems.length > 0 ? paymentItems : undefined,
    }).then((result) => {
      if (!result.ok) {
        setError("root", { message: result.error });
        notify.error(result.error);
        return;
      }
      onPaid(result.data);
    });
  }

  const tendered = tenderedNumber;
  const methodValue = multi ? MULTI : method;

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <FieldGroup>
        <Field>
          <FieldLabel>Forma de pago</FieldLabel>
          <Controller
            control={control}
            name="method"
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                value={methodValue}
                onValueChange={(v) => {
                  if (!v) return;
                  if (v === MULTI) {
                    setMulti(true);
                    return;
                  }
                  setMulti(false);
                  field.onChange(v);
                }}
                className="grid w-full grid-cols-2 gap-2 lg:grid-cols-5"
              >
                {METHODS.map((m) => (
                  <ToggleGroupItem
                    key={m.value}
                    value={m.value}
                    className="h-14 min-w-0 justify-start gap-2.5 rounded-control border-border/70 px-4 text-body-sm font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary lg:h-20 lg:flex-col lg:justify-center lg:gap-1.5 lg:px-2"
                  >
                    <m.icon aria-hidden className="size-5 shrink-0 lg:size-6" />
                    <span className="truncate">{m.label}</span>
                    {preferred?.preferredMethod === m.value && (
                      <Badge variant="secondary" className="ml-auto lg:ml-0">
                        Método preferido
                      </Badge>
                    )}
                  </ToggleGroupItem>
                ))}
                <ToggleGroupItem
                  value={MULTI}
                  className="h-14 min-w-0 justify-start gap-2.5 rounded-control border-border/70 px-4 text-body-sm font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary lg:h-20 lg:flex-col lg:justify-center lg:gap-1.5 lg:px-2"
                >
                  <Layers aria-hidden className="size-5 shrink-0 lg:size-6" />
                  <span className="truncate">Varios métodos</span>
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          />
        </Field>

        <Field data-invalid={!!errors.amount || undefined}>
          <div className="flex items-end justify-between gap-2">
            <FieldLabel htmlFor="pay-amount">Monto a cobrar</FieldLabel>
            {amountValue !== suggestedAmount && suggestedAmount > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="-my-2 h-11 rounded-full px-3 text-meta font-semibold text-primary"
                onClick={() => setValue("amount", suggestedAmount, { shouldValidate: true })}
              >
                Volver a {formatPrice(suggestedAmount)}
              </Button>
            )}
          </div>
          <Input
            id="pay-amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            aria-invalid={!!errors.amount || undefined}
            className="h-14 rounded-control text-2xl md:text-2xl font-semibold tabular-nums text-foreground"
            {...register("amount", { setValueAs: emptyToUndefined })}
          />
          <FieldError errors={[errors.amount]} />
        </Field>

        <Field data-invalid={!!errors.tipAmount || undefined}>
          <FieldLabel htmlFor="pay-tip">Propina</FieldLabel>
          <div className="flex gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              value={tipPercentValue}
              onValueChange={(v) => {
                if (v === "") return;
                const cents = Math.round(amountValue * Number(v));
                setValue("tipAmount", cents / 100, { shouldValidate: true });
              }}
              aria-label="Propina sugerida"
              className="grid flex-1 grid-cols-3 gap-2"
            >
              {TIP_PERCENTS.map((pct) => (
                <ToggleGroupItem
                  key={pct}
                  value={String(pct)}
                  className="h-11 min-w-0 rounded-control text-body-sm font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary"
                >
                  {pct === 0 ? "Sin" : `${pct}%`}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Input
              id="pay-tip"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              aria-invalid={!!errors.tipAmount || undefined}
              className="h-11 w-28 shrink-0 rounded-control text-lead md:text-lead tabular-nums"
              {...register("tipAmount", {
                setValueAs: (v: string) => (v === "" ? 0 : Number(v)),
              })}
            />
          </div>
          <FieldError errors={[errors.tipAmount]} />
        </Field>

        {multi && (
          <Field>
            <FieldLabel>Reparto entre métodos</FieldLabel>
            <div className="grid gap-3">
              {(
                [
                  ["multi-cash", "Recibido en efectivo", multiCash, setMultiCash],
                  ["multi-card", "Cobrado en tarjeta", multiCard, setMultiCard],
                  ["multi-transfer", "Cobrado en transferencia", multiTransfer, setMultiTransfer],
                ] as const
              ).map(([id, label, value, setter]) => (
                <div key={id} className="flex flex-col gap-1.5">
                  <Label htmlFor={id} className="text-body-sm font-semibold text-muted-foreground">
                    {label}
                  </Label>
                  <Input
                    id={id}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="h-12 rounded-control text-lead md:text-lead tabular-nums"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-baseline justify-between rounded-control bg-secondary px-4 py-3" aria-live="polite">
              <span className="text-body-sm font-semibold text-muted-foreground">
                {multiEval.error ? "Aviso" : "Cambio"}
              </span>
              <span
                className={cn(
                  "text-right leading-tight font-semibold tabular-nums",
                  multiEval.error ? "text-body-sm text-warning-soft-foreground" : "text-2xl text-foreground"
                )}
              >
                {multiEval.error && multiCount > 0 ? multiEval.error : formatPrice(multiEval.change)}
              </span>
            </div>
          </Field>
        )}

        {!multi && method === PAYMENT_METHOD.CASH && (
          <Field data-invalid={!!errors.tenderedAmount || undefined}>
            <FieldLabel htmlFor="pay-tendered">Cantidad recibida</FieldLabel>
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="Billete recibido">
              <Button
                type="button"
                variant="outline"
                aria-pressed={tendered === 0}
                className={cn(
                  "h-11 min-w-0 rounded-control px-1 text-body-sm font-semibold",
                  tendered === 0 && "border-primary bg-primary-soft text-primary"
                )}
                onClick={() => setValue("tenderedAmount", undefined, { shouldValidate: true })}
              >
                Exacto
              </Button>
              {quickCash.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  aria-pressed={tendered === value}
                  className={cn(
                    "h-11 min-w-0 rounded-control px-1 text-body font-semibold tabular-nums",
                    tendered === value && "border-primary bg-primary-soft text-primary"
                  )}
                  onClick={() => setValue("tenderedAmount", value, { shouldValidate: true })}
                >
                  {formatPrice(value)}
                </Button>
              ))}
            </div>
            <Input
              id="pay-tendered"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="Otro monto (vacío = paga exacto)"
              aria-invalid={!!errors.tenderedAmount || undefined}
              className="h-12 rounded-control text-lead md:text-lead tabular-nums"
              {...register("tenderedAmount", { setValueAs: emptyToUndefined })}
            />
            <FieldError errors={[errors.tenderedAmount]} />
            <div
              className="flex items-baseline justify-between rounded-control bg-secondary px-4 py-3"
              aria-live="polite"
            >
              <span className="text-body-sm font-semibold text-muted-foreground">Cambio:</span>
              <span className="text-2xl leading-none font-semibold tabular-nums text-foreground">
                {change !== null ? formatPrice(change) : "—"}
              </span>
            </div>
          </Field>
        )}

        {!multi && method !== PAYMENT_METHOD.CASH && (
          <Field>
            <FieldLabel htmlFor="pay-reference">Referencia (opcional)</FieldLabel>
            <Input
              id="pay-reference"
              placeholder="N.º de comprobante o autorización"
              className="h-12 rounded-control text-body md:text-body"
              {...register("reference")}
            />
            <FieldError errors={[errors.reference]} />
          </Field>
        )}

        <FieldError errors={[errors.root]} />
      </FieldGroup>
    </form>
  );
}
