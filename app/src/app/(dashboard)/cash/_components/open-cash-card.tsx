"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { openCashSession } from "@/lib/actions/cash";
import { openCashSessionSchema, type OpenCashSessionInput } from "@/lib/validations/cash";
import type { CashRegisterOption } from "@/lib/queries/cash";

/**
 * Tarjeta "Abrir caja". Sin caja abierta no se puede cobrar
 * (resolve_open_cash_session la exige) — es lo primero que ve cualquier
 * rol al entrar a /cash si nadie la abrió todavía hoy.
 */
export function OpenCashCard({ registers }: { registers: CashRegisterOption[] }) {
  "use no memo";
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OpenCashSessionInput>({
    resolver: zodResolver(openCashSessionSchema),
    defaultValues: {
      registerId: registers[0]?.id ?? "",
      openingFloat: 0,
    },
  });

  function onSubmit(values: OpenCashSessionInput) {
    return openCashSession(values).then((result) => {
      if (!result.ok) {
        setError("root", { message: result.error });
        notify.error(result.error);
        return;
      }
      notify.success(`Caja abierta · ${result.data.register_name}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Wallet className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display text-body-lg font-semibold text-foreground">Abrir caja</p>
          <p className="text-meta text-muted-foreground">Hace falta antes de poder cobrar.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
        <FieldGroup>
          {registers.length > 1 && (
            <Field>
              <FieldLabel htmlFor="cash-register">Caja</FieldLabel>
              <Controller
                control={control}
                name="registerId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cash-register" className="h-12 w-full">
                      <SelectValue placeholder="Elige una caja" />
                    </SelectTrigger>
                    <SelectContent>
                      {registers.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.registerId]} />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="opening-float">Fondo inicial</FieldLabel>
            <Input
              id="opening-float"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className="h-12 font-display text-lead tabular-nums"
              {...register("openingFloat", {
                setValueAs: (v: string) => (v === "" ? 0 : Number(v)),
              })}
            />
            <FieldDescription>El efectivo con el que arranca la caja hoy.</FieldDescription>
            <FieldError errors={[errors.openingFloat]} />
          </Field>

          <FieldError errors={[errors.root]} />
        </FieldGroup>

        <Button
          type="submit"
          disabled={isSubmitting || registers.length === 0}
          className="clay clay-primary h-12 w-full rounded-full text-body font-semibold"
        >
          {isSubmitting && <Loader2 className="animate-spin" />}
          Abrir caja
        </Button>
        {registers.length === 0 && (
          <p className="text-meta text-destructive">
            No hay ninguna caja configurada para este restaurante.
          </p>
        )}
      </form>
    </div>
  );
}
