"use client";

import Link from "next/link";
import { Info, Percent, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { TABLE_KIND } from "@/config/constants";
import type { Bill, BillPaymentContext } from "@/types/billing";
import { ChargeTicket } from "../charge-ticket";
import { ChargeProductPicker } from "../charge-product-picker";
import { DiscountDialog } from "../discount-dialog";
import { PaymentsBlock } from "../payments-block";
import { CancelCounterSaleDialog } from "../cancel-counter-sale-dialog";
import { StepFooter } from "./step-footer";

/** Paso 1 · Cuenta: qué se consumió, ajustes y cuánto falta. */
export function StepAccount({
  bill,
  context,
  canManage,
  blockedReason,
  closePending,
  removePending,
  onBillChange,
  onRemoveDiscount,
  onCloseBill,
  onNext,
}: {
  bill: Bill;
  context: BillPaymentContext | null;
  canManage: boolean;
  blockedReason: string | null;
  closePending: boolean;
  removePending: boolean;
  onBillChange: (bill: Bill) => void;
  onRemoveDiscount: (discountId: string) => void;
  onCloseBill: () => void;
  onNext: () => void;
}) {
  const open = bill.status === "OPEN";
  const editable = bill.status === "OPEN" || bill.status === "PAID";
  const cancelable = canManage && bill.table_kind === TABLE_KIND.COUNTER && bill.paid_total === 0 && open;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
        {blockedReason && (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-card border border-money-out-border bg-money-out-soft px-4 py-3 text-body-sm text-money-out-soft-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {blockedReason}
          </p>
        )}
        {bill.status === "PAID" && !bill.can_close && (
          <p className="mb-4 flex items-start gap-2 rounded-card border border-attention-border bg-attention-soft px-4 py-3 text-body-sm text-attention-soft-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Ya está pagada. Se cierra sola cuando salgan los pedidos que siguen en cocina.
          </p>
        )}

        <ChargeTicket bill={bill} remainingByItem={{}} selectedItems={{}} onToggleItem={() => {}} selectable={false} />

        <dl className="mt-4 flex flex-col gap-1.5 rounded-card bg-card p-4 text-body-sm">
          <Row label="Subtotal" value={formatPrice(bill.subtotal)} />
          {bill.discounts.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-money-out-soft-foreground">
              <dt className="min-w-0 truncate">
                Descuento {d.kind === "PERCENT" ? `${d.value}%` : ""} · {d.reason}
              </dt>
              <dd className="flex shrink-0 items-center gap-1 tabular-nums">
                −{formatPrice(d.amount)}
                {canManage && open && (
                  <button
                    type="button"
                    disabled={removePending}
                    onClick={() => onRemoveDiscount(d.id)}
                    aria-label={`Quitar descuento: ${d.reason}`}
                    className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-money-out-soft-foreground"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </dd>
            </div>
          ))}
          <Row label="Total" value={formatPrice(bill.total)} strong />
          {bill.paid_total > 0 && <Row label="Ya pagado" value={`−${formatPrice(bill.paid_total)}`} />}
          {bill.tip_total > 0 && <Row label="Propinas (aparte)" value={formatPrice(bill.tip_total)} />}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {editable && (
            <ChargeProductPicker billId={bill.id} onAdded={onBillChange} />
          )}
          {canManage && open && (
            <DiscountDialog
              billId={bill.id}
              onApplied={onBillChange}
              trigger={
                <Button variant="outline" className="h-12 px-4 text-body-sm font-semibold">
                  <Percent aria-hidden /> Descuento
                </Button>
              }
            />
          )}
          {open && (
            <Button asChild variant="outline" className="h-12 px-4 text-body-sm font-semibold">
              <Link href={`/cash/ticket/${bill.id}?print=1`} target="_blank" rel="noopener noreferrer">
                <Receipt aria-hidden /> Pre-cuenta
              </Link>
            </Button>
          )}
          {cancelable && <CancelCounterSaleDialog billId={bill.id} placeLabel={bill.place_label} />}
        </div>

        {bill.payments.length > 0 && (
          <div className="mt-6">
            <PaymentsBlock bill={bill} context={context} onBillChange={onBillChange} allowVoid={canManage} />
          </div>
        )}
      </div>

      {bill.can_close ? (
        <StepFooter primaryLabel="Cerrar cuenta y liberar" onPrimary={onCloseBill} pending={closePending} needsNetwork />
      ) : open && !blockedReason && bill.balance > 0 ? (
        <StepFooter
          primaryLabel={
            <>
              Cobrar <span className="tabular-nums">{formatPrice(bill.balance)}</span>
            </>
          }
          onPrimary={onNext}
        />
      ) : null}
    </>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums text-foreground" : "tabular-nums text-foreground"}>{value}</dd>
    </div>
  );
}
