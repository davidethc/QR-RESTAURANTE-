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
  DialogDescription,
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
import { REASON_LABEL } from "@/lib/cash-labels";


/**
 * Entrada/salida de caja. OWNER/ADMIN y CASHIER de esa caja (add_cash_movement).
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

export function CashMovementDialog({
  cashSessionId,
  sessions,
  label = "Registrar movimiento",
}: {
  cashSessionId?: string;
  /** Cajas abiertas donde se puede registrar; con varias, se muestra un selector. */
  sessions?: { id: string; name: string }[];
  label?: string;
}) {
  "use no memo";
  const [targetId, setTargetId] = useState(cashSessionId ?? sessions?.[0]?.id ?? "");
  const cashSessionIdValue = targetId;
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
    defaultValues: freshMovement(cashSessionIdValue),
  });

  const reason = useWatch({ control, name: "reason" });

  function onSubmit(values: AddCashMovementInput) {
    return addCashMovement({ ...values, cashSessionId: cashSessionIdValue }).then((result) => {
      if (!result.ok) {
        setError("root", { message: result.error });
        notify.error(result.error);
        return;
      }
      notify.success(result.data.replayed ? "Ese movimiento ya estaba registrado" : "Movimiento registrado");
      setOpen(false);
      reset(freshMovement(cashSessionIdValue));
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset(freshMovement(cashSessionIdValue));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 text-body-sm font-semibold">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimiento de caja</DialogTitle>
          <DialogDescription>Todo movimiento necesita un motivo; suma al esperado del siguiente corte.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {sessions && sessions.length > 1 && (
              <Field>
                <FieldLabel htmlFor="movement-register">Caja</FieldLabel>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger id="movement-register" className="h-12 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
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
                    <ToggleGroupItem value={CASH_MOVEMENT_TYPE.IN} className="h-11 rounded-control text-body-sm font-semibold">
                      <ArrowDownCircle className="h-4 w-4" /> Entrada
                    </ToggleGroupItem>
                    <ToggleGroupItem value={CASH_MOVEMENT_TYPE.OUT} className="h-11 rounded-control text-body-sm font-semibold">
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
                className="h-12 text-lead tabular-nums"
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
            <Button type="submit" disabled={isSubmitting || !targetId} className="h-11">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
