"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { notify } from "@/lib/notifications";
import { cashCut, getCashCutPrecheck } from "@/lib/actions/cash";
import { cashToWithdraw, formatFolios } from "@/lib/cash-cut";
import { formatPrice } from "@/lib/utils";
import type { CashCutPrecheck } from "@/types/billing";
import { CashCalculator } from "./cash-calculator";

function num(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Corte a ciegas. El formulario y el resumen solo muestran lo DECLARADO:
 * lo esperado no llega al navegador hasta que el corte está guardado
 * (el precheck solo trae pendientes y qué métodos tuvieron cobros).
 */
export function CashCutDialog({
  cashSessionId,
  registerName,
}: {
  cashSessionId: string;
  registerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [precheck, setPrecheck] = useState<CashCutPrecheck | null>(null);
  const [precheckError, setPrecheckError] = useState<string | null>(null);
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [transfer, setTransfer] = useState("");
  const [floatLeft, setFloatLeft] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCashCutPrecheck(cashSessionId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setPrecheck(r.data);
        setPrecheckError(null);
      } else {
        setPrecheckError(r.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, cashSessionId]);

  const cashN = num(cash);
  const floatN = num(floatLeft) ?? 0;
  const cardN = num(card);
  const transferN = num(transfer);
  const withdraw = cashN === undefined ? null : cashToWithdraw(cashN, floatN);
  const floatTooBig = cashN !== undefined && floatN > cashN;
  const blocked = (precheck?.pending_count ?? 0) > 0;
  const formInvalid = cashN === undefined || cashN < 0 || floatTooBig || floatN < 0;

  function buildInput(skip: boolean) {
    return {
      cashSessionId,
      counts: {
        CASH: cashN,
        ...(precheck?.has_card_payments && cardN !== undefined ? { CARD: cardN } : {}),
        ...(precheck?.has_transfer_payments && transferN !== undefined ? { TRANSFER: transferN } : {}),
      },
      cashFloatLeft: floatN,
      notes,
      skipPendingOrders: skip,
    };
  }

  async function submit(skip: boolean) {
    const result = await cashCut(buildInput(skip));
    if (!result.ok) {
      setError(result.error);
      if (result.code === "PENDING_ORDERS") {
        const fresh = await getCashCutPrecheck(cashSessionId);
        if (fresh.ok) setPrecheck(fresh.data);
      }
      return result;
    }
    notify.success("Corte guardado");
    setOpen(false);
    router.push(`/cash/cortes/${cashSessionId}`);
    router.refresh();
    return result;
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (formInvalid || blocked) return;
    startTransition(async () => {
      await submit(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-12 w-full gap-2 text-body font-semibold">
          <Lock className="size-4" aria-hidden /> Hacer corte de caja
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo corte · {registerName}</DialogTitle>
          <DialogDescription>
            Cuenta lo que hay en la caja sin mirar el sistema. Cuando guardes, verás cómo salió.
          </DialogDescription>
        </DialogHeader>

        {blocked && precheck && (
          <div role="alert" className="flex gap-3 rounded-control border border-warning-border bg-warning-soft p-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-soft-foreground" aria-hidden />
            <div className="min-w-0 text-body-sm">
              <p className="font-semibold text-foreground">
                {precheck.pending_count === 1
                  ? "Falta cobrar 1 pedido"
                  : `Faltan por cobrar ${precheck.pending_count} pedidos`}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Folios {formatFolios(precheck.pending_folios)}. Cóbralos para poder cerrar, o guarda el corte
                omitiéndolos: quedarán registrados en el detalle.
              </p>
              <Button asChild variant="outline" className="mt-2 h-11">
                <Link href="/cash">Ir a cobrar</Link>
              </Button>
            </div>
          </div>
        )}
        {precheckError && (
          <p role="alert" className="text-meta text-destructive">
            {precheckError}
          </p>
        )}

        <form onSubmit={handleSave} noValidate className="grid gap-6 md:grid-cols-[1fr_16rem]">
          <FieldGroup>
            <Field data-invalid={cash !== "" && cashN === undefined ? true : undefined}>
              <FieldLabel htmlFor="cut-cash">Efectivo contado</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="cut-cash"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  autoComplete="off"
                  className="h-12 text-lead tabular-nums"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                />
                <CashCalculator onApply={(total) => setCash(String(total))} />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="cut-card">Pagos con tarjeta</FieldLabel>
              <Input
                id="cut-card"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                autoComplete="off"
                disabled={precheck ? !precheck.has_card_payments : false}
                className="h-12 text-lead tabular-nums"
                value={card}
                onChange={(e) => setCard(e.target.value)}
              />
              {precheck && !precheck.has_card_payments && (
                <FieldDescription>No hubo cobros con tarjeta en este turno: no hay nada que contar.</FieldDescription>
              )}
            </Field>

            {(precheck?.has_transfer_payments ?? false) && (
              <Field>
                <FieldLabel htmlFor="cut-transfer">Transferencias recibidas</FieldLabel>
                <Input
                  id="cut-transfer"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  autoComplete="off"
                  className="h-12 text-lead tabular-nums"
                  value={transfer}
                  onChange={(e) => setTransfer(e.target.value)}
                />
              </Field>
            )}

            <Field data-invalid={floatTooBig ? true : undefined}>
              <FieldLabel htmlFor="cut-float">Fondo que queda para el siguiente turno</FieldLabel>
              <Input
                id="cut-float"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                autoComplete="off"
                aria-invalid={floatTooBig || undefined}
                className="h-12 text-lead tabular-nums"
                value={floatLeft}
                onChange={(e) => setFloatLeft(e.target.value)}
              />
              <FieldDescription>El efectivo que se reserva en la caja; el resto se retira.</FieldDescription>
              {floatTooBig && <FieldError>El fondo no puede ser mayor que el efectivo contado.</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="cut-notes">Nota (opcional)</FieldLabel>
              <Textarea id="cut-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            {error && (
              <p role="alert" className="text-meta text-destructive">
                {error}
              </p>
            )}
          </FieldGroup>

          <aside aria-label="Resumen de lo declarado" className="h-fit rounded-card border border-border bg-secondary p-4">
            <p className="mb-3 text-body-sm font-semibold text-foreground">Lo que declaras</p>
            <dl className="flex flex-col gap-2 text-body-sm">
              <Row label="Efectivo contado" value={cashN} />
              <Row label="Tarjeta" value={cardN} />
              {precheck?.has_transfer_payments && <Row label="Transferencias" value={transferN} />}
              <Row label="Fondo que queda" value={floatLeft === "" ? undefined : floatN} />
            </dl>
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-caption text-muted-foreground">Efectivo a retirar</p>
              <p className="font-display text-title font-semibold tabular-nums text-wine">
                {withdraw === null ? "—" : formatPrice(withdraw)}
              </p>
            </div>
          </aside>

          <DialogFooter className="gap-2 md:col-span-2">
            {blocked && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="outline" className="h-11" disabled={formInvalid || pending}>
                    Omitir pedidos pendientes
                  </Button>
                }
                title="¿Guardar el corte sin cobrar esos pedidos?"
                description={`Se omitirán los folios ${formatFolios(precheck?.pending_folios ?? [])}. El corte los dejará registrados como pendientes y no se podrá deshacer.`}
                confirmLabel="Omitir y guardar corte"
                destructive
                action={async () => {
                  const r = await submit(true);
                  return r.ok ? { ok: true as const, data: undefined } : r;
                }}
              />
            )}
            <Button type="submit" className="h-11" disabled={formInvalid || blocked || pending}>
              {pending && <Loader2 className="animate-spin" />}
              Guardar corte
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value === undefined ? "—" : formatPrice(value)}</dd>
    </div>
  );
}
