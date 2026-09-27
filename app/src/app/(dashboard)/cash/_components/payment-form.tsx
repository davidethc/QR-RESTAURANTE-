"use client";

import { useEffect, useMemo } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, CreditCard, Landmark, CircleEllipsis, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { recordPayment } from "@/lib/actions/billing";
import { recordPaymentSchema, type RecordPaymentInput } from "@/lib/validations/billing";
import { calcChange } from "@/lib/money";
import { formatPrice } from "@/lib/utils";
import { PAYMENT_METHOD } from "@/config/constants";
import type { PaymentMethod } from "@/config/constants";
import type { Bill, RecordPaymentResult } from "@/types/billing";

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

/**
 * Formulario de cobro dentro de la hoja de cuenta. La forma de pago, el
 * monto y la propina los edita el mesero; los ítems a pagar (modo "por
 * ítems") los decide la hoja (ChargeSheet) y llegan ya armados — no son
 * un campo visible de este formulario.
 */
export function PaymentForm({
  bill,
  suggestedAmount,
  resetToken,
  paymentItems,
  idempotencyKey,
  onPaid,
}: {
  bill: Bill;
  suggestedAmount: number;
  /** Cambia cuando el monto sugerido debe pisar lo que el mesero escribió
   *  (cambió el modo de división, las partes, o los ítems elegidos). */
  resetToken: string;
  paymentItems?: { order_item_id: string; quantity: number }[];
  idempotencyKey: string;
  onPaid: (result: RecordPaymentResult) => void;
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

  const change = useMemo(() => {
    if (method !== PAYMENT_METHOD.CASH) return null;
    try {
      const amountNum = Number(amount) || 0;
      const tipNum = Number(tipAmount) || 0;
      const tenderedNum = Number(tenderedAmount) || amountNum + tipNum;
      return calcChange(tenderedNum, amountNum, tipNum);
    } catch {
      return null;
    }
  }, [method, amount, tipAmount, tenderedAmount]);

  function onSubmit(values: RecordPaymentInput) {
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

  const amountValue = Number(amount) || 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
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
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                className="grid w-full grid-cols-4 gap-2"
              >
                {METHODS.map((m) => (
                  <ToggleGroupItem
                    key={m.value}
                    value={m.value}
                    aria-label={m.label}
                    className="h-16 min-w-0 flex-col gap-1 rounded-xl border-border/70 text-[11px] font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                  >
                    <m.icon className="h-5 w-5" />
                    {m.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="pay-amount">Monto</FieldLabel>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className="h-12 font-display text-[17px] tabular-nums"
              {...register("amount", { setValueAs: emptyToUndefined })}
            />
            <FieldError errors={[errors.amount]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-tip">Propina</FieldLabel>
            <Input
              id="pay-tip"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className="h-12 font-display text-[17px] tabular-nums"
              {...register("tipAmount", {
                setValueAs: (v: string) => (v === "" ? 0 : Number(v)),
              })}
            />
            <FieldError errors={[errors.tipAmount]} />
          </Field>
        </div>

        {method === PAYMENT_METHOD.CASH && (
          <Field>
            <FieldLabel htmlFor="pay-tendered">
              Recibido (vacío = paga exacto)
            </FieldLabel>
            <Input
              id="pay-tendered"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className="h-12 font-display text-[17px] tabular-nums"
              {...register("tenderedAmount", { setValueAs: emptyToUndefined })}
            />
            <FieldError errors={[errors.tenderedAmount]} />
            <p className="flex items-baseline justify-between text-[13px] font-medium text-muted-foreground">
              <span>Vuelto</span>
              <span className="font-display text-[16px] tabular-nums text-foreground">
                {change !== null ? formatPrice(change) : "—"}
              </span>
            </p>
          </Field>
        )}

        {method !== PAYMENT_METHOD.CASH && (
          <Field>
            <FieldLabel htmlFor="pay-reference">Referencia (opcional)</FieldLabel>
            <Input
              id="pay-reference"
              placeholder="N.º de comprobante o autorización"
              {...register("reference")}
            />
            <FieldError errors={[errors.reference]} />
          </Field>
        )}

        <FieldError errors={[errors.root]} />
      </FieldGroup>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="clay clay-primary h-14 w-full rounded-full text-[16px] font-semibold"
      >
        {isSubmitting && <Loader2 className="animate-spin" />}
        Cobrar {formatPrice(amountValue)}
      </Button>
    </form>
  );
}
