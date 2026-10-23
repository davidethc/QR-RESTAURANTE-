"use client";

import { useEffect, useState } from "react";
import { ChevronRight, CircleCheck, Clock } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { formatElapsed, minutesOpen, placeKind, queueStatus, sortQueue } from "@/lib/bill-queue";
import { toneBar, toneSoft } from "@/components/shared/pos-tone";
import type { OpenBillSummary } from "@/types/billing";
import { PlaceIcon } from "./place-icon";

/** Reloj de minuto: los "12 min" de las tarjetas avanzan sin recargar. */
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * "Por cobrar": todas las cuentas vivas como tarjetas. Lugar con su icono
 * (mesa, para llevar, domicilio), tiempo abierta, saldo y estado (color +
 * icono + texto). Un toque la selecciona; la seleccionada queda marcada.
 */
export function BillQueue({
  bills,
  selectedId,
  onSelect,
  empty,
}: {
  bills: OpenBillSummary[];
  selectedId: string | null;
  onSelect: (bill: OpenBillSummary) => void;
  empty: React.ReactNode;
}) {
  const now = useNow();
  if (bills.length === 0) return <>{empty}</>;
  const sorted = sortQueue(bills);

  return (
    <ul aria-label="Cuentas por cobrar" className="flex flex-col gap-2">
      {sorted.map((bill) => {
        const status = queueStatus(bill);
        const kind = placeKind(bill);
        const selected = bill.table_session_id === selectedId;
        const minutes = minutesOpen(bill.opened_at, now);
        return (
          <li key={bill.table_session_id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(bill)}
              className={cn(
                "group relative flex w-full items-center gap-3 overflow-hidden rounded-card border-2 bg-card py-3 pr-3 pl-4 text-left",
                "touch-manipulation transition-[transform,border-color,box-shadow] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none",
                selected ? "border-foreground shadow-md" : "border-transparent shadow-sm hover:border-border"
              )}
            >
              <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", toneBar[status.tone])} />
              <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-secondary text-foreground">
                <PlaceIcon kind={kind} className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-body font-semibold leading-tight text-foreground">{bill.place_label}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft[status.tone])}>
                    {status.tone === "money-in" ? <CircleCheck className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
                    {status.label}
                  </span>
                  <span suppressHydrationWarning className="text-caption tabular-nums text-muted-foreground">{formatElapsed(minutes)}</span>
                  {bill.active_orders > 0 && (
                    <span className="text-caption text-muted-foreground">
                      · {bill.active_orders} en cocina
                    </span>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-lead font-semibold tabular-nums text-foreground">{formatPrice(status.tone === "money-in" ? bill.total : bill.balance)}</span>
                {bill.paid_total > 0 && status.tone !== "money-in" && (
                  <span className="text-caption tabular-nums text-muted-foreground">de {formatPrice(bill.total)}</span>
                )}
              </span>
              <ChevronRight className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-150", selected && "translate-x-0.5 text-foreground")} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
