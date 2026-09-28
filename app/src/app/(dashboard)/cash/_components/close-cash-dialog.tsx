"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { closeCashSession } from "@/lib/actions/cash";
import { closeCashSessionSchema, type CloseCashSessionInput } from "@/lib/validations/cash";
import { formatPrice } from "@/lib/utils";
import { PAYMENT_METHOD } from "@/config/constants";
import type { CashMethodSummary, CashSessionSummary } from "@/types/billing";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

/**
 * Cierre de caja con conteo por método. El mesero cuenta a ciegas: no ve
 * `expected` acá (ni antes ni después — `close_cash_session` solo le
 * devuelve `status`/`closed_at` cuando no es OWNER/ADMIN). Para
 * OWNER/ADMIN se muestra el esperado en vivo junto a cada campo, para
 * poder compararlo mientras cuentan.
 */
export function CloseCashDialog({
  cashSessionId,
  canSeeExpected,
  byMethod,
  onClosed,
}: {
  cashSessionId: string;
  canSeeExpected: boolean;
  /** Solo con canSeeExpected: lo que ya calcula get_cash_session_summary. */
  byMethod?: CashMethodSummary[];
  /** Solo OWNER/ADMIN: recibe el resumen completo del cierre para la tarjeta persistente. */
  onClosed?: (result: CashSessionSummary) => void;
}) {
  "use no memo";
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<CloseCashSessionInput>({
    resolver: zodResolver(closeCashSessionSchema),
    defaultValues: {
      cashSessionId,
      counts: {},
      notes: "",
    },
  });

  function expectedFor(method: string) {
    return byMethod?.find((m) => m.method === method)?.expected;
  }

  function onSubmit(values: CloseCashSessionInput) {
    return closeCashSession({ ...values, cashSessionId }).then((result) => {
      if (!result.ok) {
        setError("root", { message: result.error });
        notify.error(result.error);
        return;
      }
      if (result.data.can_see_expected && result.data.cash_difference !== undefined) {
        const diff = result.data.cash_difference ?? 0;
        notify.success(
          diff === 0
            ? "Caja cerrada · cuadró exacto"
            : `Caja cerrada · diferencia en efectivo ${diff > 0 ? "+" : ""}${formatPrice(diff)}`
        );
        onClosed?.(result.data);
      } else {
        notify.success("Caja cerrada");
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearErrors();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 w-full rounded-full text-body-sm font-semibold">
          <Lock className="h-4 w-4" /> Cerrar caja
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>
            {canSeeExpected
              ? "Cuenta el efectivo y anota lo que hay en cada método."
              : "Cuenta el efectivo y anota lo que hay, sin mirar el sistema."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {Object.values(PAYMENT_METHOD).map((method) => {
              const expected = expectedFor(method);
              const fieldError = errors.counts?.[method];
              return (
                <Field key={method} data-invalid={fieldError ? true : undefined}>
                  <FieldLabel htmlFor={`count-${method}`}>
                    {METHOD_LABEL[method]}
                    {method !== PAYMENT_METHOD.CASH && " (opcional)"}
                    {canSeeExpected && expected !== undefined && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · esperado {formatPrice(expected)}
                      </span>
                    )}
                  </FieldLabel>
                  <Input
                    id={`count-${method}`}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    aria-invalid={fieldError ? true : undefined}
                    className="h-12 font-display text-lead tabular-nums"
                    {...register(`counts.${method}` as const, {
                      setValueAs: (v: string) => (v === "" ? undefined : Number(v)),
                    })}
                  />
                  <FieldError errors={[fieldError]} />
                </Field>
              );
            })}

            <Field>
              <FieldLabel htmlFor="close-notes">Notas (opcional)</FieldLabel>
              <Textarea id="close-notes" rows={2} {...register("notes")} />
            </Field>

            <FieldError errors={[errors.root]} />
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isSubmitting} className="clay clay-wine h-11 rounded-full">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Cerrar caja
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
