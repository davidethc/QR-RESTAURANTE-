"use client";

import { useEffect, useState } from "react";
import { ChefHat, CircleCheck, Clock } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { formatElapsed, minutesOpen, placeKind, queueStatus, sortQueue } from "@/lib/bill-queue";
import { toneSoft } from "@/components/shared/pos-tone";
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

/** Fondo y borde de la tarjeta elegida, según su estado. */
const SELECTED = {
  attention: "border-attention-border bg-attention-soft shadow-md",
  "money-in": "border-money-in-border bg-money-in-soft shadow-md",
  info: "border-info-border bg-info-soft shadow-md",
} as const;

const RAIL = {
  attention: "bg-attention",
  "money-in": "bg-money-in",
  info: "bg-info",
} as const;

/**
 * Cuentas vivas en dos grupos: "Por cobrar" (con saldo) y "Pagadas · por
 * entregar" (sin saldo, esperando cocina). Cada tarjeta: lugar con su icono,
 * estado (color + icono + texto), tiempo abierta, lo que sigue en cocina y
 * el monto. Un toque la selecciona; la elegida toma el color de su estado.
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
  const owed = sorted.filter((b) => queueStatus(b).tone !== "money-in");
  const paid = sorted.filter((b) => queueStatus(b).tone === "money-in");

  const card = (bill: OpenBillSummary) => {
    const status = queueStatus(bill);
    const kind = placeKind(bill);
    const selected = bill.table_session_id === selectedId;
    const minutes = minutesOpen(bill.opened_at, now);
    const isPaid = status.tone === "money-in";
    return (
      <li key={bill.table_session_id}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => onSelect(bill)}
          className={cn(
            "group relative flex w-full items-center gap-2.5 overflow-hidden rounded-card border bg-card py-3 pr-3 pl-3.5 text-left",
            "touch-manipulation transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:active:scale-100",
            selected ? SELECTED[status.tone] : "border-border hover:border-border-strong hover:shadow-sm"
          )}
        >
          <span
            aria-hidden
            className={cn("absolute inset-y-0 left-0 w-1 transition-opacity duration-150", RAIL[status.tone], selected ? "opacity-100" : "opacity-0")}
          />
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-control border",
              selected ? "border-transparent bg-card text-foreground" : "border-border bg-secondary text-foreground"
            )}
          >
            <PlaceIcon kind={kind} className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-body font-semibold leading-tight text-foreground">{bill.place_label}</span>
            <span className={cn("inline-flex w-fit max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-caption leading-tight font-semibold", toneSoft[status.tone])}>
              {isPaid ? <CircleCheck className="size-3.5 shrink-0" aria-hidden /> : <Clock className="size-3.5 shrink-0" aria-hidden />}
              <span>{status.label}</span>
            </span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
              <span suppressHydrationWarning className="tabular-nums">{formatElapsed(minutes)}</span>
              {bill.active_orders > 0 && (
                <span className="inline-flex items-center gap-1">
                  · <ChefHat className="size-3.5" aria-hidden /> {bill.active_orders} en cocina
                </span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-lead font-semibold leading-tight tabular-nums text-foreground">
              {formatPrice(isPaid ? bill.total : bill.balance)}
            </span>
            {bill.paid_total > 0 && !isPaid && (
              <span className="text-caption tabular-nums text-money-in-soft-foreground">Pagado {formatPrice(bill.paid_total)}</span>
            )}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <QueueGroup id="queue-owed" title="Por cobrar" count={owed.length} tone="attention">
        {owed.length > 0 ? (
          <ul aria-labelledby="queue-owed" className="flex flex-col gap-2">
            {owed.map(card)}
          </ul>
        ) : (
          <p className="rounded-card border border-dashed border-border px-4 py-4 text-center text-meta text-muted-foreground">
            Nada por cobrar ahora.
          </p>
        )}
      </QueueGroup>
      {paid.length > 0 && (
        <QueueGroup id="queue-paid" title="Pagadas · por entregar" count={paid.length} tone="money-in">
          <ul aria-labelledby="queue-paid" className="flex flex-col gap-2">
            {paid.map(card)}
          </ul>
        </QueueGroup>
      )}
    </div>
  );
}

function QueueGroup({
  id,
  title,
  count,
  tone,
  children,
}: {
  id: string;
  title: string;
  count: number;
  tone: "attention" | "money-in";
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <h3 id={id} className="text-body-sm font-semibold text-foreground">
          {title}
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-caption font-semibold tabular-nums",
            count > 0 ? toneSoft[tone] : "bg-secondary text-muted-foreground"
          )}
        >
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}
