"use client";

import Link from "next/link";
import { Info, Percent, Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { BillTotals } from "./bill-totals";
import { KitchenNotice } from "./kitchen-notice";
import { LineControls } from "./line-controls";
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
        {blockedReason && (
          <p role="alert" className="flex items-start gap-2 rounded-card border border-money-out-border bg-money-out-soft px-4 py-3 text-body-sm text-money-out-soft-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {blockedReason}
          </p>
        )}
        {bill.status === "PAID" && !bill.can_close && <KitchenNotice />}

        <section aria-labelledby="account-products" className="flex flex-col gap-2">
          <h3 id="account-products" className="text-body font-semibold text-foreground">
            Productos del pedido
          </h3>
          <ChargeTicket
            bill={bill}
            remainingByItem={{}}
            selectedItems={{}}
            onToggleItem={() => {}}
            selectable={false}
            lineActions={
              canManage && open && !blockedReason
                ? (item, order) => <LineControls bill={bill} order={order} item={item} onBillChange={onBillChange} />
                : undefined
            }
          />
        </section>

        <BillTotals
          bill={bill}
          removePending={removePending}
          onRemoveDiscount={canManage && open ? onRemoveDiscount : undefined}
        />

        <div className="flex flex-wrap gap-2">
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
          <PaymentsBlock bill={bill} context={context} onBillChange={onBillChange} allowVoid={canManage} />
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
          primaryArrow
          onPrimary={onNext}
        />
      ) : bill.status === "PAID" ? (
        <StepFooter>
          <Button asChild variant="outline" className="h-14 flex-1 px-5 text-body font-semibold">
            <Link href={`/cash/ticket/${bill.id}?print=1`} target="_blank" rel="noopener noreferrer">
              <Printer aria-hidden /> Imprimir ticket
            </Link>
          </Button>
        </StepFooter>
      ) : null}
    </>
  );
}
