"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleCheck, Coins, Loader2, LockKeyhole, Minus, Plus, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AmountKeypad } from "@/components/shared/amount-keypad";
import { StepIndicator } from "@/components/shared/step-indicator";
import { posPressable, toneSolid } from "@/components/shared/pos-tone";
import { cashCut, getCashCutPrecheck } from "@/lib/actions/cash";
import { CASH_DENOMINATIONS, cashToWithdraw, denominationTotal, formatFolios } from "@/lib/cash-cut";
import { keypadToNumber, numberToKeypad } from "@/lib/keypad";
import { notify } from "@/lib/notifications";
import { cn, formatPrice } from "@/lib/utils";
import type { CashCutPrecheck } from "@/types/billing";

type Step = "cash" | "other" | "pending" | "confirm";
const STEPS = [
  { id: "cash", label: "Contar efectivo" },
  { id: "other", label: "Tarjeta y otros" },
  { id: "pending", label: "Pendientes" },
  { id: "confirm", label: "Confirmar" },
];

/** Botón "Corte de caja" de la franja de estado. */
export function CashCutButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(posPressable, "flex min-h-12 items-center gap-2 rounded-button border border-border bg-card px-3.5 text-body-sm font-semibold text-foreground hover:bg-muted")}
    >
      <LockKeyhole className="size-5" aria-hidden /> <span>
        Corte<span className="max-2xl:sr-only"> de caja</span>
      </span>
    </button>
  );
}

/**
 * Corte de caja guiado, a ciegas: quien corta declara lo que cuenta sin ver
 * lo esperado (el precheck no lo trae y esta pantalla nunca lo pide). El
 * resultado (exacto, faltante, sobrante) se ve recién en el detalle del
 * corte, y solo quien tiene permiso.
 */
