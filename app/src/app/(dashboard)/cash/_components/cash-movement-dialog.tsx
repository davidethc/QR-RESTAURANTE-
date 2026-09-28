"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { newRequestId } from "@/lib/request-id";
import { addCashMovement } from "@/lib/actions/cash";
import { addCashMovementSchema, type AddCashMovementInput } from "@/lib/validations/cash";
import { CASH_MOVEMENT_TYPE } from "@/config/constants";

export const REASON_LABEL: Record<string, string> = {
  FLOAT_TOPUP: "Refuerzo de fondo",
  TIPS_PAYOUT: "Reparto de propinas",
  SUPPLIER_PAYMENT: "Pago a proveedor",
  EXPENSE: "Gasto",
  REFUND: "Devolución",
  WITHDRAWAL: "Retiro",
  OTHER: "Otro",
};

/**
 * Entrada/salida de caja. Solo OWNER/ADMIN (add_cash_movement lo exige;
 * cash_movements ni siquiera lo puede leer un WAITER — cierre ciego).
 */
/** Valores de un movimiento nuevo, con su propia clave de idempotencia. La
 * clave se conserva entre reintentos del mismo envío (el formulario no se
 * resetea si falla), pero todo `reset` arranca un movimiento distinto: sin
 * clave nueva, el siguiente movimiento se tomaría por repetición del anterior
 * y la base devolvería el viejo en vez de registrarlo. */
function freshMovement(cashSessionId: string): AddCashMovementInput {
  return {
    cashSessionId,
    type: CASH_MOVEMENT_TYPE.OUT,
    reason: "OTHER",
    amount: undefined,
    description: "",
    idempotencyKey: newRequestId(),
  };
}

export function CashMovementDialog({ cashSessionId }: { cashSessionId: string }) {
  "use no memo";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddCashMovementInput>({
    resolver: zodResolver(addCashMovementSchema),
    defaultValues: freshMovement(cashSessionId),
  });

  const reason = useWatch({ control, name: "reason" });

  function onSubmit(values: AddCashMovementInput) {
    return addCashMovement({ ...values, cashSessionId }).then((result) => {
      if (!result.ok) {
        setError("root", { message: result.error });
        notify.error(result.error);
        return;
      }
      notify.success(result.data.replayed ? "Ese movimiento ya estaba registrado" : "Movimiento registrado");
      setOpen(false);
      reset(freshMovement(cashSessionId));
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset(freshMovement(cashSessionId));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 rounded-full text-[14px] font-semibold">
          Registrar movimiento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimiento de caja</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel>Tipo</FieldLabel>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(v)}
                    className="grid w-full grid-cols-2 gap-2"
                  >
                    <ToggleGroupItem value={CASH_MOVEMENT_TYPE.IN} className="h-11 rounded-xl text-[14px] font-semibold">
                      <ArrowDownCircle className="h-4 w-4" /> Entrada
                    </ToggleGroupItem>
                    <ToggleGroupItem value={CASH_MOVEMENT_TYPE.OUT} className="h-11 rounded-xl text-[14px] font-semibold">
                      <ArrowUpCircle className="h-4 w-4" /> Salida
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="movement-reason">Motivo</FieldLabel>
              <Controller
                control={control}
                name="reason"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="movement-reason" className="h-12 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REASON_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.reason]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="movement-amount">Monto</FieldLabel>
              <Input
                id="movement-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="h-12 font-display text-[17px] tabular-nums"
                {...register("amount", { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) })}
              />
              <FieldError errors={[errors.amount]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="movement-description">
                Descripción{reason === "OTHER" ? "" : " (opcional)"}
              </FieldLabel>
              <Textarea id="movement-description" rows={2} {...register("description")} />
              <FieldError errors={[errors.description]} />
            </Field>

            <FieldError errors={[errors.root]} />
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isSubmitting} className="clay clay-primary h-11 rounded-full">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
