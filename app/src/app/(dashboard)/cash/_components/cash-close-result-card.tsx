"use client";

import { X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CashDifferenceSummary } from "./cash-difference-summary";
import { formatPrice } from "@/lib/utils";
import type { CashSessionSummary } from "@/types/billing";

/**
 * Tarjeta persistente tras cerrar caja (bug P1 de QA 2026-09-26: antes solo
 * había un toast de 5s y el dueño/admin se perdía el resultado si no
 * estaba mirando la pantalla en ese instante exacto). Se queda visible
 * hasta que el dueño/admin la cierra a mano con el botón X — nunca
 * desaparece sola.
 */
export function CashCloseResultCard({
  result,
  onDismiss,
}: {
  result: CashSessionSummary;
  onDismiss: () => void;
}) {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-card p-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        aria-label="Cerrar resultado del cierre"
        className="absolute top-2 right-2 size-11 rounded-full"
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 pr-12">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        <p className="font-display text-[16px] font-semibold text-foreground">
          Caja cerrada · {result.register_name ?? "Caja"}
        </p>
      </div>
      {result.opening_float !== undefined && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          Fondo inicial {formatPrice(result.opening_float)}
        </p>
      )}

      <div className="mt-3">
        <CashDifferenceSummary differenceTotal={result.difference_total} byMethod={result.by_method} />
      </div>
    </div>
  );
}
