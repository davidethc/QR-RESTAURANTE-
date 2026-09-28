"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notifications";
import { applyBillDiscount } from "@/lib/actions/billing";
import { applyDiscountSchema, type ApplyDiscountInput } from "@/lib/validations/billing";
import { DISCOUNT_KIND } from "@/config/constants";
import type { Bill } from "@/types/billing";

/**
 * Descuento sobre el total de la cuenta (no por ítem: el diseño soporta
 * `orderItemId`, pero la hoja de cobro solo ofrece el caso común). El
 * backend vuelve a validar el tope del mesero (max_waiter_discount_pct);
 * este diálogo solo aparece cuando el rol lo permite (ver charge-sheet).
 */
export function DiscountDialog({
  billId,
  trigger,
  onApplied,
}: {
  billId: string;
  trigger: React.ReactNode;
  onApplied: (bill: Bill) => void;
}) {
  "use no memo";
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ApplyDiscountInput>({
    resolver: zodResolver(applyDiscountSchema),
    defaultValues: {
      billId,
      kind: DISCOUNT_KIND.PERCENT,
      value: undefined,
      reason: "",
    },
  });

  function onSubmit(values: ApplyDiscountInput) {
    return applyBillDiscount({ ...values, billId }).then((result) => {
      if (!result.ok) {
        setError("root", { message: result.error });
        notify.error(result.error);
        return;
      }
      onApplied(result.data);
      notify.success("Descuento aplicado");
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar descuento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel>Tipo</FieldLabel>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(v)}
                    className="grid w-full grid-cols-2 gap-2"
                  >
                    <ToggleGroupItem value={DISCOUNT_KIND.PERCENT} className="h-11 rounded-xl text-body-sm font-semibold">
                      Porcentaje
                    </ToggleGroupItem>
                    <ToggleGroupItem value={DISCOUNT_KIND.FIXED} className="h-11 rounded-xl text-body-sm font-semibold">
                      Monto fijo
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="discount-value">Valor</FieldLabel>
              <Input
                id="discount-value"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="h-12 font-display text-lead tabular-nums"
                {...register("value", { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) })}
              />
              <FieldError errors={[errors.value]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="discount-reason">Motivo</FieldLabel>
              <Textarea id="discount-reason" rows={2} {...register("reason")} />
              <FieldError errors={[errors.reason]} />
            </Field>

            <FieldError errors={[errors.root]} />
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isSubmitting} className="clay clay-primary h-11 rounded-full">
              {isSubmitting && <Loader2 className="animate-spin" />}
              <Tag className="h-4 w-4" /> Aplicar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
