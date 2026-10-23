"use client";

import { useEffect } from "react";
import { Delete } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { formatKeypad, keyFromKeyboard, keypadToNumber, pressKey, type KeypadKey } from "@/lib/keypad";
import { posPressable, toneText, type PosTone } from "./pos-tone";

const KEYS: KeypadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

/**
 * Teclado de montos del POS. El valor es texto controlado (ver lib/keypad):
 * quien lo usa guarda el string y lo convierte con `keypadToNumber`. Acepta
 * el teclado físico mientras `captureKeyboard` esté activo (se apaga solo si
 * el foco está en un campo de texto). Los atajos (`quick`) son montos que
 * reemplazan lo escrito: billetes, "exacto", el saldo.
 */
export function AmountKeypad({
  label,
  value,
  onChange,
  quick,
  tone = "neutral",
  captureKeyboard = true,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  quick?: { label: string; value: number }[];
  tone?: PosTone;
  captureKeyboard?: boolean;
  hint?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!captureKeyboard) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keyFromKeyboard(e.key);
      if (!k) return;
      e.preventDefault();
      onChange(pressKey(value, k));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captureKeyboard, value, onChange]);

  const amount = keypadToNumber(value);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3 rounded-card border border-border bg-card px-4 py-3">
        <span className="text-body-sm font-medium text-muted-foreground">{label}</span>
        <output
          aria-live="polite"
          aria-label={`${label}: ${formatPrice(amount)}`}
          className={cn(
            "font-display text-[2.5rem] font-semibold leading-none tabular-nums tracking-tight",
            value === "" ? "text-muted-foreground/50" : toneText[tone]
          )}
        >
          {value === "" ? formatPrice(0) : formatKeypad(value)}
        </output>
      </div>
      {hint}
      {quick && quick.length > 0 && (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Montos rápidos">
          {quick.map((q) => {
            const active = amount > 0 && Math.abs(amount - q.value) < 0.005;
            return (
              <button
                key={q.label}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(String(q.value))}
                className={cn(
                  posPressable,
                  "min-h-12 rounded-control border px-1 text-body-sm font-semibold tabular-nums",
                  active ? "border-foreground bg-foreground text-background" : "border-border bg-secondary text-foreground hover:bg-muted"
                )}
              >
                {q.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Teclado numérico">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(pressKey(value, k))}
            onDoubleClick={k === "back" ? () => onChange("") : undefined}
            aria-label={k === "back" ? "Borrar (doble toque: borrar todo)" : k === "." ? "Punto decimal" : k}
            className={cn(
              posPressable,
              "flex min-h-14 items-center justify-center rounded-control bg-secondary text-title font-semibold tabular-nums text-foreground hover:bg-muted"
            )}
          >
            {k === "back" ? <Delete className="size-6" aria-hidden /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
