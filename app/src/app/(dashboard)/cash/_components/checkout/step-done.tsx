"use client";

import Link from "next/link";
import { Check, CircleCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { SPLIT_MODE } from "@/config/constants";
import type { SplitProgress } from "@/lib/split-progress";
import type { Bill, BillPaymentContext } from "@/types/billing";
import { ChargeTicket } from "../charge-ticket";
import { PaymentsBlock } from "../payments-block";
import { BillTotals } from "./bill-totals";
import { KitchenNotice } from "./kitchen-notice";
import { StepFooter } from "./step-footer";

export interface LastPayment {
  amount: number;
  tip: number;
  change: number;
  methodLabel: string;
  replayed?: boolean;
}

/**
 * Paso 4 · Listo. Confirma lo que se cobró (y el vuelto, en grande) y deja
 * una sola salida clara: la siguiente persona si falta alguien, cerrar la
 * cuenta si ya se puede, o terminar. Con la cuenta ya pagada no hay nada que
 * cobrar: se muestra el resumen (cocina, productos, totales y pagos), no un
 * asistente de cobro.
 */
export function StepDone({
  bill,
  context,
  last,
  progress,
  closePending,
  onCloseBill,
  onNextPerson,
  onFinish,
}: {
  bill: Bill;
  context: BillPaymentContext | null;
  last: LastPayment | null;
  progress: SplitProgress | null;
  closePending: boolean;
  onCloseBill: () => void;
  onNextPerson: () => void;
  onFinish: () => void;
}) {
  const closed = bill.status === "CLOSED";
  const paid = bill.status === "PAID";
  const pendingBalance = bill.status === "OPEN" && bill.balance > 0;
  const nextPerson = progress?.current ? progress.persons[progress.current - 1] : null;

  let title = "Pago registrado";
  if (closed) title = "Cuenta finalizada";
  else if (paid) title = "Cuenta pagada";

  let detail: string | null = null;
  if (closed) detail = `${bill.place_label} quedó libre.`;
  else if (pendingBalance) detail = `Todavía falta cobrar ${formatPrice(bill.balance)}.`;

  const printTicket = (
    <Button asChild variant="outline" className="h-14 flex-1 px-5 text-body font-semibold">
      <Link href={`/cash/ticket/${bill.id}?print=1`} target="_blank" rel="noopener noreferrer">
        <Printer aria-hidden /> Imprimir ticket
      </Link>
    </Button>
  );

  const change =
    last && last.change > 0 ? (
      <div className="flex w-full items-center justify-between gap-3 rounded-card border-2 border-money-in-border bg-money-in-soft px-5 py-4">
        <span className="text-lead font-semibold text-money-in-soft-foreground">Entrega de vuelto</span>
        <span className="font-display text-[2.5rem] font-semibold leading-none tabular-nums text-money-in-soft-foreground">
          {formatPrice(last.change)}
        </span>
      </div>
    ) : null;

  const footer = pendingBalance ? (
    <StepFooter
      backLabel="Ver cuenta"
      onBack={onFinish}
      primaryArrow
      primaryLabel={
        nextPerson ? (
          <>
            Siguiente: Persona {nextPerson.number} · <span className="tabular-nums">{formatPrice(nextPerson.amount)}</span>
          </>
        ) : bill.split_mode === SPLIT_MODE.ITEMS ? (
          "Siguiente persona"
        ) : (
          <>
            Cobrar lo que falta · <span className="tabular-nums">{formatPrice(bill.balance)}</span>
          </>
        )
      }
      onPrimary={onNextPerson}
    />
  ) : bill.can_close ? (
    <StepFooter primaryLabel="Cerrar cuenta y liberar" onPrimary={onCloseBill} pending={closePending} needsNetwork>
      {paid && printTicket}
    </StepFooter>
  ) : (
    <StepFooter primaryLabel="Listo" primaryTone="neutral" onPrimary={onFinish}>
      {(closed || paid) && printTicket}
    </StepFooter>
  );

  // Pagada pero abierta (cocina) o lista para cerrar: resumen, sin asistente.
  if (paid) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
          <div role="status" className="flex items-center gap-3 rounded-card border border-money-in-border bg-money-in-soft px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-money-in text-money-in-foreground animate-pos-pop motion-reduce:animate-none">
              <Check className="size-6" strokeWidth={3} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-body font-semibold text-money-in-soft-foreground">
                {last?.replayed ? "Ese pago ya estaba registrado" : title}
              </p>
              {last && (
                <p className="text-meta text-money-in-soft-foreground">
                  Último pago: {formatPrice(last.amount + last.tip)} en {last.methodLabel.toLowerCase()}
                </p>
              )}
            </div>
          </div>
          {change}
          {!bill.can_close && <KitchenNotice />}
          <section aria-labelledby="done-products" className="flex flex-col gap-2">
            <h3 id="done-products" className="text-body font-semibold text-foreground">
              Productos del pedido
            </h3>
            <ChargeTicket bill={bill} remainingByItem={{}} selectedItems={{}} onToggleItem={() => {}} selectable={false} />
          </section>
          <BillTotals bill={bill} />
          {bill.payments.length > 0 && (
            <PaymentsBlock bill={bill} context={context} onBillChange={() => {}} allowVoid={false} />
          )}
        </div>
        {footer}
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto overscroll-contain px-4 py-8 text-center md:px-6">
        <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-money-in text-money-in-foreground shadow-lg animate-pos-pop motion-reduce:animate-none">
          <Check className="size-11" strokeWidth={3} aria-hidden />
        </span>
        <div role="status" className="flex flex-col gap-1">
          <p className="text-title font-semibold text-foreground">{last?.replayed ? "Ese pago ya estaba registrado" : title}</p>
          {last && (
            <p className="text-body text-muted-foreground">
              {formatPrice(last.amount + last.tip)} en {last.methodLabel.toLowerCase()}
            </p>
          )}
          {detail && <p className="text-body-sm text-muted-foreground">{detail}</p>}
        </div>

        <div className="flex w-full max-w-md flex-col gap-4 text-left">
          {change}

          {closed && (
            <>
              <dl className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 text-body-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-body font-semibold text-foreground">Total</dt>
                  <dd className="text-lead font-semibold tabular-nums text-foreground">{formatPrice(bill.total)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Pagado</dt>
                  <dd className="inline-flex items-center gap-1 tabular-nums text-money-in-soft-foreground">
                    <CircleCheck className="size-4" aria-hidden /> {formatPrice(bill.paid_total)}
                  </dd>
                </div>
                {bill.tip_total > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Propinas (aparte)</dt>
                    <dd className="tabular-nums text-foreground">{formatPrice(bill.tip_total)}</dd>
                  </div>
                )}
              </dl>
              {bill.payments.length > 0 && (
                <PaymentsBlock bill={bill} context={context} onBillChange={() => {}} allowVoid={false} />
              )}
            </>
          )}
        </div>
      </div>
      {footer}
    </>
  );
}
