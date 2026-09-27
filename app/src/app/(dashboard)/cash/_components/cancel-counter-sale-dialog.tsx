"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cancelCounterSale } from "@/lib/actions/counter";
import { cancelCounterSaleSchema, type CancelCounterSaleInput } from "@/lib/validations/counter";
import { notify } from "@/lib/notifications";

/**
 * Cancela una venta de mostrador abandonada (nadie la retiró, nadie la
 * pagó). Igual que "Forzar cierre" en Mesas: requiere un motivo — la
 * base lo audita (VOID_BILL) — y rechaza cualquier venta que ya tenga un
 * pago registrado ("La venta tiene pagos: anúlalos primero").
 */
export function CancelCounterSaleDialog({ billId, placeLabel }: { billId: string; placeLabel: string }) {
  "use no memo";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CancelCounterSaleInput>({
    resolver: zodResolver(cancelCounterSaleSchema),
    defaultValues: { billId, reason: "" },
  });

  function onSubmit(values: CancelCounterSaleInput) {
    return cancelCounterSale({ ...values, billId }).then((result) => {
      if (!result.ok) {
        setError("root", { message: result.error });
        notify.error(result.error);
        return;
      }
      notify.success("Venta cancelada");
      setOpen(false);
      reset();
      router.refresh();
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
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 rounded-full text-[13px] font-semibold text-muted-foreground"
        >
          <Ban className="h-4 w-4" /> Cancelar venta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Cancelar {placeLabel}?</DialogTitle>
          <DialogDescription>
            Anula el pedido y la cuenta. Solo se puede cancelar mientras no tenga pagos
            registrados. Escribe el motivo (nadie la retiró, error al tomarla, etc.).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cancel-counter-reason">Motivo</FieldLabel>
              <Textarea id="cancel-counter-reason" rows={2} {...register("reason")} />
              <FieldError errors={[errors.reason]} />
            </Field>
            <FieldError errors={[errors.root]} />
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting}
              className="clay clay-wine h-11 rounded-full"
            >
              {isSubmitting && <Loader2 className="animate-spin" />}
              Cancelar venta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
