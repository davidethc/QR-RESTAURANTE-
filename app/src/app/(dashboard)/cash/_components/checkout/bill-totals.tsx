import { X } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import type { Bill } from "@/types/billing";

/**
 * Totales de la cuenta, tal como los devuelve la RPC: subtotal, descuentos,
 * total, lo ya pagado y el saldo. El saldo va resaltado: verde cuando ya no
 * falta nada, ámbar mientras falte.
 */
export function BillTotals({
  bill,
  onRemoveDiscount,
  removePending,
}: {
  bill: Bill;
  /** Solo si se puede quitar un descuento aquí (OWNER/ADMIN, cuenta abierta). */
  onRemoveDiscount?: (discountId: string) => void;
  removePending?: boolean;
}) {
  const settled = bill.balance <= 0 && bill.total > 0;
  return (
    <dl className="flex flex-col gap-1.5 rounded-card border border-border bg-card p-4 text-body-sm">
      <Row label="Subtotal" value={formatPrice(bill.subtotal)} />
      {bill.discounts.map((d) => (
        <div key={d.id} className="flex min-h-6 items-center justify-between gap-2 text-money-out-soft-foreground">
          <dt className="min-w-0 truncate">
            Descuento {d.kind === "PERCENT" ? `${d.value}%` : ""} · {d.reason}
          </dt>
          <dd className="flex shrink-0 items-center gap-1 tabular-nums">
            −{formatPrice(d.amount)}
            {onRemoveDiscount && (
              <button
                type="button"
                disabled={removePending}
                onClick={() => onRemoveDiscount(d.id)}
                aria-label={`Quitar descuento: ${d.reason}`}
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-money-out-soft-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </dd>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
        <dt className="text-body font-semibold text-foreground">Total</dt>
        <dd className="text-lead font-semibold tabular-nums text-foreground">{formatPrice(bill.total)}</dd>
      </div>
      {bill.paid_total > 0 && <Row label="Ya pagado" value={`−${formatPrice(bill.paid_total)}`} accent />}
      {bill.tip_total > 0 && <Row label="Propinas (aparte)" value={formatPrice(bill.tip_total)} />}
      {bill.paid_total > 0 && (
        <div
          className={cn(
            "mt-1.5 flex items-center justify-between gap-3 rounded-control px-3 py-2.5",
            settled ? "bg-money-in-soft text-money-in-soft-foreground" : "bg-attention-soft text-attention-soft-foreground"
          )}
        >
          <dt className="text-body font-semibold">Saldo pendiente</dt>
          <dd className="text-lead font-semibold tabular-nums">{formatPrice(bill.balance)}</dd>
        </div>
      )}
    </dl>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", accent ? "text-money-in-soft-foreground" : "text-foreground")}>{value}</dd>
    </div>
  );
}
