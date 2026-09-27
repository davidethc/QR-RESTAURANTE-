"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DoorOpen, Loader2, ShieldAlert, Wallet } from "lucide-react";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChargeSheet } from "@/app/(dashboard)/cash/_components/charge-sheet";
import { closeTableSession } from "@/lib/actions/tables";
import { forceCloseTableSession } from "@/lib/actions/billing";
import { forceCloseTableSchema, type ForceCloseTableInput } from "@/lib/validations/billing";
import { notify } from "@/lib/notifications";
import type { UserRole } from "@/config/constants";

/**
 * Diálogo de "Forzar cierre": libera una mesa con saldo pendiente sin
 * cobrarlo (el cliente ya se fue). Solo OWNER/ADMIN, con motivo
 * obligatorio — la RPC lo audita como FORCE_CLOSE_SESSION y la cuenta
 * queda abierta y cobrable después desde /cash.
 */
function ForceCloseDialog({ tableId, tableLabel }: { tableId: string; tableLabel: string }) {
  "use no memo";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForceCloseTableInput>({
    resolver: zodResolver(forceCloseTableSchema),
    defaultValues: { tableId, reason: "" },
  });

  function onSubmit(values: ForceCloseTableInput) {
    return forceCloseTableSession({ ...values, tableId }).then((result) => {
      if (!result.ok) {
        setError("root", { message: result.error });
        notify.error(result.error);
        return;
      }
      notify.success("Mesa liberada sin cobrar");
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
      <div onClick={(e) => e.preventDefault()}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full rounded-full text-[13px] font-semibold text-muted-foreground"
          >
            <ShieldAlert className="h-4 w-4" /> Forzar cierre
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Forzar el cierre de {tableLabel}?</DialogTitle>
          <DialogDescription>
            Libera la mesa aunque tenga saldo pendiente. La cuenta sigue abierta y se puede
            cobrar después desde Caja → Cuentas abiertas. Escribe el motivo (el cliente se fue,
            error de mesa, etc.).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="force-close-reason">Motivo</FieldLabel>
              <Textarea id="force-close-reason" rows={2} {...register("reason")} />
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
              Forzar cierre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Libera una mesa ocupada. Con el módulo de cobro apagado (billing_enabled
 * = false) se comporta como siempre: un cierre directo, para el caso que
 * "Pedir cuenta" no cubre (efectivo, o el cliente se fue sin pasar por ahí).
 *
 * Con el cobro activo, liberar sin más ya no tiene sentido — hay que
 * cobrar primero. "Cobrar y liberar" abre la hoja de cobro; al quedar la
 * cuenta en CLOSED, record_payment/finalize_bill ya liberaron la mesa
 * solos. OWNER/ADMIN ven además "Forzar cierre" para el caso del cliente
 * que se fue sin pagar.
 */
export function ReleaseTableButton({
  tableId,
  tableLabel,
  role,
  billingEnabled,
  maxWaiterDiscountPct,
  tableSessionId,
}: {
  tableId: string;
  tableLabel: string;
  role: UserRole;
  billingEnabled: boolean;
  maxWaiterDiscountPct: number;
  /** Sesión viva de la mesa (ACTIVE o EXPIRED). Sin ella no se puede abrir la hoja de cobro. */
  tableSessionId?: string;
}) {
  const router = useRouter();
  const canForceClose = role === "OWNER" || role === "ADMIN";

  if (billingEnabled && tableSessionId) {
    return (
      <div className="flex w-full flex-col gap-1.5">
        <ChargeSheet
          tableSessionId={tableSessionId}
          tableLabel={tableLabel}
          role={role}
          maxWaiterDiscountPct={maxWaiterDiscountPct}
          onSettled={() => router.refresh()}
          trigger={
            <Button className="clay clay-primary h-9 w-full rounded-full text-[13px] font-semibold">
              <Wallet className="h-4 w-4" /> Cobrar y liberar
            </Button>
          }
        />
        {canForceClose && <ForceCloseDialog tableId={tableId} tableLabel={tableLabel} />}
      </div>
    );
  }

  return (
    // Mismo motivo que TableQrDialog: esta card es un <Link> (Server
    // Component, no puede llevar onClick) — hay que evitar que abrir el
    // diálogo navegue a /orders.
    <div onClick={(e) => e.preventDefault()}>
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full rounded-full text-[13px] font-semibold text-muted-foreground"
          >
            <DoorOpen className="h-4 w-4" /> Liberar mesa
          </Button>
        }
        title="¿Liberar esta mesa?"
        description={`${tableLabel} quedará disponible para el próximo cliente. Usa esto cuando la cuenta se cobró sin pasar por "Pedir cuenta" (efectivo, o el cliente ya se fue).`}
        confirmLabel="Liberar"
        action={() => closeTableSession(tableId)}
        successMessage="Mesa liberada"
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
