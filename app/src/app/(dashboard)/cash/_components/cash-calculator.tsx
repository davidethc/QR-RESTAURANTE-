"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CASH_DENOMINATIONS, denominationTotal } from "@/lib/cash-cut";
import { formatPrice } from "@/lib/utils";

/** Calculadora de billetes y monedas: cantidad x valor, total y "Usar total". */
export function CashCalculator({ onApply }: { onApply: (total: number) => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});

  const numeric: Record<string, number | undefined> = {};
  for (const [id, v] of Object.entries(qty)) numeric[id] = v === "" ? undefined : Number(v);
  const total = denominationTotal(numeric);

  function group(kind: "bill" | "coin", title: string) {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-meta font-medium text-muted-foreground">{title}</legend>
        {CASH_DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
          const q = numeric[d.id] ?? 0;
          return (
            <div key={d.id} className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-2">
              <label htmlFor={`den-${d.id}`} className="text-body-sm font-semibold tabular-nums text-foreground">
                {d.label}
              </label>
              <Input
                id={`den-${d.id}`}
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                aria-label={`Cantidad de ${kind === "bill" ? "billetes" : "monedas"} de ${d.label}`}
                className="h-11 text-center text-body tabular-nums"
                value={qty[d.id] ?? ""}
                onChange={(e) => setQty((s) => ({ ...s, [d.id]: e.target.value }))}
                onFocus={(e) => e.currentTarget.select()}
              />
              <span className="text-right text-body-sm tabular-nums text-muted-foreground">
                {formatPrice((Math.floor(q) * d.cents) / 100)}
              </span>
            </div>
          );
        })}
      </fieldset>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-12 shrink-0 gap-2">
          <Calculator className="size-4" aria-hidden /> Contar billetes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Calculadora de efectivo</DialogTitle>
          <DialogDescription>Anota cuántos billetes y monedas hay de cada valor.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {group("bill", "Billetes")}
          {group("coin", "Monedas")}
        </div>
        <div className="flex items-center justify-between rounded-control bg-secondary px-4 py-3">
          <span className="text-body-sm font-medium text-foreground">Total</span>
          <span className="font-display text-title font-semibold tabular-nums text-wine" aria-live="polite">
            {formatPrice(total)}
          </span>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => setQty({})}>
            Limpiar
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={() => {
              onApply(total);
              setOpen(false);
            }}
          >
            Usar total
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
