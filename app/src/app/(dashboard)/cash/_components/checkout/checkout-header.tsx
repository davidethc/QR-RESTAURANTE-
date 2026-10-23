import { CircleCheck, Clock, X } from "lucide-react";
import { PersonChips } from "@/components/shared/person-chips";
import { cn, formatPrice } from "@/lib/utils";
import { placeKind } from "@/lib/bill-queue";
import type { SplitProgress } from "@/lib/split-progress";
import type { Bill } from "@/types/billing";
import { PlaceIcon } from "../place-icon";

/**
 * Cabecera fija del cobro: dónde es, cuánto falta y quién ya pagó. Es lo
 * único que no cambia entre pasos, para que el saldo nunca se pierda.
 */
export function CheckoutHeader({
  bill,
  placeName,
  progress,
  onClose,
}: {
  bill: Bill;
  placeName: string;
  progress: SplitProgress | null;
  onClose?: () => void;
}) {
  const settled = bill.balance <= 0 && bill.total > 0;
  const partial = !settled && bill.paid_total > 0;
  const paidPct = bill.total > 0 ? Math.min(100, Math.round((bill.paid_total / bill.total) * 100)) : 0;

  return (
    <header className="flex flex-col gap-3 border-b border-border bg-card px-4 pt-4 pb-3 md:px-6">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-control border",
            settled ? "border-transparent bg-money-in text-money-in-foreground" : "border-border bg-secondary text-foreground"
          )}
        >
          <PlaceIcon kind={placeKind(bill)} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title-sm font-semibold leading-tight text-foreground">{placeName}</h2>
          <p className="text-meta text-muted-foreground">
            Cuenta #{bill.bill_number}
            {bill.status === "VOID" && " · Anulada"}
          </p>
        </div>
        <div
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-card border px-3.5 py-2 text-right transition-[background-color,border-color] duration-200 motion-reduce:transition-none",
            settled ? "border-money-in-border bg-money-in-soft" : "border-attention-border bg-attention-soft"
          )}
        >
          {settled && <CircleCheck className="size-7 shrink-0 text-money-in-soft-foreground" aria-hidden />}
          <div>
            <p
              className={cn(
                "text-caption font-semibold",
                settled ? "text-money-in-soft-foreground" : "text-attention-soft-foreground"
              )}
            >
              {settled ? "Pagado" : partial ? "Pendiente" : "Falta cobrar"}
            </p>
            <p
              className={cn(
                "font-display text-[1.75rem] font-semibold leading-none tabular-nums tracking-tight",
                settled ? "text-money-in-soft-foreground" : "text-foreground"
              )}
            >
              {formatPrice(settled ? bill.total : bill.balance)}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar cobro"
            className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
      </div>

      {bill.total > 0 && bill.paid_total > 0 && (
        <div className="flex flex-col gap-1">
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className="h-full rounded-full bg-money-in transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
            {settled ? (
              <CircleCheck className="size-4 text-money-in-soft-foreground" aria-hidden />
            ) : (
              <Clock className="size-4 text-attention-soft-foreground" aria-hidden />
            )}
            Pagado <span className="font-semibold tabular-nums text-foreground">{formatPrice(bill.paid_total)}</span> de{" "}
            <span className="tabular-nums">{formatPrice(bill.total)}</span>
          </p>
        </div>
      )}

      {progress && progress.persons.length > 0 && <PersonChips persons={progress.persons} />}
    </header>
  );
}
