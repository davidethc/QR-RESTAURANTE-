"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { AmountKeypad } from "@/components/shared/amount-keypad";
import { posPressable, toneSolid } from "@/components/shared/pos-tone";
import { openCashSession } from "@/lib/actions/cash";
import { keypadToNumber, numberToKeypad } from "@/lib/keypad";
import { notify } from "@/lib/notifications";
import { cn, formatPrice } from "@/lib/utils";

export interface ClosedRegister {
  id: string;
  name: string;
  /** Fondo que dejó el último corte (null si no hay). */
  suggestedFloat: number | null;
}

/**
 * "Abrir caja": sin caja abierta no se puede cobrar ni vender, así que es lo
 * único que se muestra. Trae escrito el fondo que dejó el último corte para
 * que solo haya que revisarlo y tocar el botón verde.
 */
export function OpenCashGate({
  registers,
  onOpened,
  compact = false,
}: {
  registers: ClosedRegister[];
  onOpened?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [registerId, setRegisterId] = useState(registers[0]?.id ?? "");
  const register = registers.find((r) => r.id === registerId) ?? registers[0];
  const [floatText, setFloatText] = useState(() => numberToKeypad(register?.suggestedFloat));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = keypadToNumber(floatText);

  async function open() {
    if (!register || pending) return;
    setPending(true);
    setError(null);
    const r = await openCashSession({ registerId: register.id, openingFloat: amount });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      notify.error(r.error);
      return;
    }
    notify.success(`${r.data.register_name} abierta`);
    onOpened?.();
    router.refresh();
  }

  if (registers.length === 0) {
    return (
      <p className="rounded-card border border-attention-border bg-attention-soft p-4 text-body text-attention-soft-foreground">
        No tienes cajas asignadas. Pídele a un administrador que te asigne una.
      </p>
    );
  }

  return (
    <div className={cn("mx-auto flex w-full flex-col gap-5", compact ? "max-w-none" : "max-w-3xl rounded-card border border-border bg-card p-5 shadow-md md:p-8")}>
      {!compact && (
        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-attention-soft text-attention-soft-foreground">
            <KeyRound className="size-7" aria-hidden />
          </span>
          <div>
            <h2 className="text-title font-semibold text-foreground">La caja está cerrada</h2>
            <p className="text-body text-muted-foreground">Ábrela para empezar a cobrar y tomar pedidos. Cuenta el efectivo con el que arrancas.</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          {registers.length > 1 && (
            <fieldset>
              <legend className="mb-2 text-body font-semibold text-foreground">¿Qué caja?</legend>
              <div role="radiogroup" aria-label="Caja" className="grid gap-2 sm:grid-cols-2">
                {registers.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={r.id === registerId}
                    onClick={() => {
                      setRegisterId(r.id);
                      setFloatText(numberToKeypad(r.suggestedFloat));
                    }}
                    className={cn(
                      posPressable,
                      "min-h-14 rounded-card border-2 px-4 text-left text-body font-semibold",
                      r.id === registerId ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground"
                    )}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="rounded-card bg-secondary p-4 text-body-sm text-foreground">
            <p className="font-semibold">Fondo inicial</p>
            <p className="mt-1 text-muted-foreground">
              {register?.suggestedFloat !== null && register?.suggestedFloat !== undefined
                ? `El último corte dejó ${formatPrice(register.suggestedFloat)}. Cuenta y corrige si no coincide.`
                : "El efectivo que hay en el cajón para dar vuelto. Puede ser $0."}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-body-sm text-money-out-soft-foreground">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <AmountKeypad label="Fondo inicial" value={floatText} onChange={setFloatText} tone="money-in" />
          <button
            type="button"
            onClick={open}
            disabled={pending || !register}
            className={cn(posPressable, "flex min-h-14 items-center justify-center gap-2 rounded-button text-lead font-semibold shadow-md", toneSolid["money-in"])}
          >
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden />}
            Abrir {register?.name ?? "caja"} · <span className="tabular-nums">{formatPrice(amount)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
