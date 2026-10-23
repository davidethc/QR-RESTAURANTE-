"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleMinus,
  CirclePlus,
  HandCoins,
  Landmark,
  Loader2,
  PiggyBank,
  Receipt,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AmountKeypad } from "@/components/shared/amount-keypad";
import { MoneyFlowChip } from "@/components/shared/money-flow-chip";
import { posPressable, toneSolid } from "@/components/shared/pos-tone";
import { addCashMovement } from "@/lib/actions/cash";
import { CASH_REASONS, movementBlockReason, movementType, type CashDirection, type CashReasonOption } from "@/lib/cash-movement-reasons";
import { keypadToNumber } from "@/lib/keypad";
import { notify } from "@/lib/notifications";
import { newRequestId } from "@/lib/request-id";
import { cn, formatPrice } from "@/lib/utils";

const ICONS: Record<CashReasonOption["icon"], LucideIcon> = {
  PiggyBank,
  CirclePlus,
  Receipt,
  Truck,
  HandCoins,
  Landmark,
  Undo2,
  CircleMinus,
};

const COPY = {
  IN: {
    title: "Meter dinero a la caja",
    description: "El efectivo entra al cajón y suma al próximo corte.",
    action: "Meter",
    icon: ArrowDownToLine,
  },
  OUT: {
    title: "Sacar dinero de la caja",
    description: "El efectivo sale del cajón y se descuenta del próximo corte.",
    action: "Sacar",
    icon: ArrowUpFromLine,
  },
} as const;

/** Botón de entrada a "Meter" o "Sacar" dinero (franja de estado). */
export function CashFlowButton({
  direction,
  onClick,
  disabled,
}: {
  direction: CashDirection;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = COPY[direction].icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        posPressable,
        "flex min-h-12 items-center gap-2 rounded-button border px-3.5 text-body-sm font-semibold",
        direction === "IN"
          ? "border-money-in-border bg-money-in-soft text-money-in-soft-foreground hover:border-money-in"
          : "border-money-out-border bg-money-out-soft text-money-out-soft-foreground hover:border-money-out"
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span>
        {direction === "IN" ? "Meter" : "Sacar"}
        <span className="max-2xl:sr-only"> dinero</span>
      </span>
    </button>
  );
}

/**
 * Meter o sacar dinero (add_cash_movement, sin cambios de contrato). Cada
 * dirección es su propia pantalla con SOLO sus motivos como fichas, un
 * teclado de monto y una nota. La clave de idempotencia se crea al abrir y
 * se conserva en los reintentos del mismo movimiento.
 */
export function CashFlowDialog({
  direction,
  cashSessionId,
  registerName,
  onOpenChange,
}: {
  direction: CashDirection | null;
  cashSessionId: string;
  registerName: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={direction !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
        {direction && (
          <CashFlowBody
            key={direction}
            direction={direction}
            cashSessionId={cashSessionId}
            registerName={registerName}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CashFlowBody({
  direction,
  cashSessionId,
  registerName,
  onDone,
}: {
  direction: CashDirection;
  cashSessionId: string;
  registerName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const options = CASH_REASONS[direction];
  const [option, setOption] = useState<CashReasonOption | null>(options.length === 1 ? options[0] : null);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [key] = useState(() => newRequestId());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = keypadToNumber(amountText);
  const block = movementBlockReason(option, amount, note);
  const copy = COPY[direction];
  const tone = direction === "IN" ? "money-in" : "money-out";

  async function submit() {
    if (block || !option || pending) return;
    setPending(true);
    setError(null);
    const r = await addCashMovement({
      cashSessionId,
      type: movementType(direction),
      reason: option.reason,
      amount,
      description: note.trim() || undefined,
      idempotencyKey: key,
    });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      notify.error(r.error);
      return;
    }
    notify.success(
      r.data.replayed
        ? "Ese movimiento ya estaba registrado"
        : `${direction === "IN" ? "Entraron" : "Salieron"} ${formatPrice(amount)} · ${option.label}`
    );
    onDone();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-title-sm">
          <span className={cn("flex size-10 items-center justify-center rounded-full", toneSolid[tone])}>
            <copy.icon className="size-5" aria-hidden />
          </span>
          {copy.title}
        </DialogTitle>
        <DialogDescription>
          {registerName}. {copy.description}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-body font-semibold text-foreground">¿Para qué es?</legend>
            <div role="radiogroup" aria-label="Motivo" className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => (
                <MoneyFlowChip
                  key={o.reason}
                  direction={direction === "IN" ? "in" : "out"}
                  icon={ICONS[o.icon]}
                  label={o.label}
                  hint={o.hint}
                  selected={option?.reason === o.reason}
                  onSelect={() => setOption(o)}
                />
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="flow-note" className="mb-1.5 block text-body-sm font-semibold">
              Nota{option?.requiresNote ? "" : " (opcional)"}
            </Label>
            <Textarea
              id="flow-note"
              rows={2}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={direction === "IN" ? "Ej: sencillo del banco" : "Ej: hielo y servilletas"}
            />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <AmountKeypad label="Monto" value={amountText} onChange={setAmountText} tone={tone} quick={[1, 5, 10, 20].map((v) => ({ label: `$${v}`, value: v }))} />
          {(block || error) && (
            <p role="status" className={cn("text-meta font-medium", error ? "text-money-out-soft-foreground" : "text-muted-foreground")}>
              {error ?? block}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!!block || pending}
            className={cn(posPressable, "flex min-h-14 items-center justify-center gap-2 rounded-button text-lead font-semibold shadow-md", toneSolid[tone])}
          >
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <copy.icon className="size-5" aria-hidden />}
            {copy.action} <span className="tabular-nums">{formatPrice(amount)}</span>
          </button>
        </div>
      </div>
    </>
  );
}
