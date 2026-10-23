"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { posPressable } from "./pos-tone";

/**
 * Ficha de motivo de un movimiento de dinero. La dirección manda el color:
 * `in` verde (entra), `out` rojo (sale). Seleccionada se rellena del tono y
 * lleva el texto del motivo, nunca solo el color.
 */
export function MoneyFlowChip({
  direction,
  icon: Icon,
  label,
  hint,
  selected,
  onSelect,
}: {
  direction: "in" | "out";
  icon: LucideIcon;
  label: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        posPressable,
        "flex min-h-14 w-full items-center gap-3 rounded-card border-2 px-3 py-2 text-left",
        selected
          ? direction === "in"
            ? "border-money-in bg-money-in text-money-in-foreground"
            : "border-money-out bg-money-out text-money-out-foreground"
          : direction === "in"
            ? "border-money-in-border bg-money-in-soft text-money-in-soft-foreground hover:border-money-in"
            : "border-money-out-border bg-money-out-soft text-money-out-soft-foreground hover:border-money-out"
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-body-sm font-semibold">{label}</span>
        {hint && <span className={cn("text-caption", selected ? "opacity-90" : "text-muted-foreground")}>{hint}</span>}
      </span>
    </button>
  );
}
