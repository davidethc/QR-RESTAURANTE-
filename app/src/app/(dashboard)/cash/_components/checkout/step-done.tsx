"use client";

import Link from "next/link";
import { Check, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonChips } from "@/components/shared/person-chips";
import { formatPrice } from "@/lib/utils";
import { SPLIT_MODE } from "@/config/constants";
import type { SplitProgress } from "@/lib/split-progress";
import type { Bill } from "@/types/billing";
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
 * cuenta si ya se puede, o terminar.
 */
export function StepDone({
  bill,
  last,
  progress,
  closePending,
  onCloseBill,
  onNextPerson,
  onFinish,
}: {
  bill: Bill;
  last: LastPayment | null;
  progress: SplitProgress | null;
  closePending: boolean;
  onCloseBill: () => void;
  onNextPerson: () => void;
  onFinish: () => void;
}) {
  const closed = bill.status === "CLOSED";
  const pendingBalance = bill.status === "OPEN" && bill.balance > 0;
  const nextPerson = progress?.current ? progress.persons[progress.current - 1] : null;

  let title = "Pago registrado";
  if (closed) title = "Cuenta cobrada y cerrada";
  else if (bill.status === "PAID") title = "Cuenta pagada";

  let detail: string | null = null;
  if (closed) detail = `${bill.place_label} quedó libre.`;
  else if (bill.status === "PAID" && !bill.can_close) detail = "Se cierra sola cuando salgan los pedidos que siguen en cocina.";
  else if (pendingBalance) detail = `Todavía falta cobrar ${formatPrice(bill.balance)}.`;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-money-in text-money-in-foreground shadow-lg animate-pos-pop motion-reduce:animate-none">
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

        {last && last.change > 0 && (
          <div className="flex w-full max-w-sm items-center justify-between rounded-card border-2 border-money-in-border bg-money-in-soft px-5 py-4">
            <span className="text-lead font-semibold text-money-in-soft-foreground">Entrega de vuelto</span>
            <span className="font-display text-[2.5rem] font-semibold leading-none tabular-nums text-money-in-soft-foreground">
              {formatPrice(last.change)}
            </span>
          </div>
        )}

        {progress && bill.split_mode === SPLIT_MODE.EQUAL && (
          <PersonChips persons={progress.persons} className="justify-center" />
        )}

        {(closed || bill.status === "PAID") && (
          <Button asChild variant="outline" className="h-12 px-5 text-body font-semibold">
            <Link href={`/cash/ticket/${bill.id}?print=1`} target="_blank" rel="noopener noreferrer">
              <Printer aria-hidden /> Imprimir ticket
            </Link>
          </Button>
        )}
      </div>

      {pendingBalance ? (
        <StepFooter
          backLabel="Ver cuenta"
          onBack={onFinish}
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
        <StepFooter primaryLabel="Cerrar cuenta y liberar" onPrimary={onCloseBill} pending={closePending} needsNetwork />
      ) : (
        <StepFooter primaryLabel="Listo" primaryTone="neutral" onPrimary={onFinish} />
      )}
    </>
  );
}