export function CashCutWizard({
  open,
  onOpenChange,
  cashSessionId,
  registerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashSessionId: string;
  registerName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[94dvh] sm:max-w-4xl sm:rounded-card">
        {open && <WizardBody cashSessionId={cashSessionId} registerName={registerName} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function WizardBody({ cashSessionId, registerName, onClose }: { cashSessionId: string; registerName: string; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("cash");
  const [precheck, setPrecheck] = useState<CashCutPrecheck | null>(null);
  const [precheckError, setPrecheckError] = useState<string | null>(null);
  const [mode, setMode] = useState<"count" | "total">("count");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [cashText, setCashText] = useState("");
  const [card, setCard] = useState("");
  const [transfer, setTransfer] = useState("");
  const [floatText, setFloatText] = useState("");
  const [notes, setNotes] = useState("");
  const [skip, setSkip] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCashCutPrecheck(cashSessionId).then((r) => {
      if (!alive) return;
      if (r.ok) setPrecheck(r.data);
      else setPrecheckError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [cashSessionId]);

  const counted = useMemo(() => (mode === "count" ? denominationTotal(qty) : keypadToNumber(cashText)), [mode, qty, cashText]);
  const hasCashInput = mode === "count" ? Object.values(qty).some((q) => q > 0) : cashText !== "";
  const cardN = card.trim() === "" ? undefined : Number(card.replace(",", "."));
  const transferN = transfer.trim() === "" ? undefined : Number(transfer.replace(",", "."));
  const floatLeft = keypadToNumber(floatText);
  const floatTooBig = floatLeft > counted;
  const withdraw = cashToWithdraw(counted, floatLeft);
  const pendingCount = precheck?.pending_count ?? 0;
  const badNumber = [cardN, transferN].some((n) => n !== undefined && (!Number.isFinite(n) || n < 0));

  async function save() {
    if (pending) return;
    setPending(true);
    setError(null);
    const r = await cashCut({
      cashSessionId,
      counts: {
        CASH: counted,
        ...(precheck?.has_card_payments && cardN !== undefined ? { CARD: cardN } : {}),
        ...(precheck?.has_transfer_payments && transferN !== undefined ? { TRANSFER: transferN } : {}),
      },
      cashFloatLeft: floatLeft,
      notes: notes.trim() || undefined,
      skipPendingOrders: skip,
    });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      notify.error(r.error);
      if (r.code === "PENDING_ORDERS") {
        const fresh = await getCashCutPrecheck(cashSessionId);
        if (fresh.ok) setPrecheck(fresh.data);
        setStep("pending");
      }
      return;
    }
    notify.success("Corte guardado");
    onClose();
    router.push(`/cash/cortes/${cashSessionId}`);
    router.refresh();
  }

  let primary: { label: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "neutral" | "money-out" } = {
    label: "Continuar",
    onClick: () => {},
  };
  if (step === "cash") primary = { label: <>Contado: <span className="tabular-nums">{formatPrice(counted)}</span> · seguir</>, onClick: () => setStep("other"), disabled: !hasCashInput };
  if (step === "other") primary = { label: "Continuar", onClick: () => setStep("pending"), disabled: badNumber };
  if (step === "pending")
    primary = {
      label: pendingCount > 0 ? (skip ? "Omitir y continuar" : "Marca la opción para seguir") : "Continuar",
      onClick: () => setStep("confirm"),
      disabled: !precheck || (pendingCount > 0 && !skip),
    };
  if (step === "confirm") primary = { label: "Guardar corte y cerrar caja", onClick: save, disabled: floatTooBig || !hasCashInput, tone: "neutral" };

  const back: Record<Step, Step | null> = { cash: null, other: "cash", pending: "other", confirm: "pending" };

  return (
    <>
      <DialogHeader className="border-b border-border px-4 pt-4 pb-3 text-left md:px-6">
        <DialogTitle className="flex items-center gap-2 text-title-sm">
          <LockKeyhole className="size-5" aria-hidden /> <span>
        Corte<span className="max-2xl:sr-only"> de caja</span>
      </span> · {registerName}
        </DialogTitle>
        <DialogDescription className="flex items-center gap-1.5">
          <ShieldCheck className="size-4 shrink-0" aria-hidden /> Es a ciegas: cuenta lo que hay sin mirar el sistema. Al guardar verás cómo salió.
        </DialogDescription>
        <StepIndicator className="mt-2" steps={STEPS} current={step} onStepClick={(id) => setStep(id as Step)} />
      </DialogHeader>

      <div key={step} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 animate-pos-step motion-reduce:animate-none md:px-6">
        {precheckError && (
          <p role="alert" className="mb-3 rounded-control bg-money-out-soft px-3 py-2 text-body-sm text-money-out-soft-foreground">
            {precheckError}
          </p>
        )}

        {step === "cash" && (
          <div className="flex flex-col gap-4">
            <div role="radiogroup" aria-label="Cómo contar" className="grid grid-cols-2 gap-2 sm:w-fit">
              {(
                [
                  ["count", "Contar billetes y monedas"],
                  ["total", "Escribir el total"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => {
                    if (m === "total" && mode === "count" && counted > 0) setCashText(numberToKeypad(counted));
                    setMode(m);
                  }}
                  className={cn(
                    posPressable,
                    "min-h-12 rounded-button border-2 px-4 text-body-sm font-semibold",
                    mode === m ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "count" ? (
              <div className="grid gap-5 md:grid-cols-2">
                {(["bill", "coin"] as const).map((kind) => (
                  <fieldset key={kind} className="flex flex-col gap-2">
                    <legend className="mb-1 flex items-center gap-1.5 text-body-sm font-semibold text-muted-foreground">
                      <Coins className="size-4" aria-hidden /> {kind === "bill" ? "Billetes" : "Monedas"}
                    </legend>
                    {CASH_DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
                      const q = qty[d.id] ?? 0;
                      const set = (n: number) => setQty((s) => ({ ...s, [d.id]: Math.max(0, Math.min(9999, n)) }));
                      return (
                        <div key={d.id} className="grid grid-cols-[4rem_auto_1fr] items-center gap-3 rounded-control bg-card px-3 py-1.5">
                          <span className="text-body font-semibold tabular-nums text-foreground">{d.label}</span>
                          <div className="flex items-center gap-1">
                            <button type="button" aria-label={`Uno menos de ${d.label}`} disabled={q === 0} onClick={() => set(q - 1)} className={cn(posPressable, "flex size-11 items-center justify-center rounded-full bg-secondary")}>
                              <Minus className="size-4" aria-hidden />
                            </button>
                            <Input
                              aria-label={`Cantidad de ${kind === "bill" ? "billetes" : "monedas"} de ${d.label}`}
                              inputMode="numeric"
                              value={q === 0 ? "" : String(q)}
                              placeholder="0"
                              onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || 0)}
                              onFocus={(e) => e.currentTarget.select()}
                              className="h-11 w-16 text-center text-body tabular-nums"
                            />
                            <button type="button" aria-label={`Uno más de ${d.label}`} onClick={() => set(q + 1)} className={cn(posPressable, "flex size-11 items-center justify-center rounded-full bg-secondary")}>
                              <Plus className="size-4" aria-hidden />
                            </button>
                          </div>
                          <span className="text-right text-body-sm tabular-nums text-muted-foreground">{formatPrice((q * d.cents) / 100)}</span>
                        </div>
                      );
                    })}
                  </fieldset>
                ))}
              </div>
            ) : (
              <div className="max-w-sm">
                <AmountKeypad label="Efectivo contado" value={cashText} onChange={setCashText} />
              </div>
            )}
            <p aria-live="polite" className="flex items-baseline justify-between rounded-card border border-border bg-card px-4 py-3">
              <span className="text-body font-semibold text-foreground">Total en efectivo</span>
              <span className="font-display text-[2rem] font-semibold leading-none tabular-nums">{formatPrice(counted)}</span>
            </p>
          </div>
        )}

        {step === "other" && (
          <div className="flex max-w-lg flex-col gap-4">
            {!precheck && <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Revisando el turno" />}
            {precheck && !precheck.has_card_payments && !precheck.has_transfer_payments && (
              <p className="flex items-start gap-2 rounded-card border border-info-border bg-info-soft px-4 py-3 text-body-sm text-info-soft-foreground">
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                En este turno solo se cobró en efectivo: no hay nada más que contar.
              </p>
            )}
            {precheck?.has_card_payments && (
              <AmountField id="cut-card" label="Total en tarjeta" help="Suma los comprobantes del datáfono (vouchers)." value={card} onChange={setCard} />
            )}
            {precheck?.has_transfer_payments && (
              <AmountField id="cut-transfer" label="Total en transferencias" help="Suma lo que llegó a la cuenta en este turno." value={transfer} onChange={setTransfer} />
            )}
            {badNumber && <p role="alert" className="text-body-sm text-money-out-soft-foreground">Escribe montos válidos.</p>}
          </div>
        )}

        {step === "pending" && (
          <div className="flex max-w-2xl flex-col gap-4">
            {!precheck && <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Revisando pedidos" />}
            {precheck && pendingCount === 0 && (
              <p className="flex items-start gap-2 rounded-card border border-money-in-border bg-money-in-soft px-4 py-3 text-body text-money-in-soft-foreground">
                <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden /> Todo está cobrado. Puedes seguir.
              </p>
            )}
            {precheck && pendingCount > 0 && (
              <>
                <div role="alert" className="flex gap-3 rounded-card border-2 border-attention-border bg-attention-soft p-4">
                  <AlertTriangle className="mt-0.5 size-6 shrink-0 text-attention-soft-foreground" aria-hidden />
                  <div className="text-body-sm">
                    <p className="text-body font-semibold text-foreground">
                      {pendingCount === 1 ? "Falta cobrar 1 pedido" : `Faltan cobrar ${pendingCount} pedidos`}
                    </p>
                    <p className="mt-1 text-muted-foreground">Folios {formatFolios(precheck.pending_folios)}.</p>
                    <p className="mt-2 text-foreground">Lo mejor es cobrarlos antes de cerrar.</p>
                    <button
                      type="button"
                      onClick={onClose}
                      className={cn(posPressable, "mt-3 flex min-h-12 items-center rounded-button border-2 border-border bg-card px-4 text-body-sm font-semibold")}
                    >
                      Volver y cobrarlos
                    </button>
                  </div>
                </div>
                <label htmlFor="cut-skip" className="flex min-h-14 cursor-pointer items-start gap-3 rounded-card border-2 border-border bg-card p-4">
                  <input id="cut-skip" type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="mt-1 size-5 accent-[var(--money-out)]" />
                  <span>
                    <span className="block text-body font-semibold text-foreground">Omitir y cerrar igual</span>
                    <span className="block text-body-sm text-muted-foreground">
                      Esos pedidos no se borran ni se dan por cobrados: quedan anotados en este corte como pendientes para que se revisen. Esto no se puede deshacer.
                    </span>
                  </span>
                </label>
              </>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="flex flex-col gap-4">
              <dl className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 text-body">
                <p className="mb-1 text-body-sm font-semibold text-muted-foreground">Lo que declaras</p>
                <SummaryRow label="Efectivo contado" value={formatPrice(counted)} />
                {precheck?.has_card_payments && <SummaryRow label="Tarjeta" value={cardN === undefined ? "Sin declarar" : formatPrice(cardN)} />}
                {precheck?.has_transfer_payments && <SummaryRow label="Transferencias" value={transferN === undefined ? "Sin declarar" : formatPrice(transferN)} />}
                {skip && pendingCount > 0 && <SummaryRow label="Pedidos omitidos" value={formatFolios(precheck?.pending_folios ?? [])} />}
              </dl>
              <div>
                <Label htmlFor="cut-notes" className="mb-1.5 block text-body-sm font-semibold">
                  Nota (opcional)
                </Label>
                <Textarea id="cut-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-card border-2 border-money-out-border bg-money-out-soft px-4 py-3">
                <span className="text-body font-semibold text-money-out-soft-foreground">Sacar de la caja</span>
                <span className="font-display text-[2rem] font-semibold leading-none tabular-nums text-money-out-soft-foreground">{formatPrice(withdraw)}</span>
              </div>
              {error && (
                <p role="alert" className="text-body-sm text-money-out-soft-foreground">
                  {error}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <AmountKeypad label="Fondo que queda" value={floatText} onChange={setFloatText} />
              <p className="text-meta text-muted-foreground">El efectivo que dejas para el siguiente turno. El resto se saca.</p>
              {floatTooBig && <p role="alert" className="text-meta font-medium text-money-out-soft-foreground">El fondo no puede ser mayor que lo contado.</p>}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <button
          type="button"
          onClick={() => (back[step] ? setStep(back[step] as Step) : onClose())}
          className={cn(posPressable, "min-h-14 rounded-button border border-border bg-card px-5 text-body font-semibold hover:bg-muted")}
        >
          {back[step] ? "Atrás" : "Cancelar"}
        </button>
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled || pending}
          className={cn(posPressable, "flex min-h-14 flex-1 items-center justify-center gap-2 rounded-button px-5 text-lead font-semibold shadow-md", toneSolid[primary.tone ?? "neutral"])}
        >
          {pending && <Loader2 className="size-5 animate-spin" aria-hidden />}
          {primary.label}
        </button>
      </div>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function AmountField({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-body font-semibold">
        {label}
      </Label>
      <Input id={id} inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => onChange(e.target.value)} className="h-14 text-title tabular-nums" />
      <p className="mt-1 text-meta text-muted-foreground">{help}</p>
    </div>
  );
}
