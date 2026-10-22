"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Loader2, ReceiptText } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { getCustomerAccount, type CustomerAccount } from "@/lib/actions/customer-session";
import { notify } from "@/lib/notifications";
import { formatPrice } from "@/lib/utils";
import { useTableStatus } from "./table-status-provider";

/**
 * Franja "Hola, Ana · Ver cuenta" bajo la cabecera. Abre una hoja con todo
 * lo pedido: productos, variante, extras y total. Se carga al abrir (y cada
 * vez que se vuelve a abrir) para que nunca muestre números viejos.
 */
export function AccountBar({ tableNumber }: { tableNumber: number }) {
  const { customerLabel, orders } = useTableStatus();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [loading, startLoading] = useTransition();

  function load() {
    startLoading(async () => {
      const result = await getCustomerAccount();
      if (result.ok) setAccount(result.data);
      else notify.error(result.error);
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) load();
  }

  // El estado de la mesa cambió mientras la hoja está abierta: se vuelve a
  // pedir la cuenta (aprobado, rechazado, nueva ronda).
  const signature = orders.map((o) => `${o.id}:${o.status}`).join("|");
  const [seen, setSeen] = useState(signature);
  if (signature !== seen) {
    setSeen(signature);
    if (open) load();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="flex min-h-12 w-full items-center gap-3 border-b border-border bg-card px-4 py-2.5 text-left active:bg-muted"
      >
        <ReceiptText aria-hidden className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
          {customerLabel ? (
            <>
              Hola, <span className="font-semibold">{customerLabel}</span>
            </>
          ) : (
            `Mesa ${tableNumber}`
          )}
        </span>
        <span className="shrink-0 text-[14px] font-semibold text-primary">Ver cuenta</span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="flex max-h-[90vh] flex-col gap-0 p-0">
          <div className="border-b bg-background px-6 py-4">
            <SheetTitle className="font-display text-[20px] font-bold">
              Cuenta · Mesa {tableNumber}
            </SheetTitle>
            <SheetDescription className="mt-0.5 text-sm text-muted-foreground">
              Lo que han pedido en tu mesa. El pago se hace con el mesero.
            </SheetDescription>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {!account ? (
              <p className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando cuenta…
              </p>
            ) : account.rounds.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                Todavía no has pedido nada.
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {account.rounds.map((round) => (
                  <section key={round.order_number} aria-label={`Pedido ${round.order_number}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
                        Pedido #{round.order_number}
                      </h3>
                      {round.awaiting_approval && (
                        <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[12px] font-semibold text-foreground">
                          Esperando aprobación del mesero
                        </span>
                      )}
                    </div>
                    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
                      {round.lines.map((line, i) => (
                        <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-[15px] font-medium text-foreground">
                              <span className="tabular-nums text-primary">{line.quantity}×</span>{" "}
                              {line.name}
                              {line.variant && (
                                <span className="font-normal text-muted-foreground"> · {line.variant}</span>
                              )}
                            </p>
                            {line.options.map((o, j) => (
                              <p key={j} className="text-[13px] text-muted-foreground">
                                + {o.qty > 1 ? `${o.qty}× ` : ""}
                                {o.name}
                                {o.price > 0 && ` (${formatPrice(o.price * o.qty)})`}
                              </p>
                            ))}
                          </div>
                          <span className="shrink-0 text-[15px] font-semibold tabular-nums">
                            {formatPrice(line.subtotal)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>

          {account && account.rounds.length > 0 && (
            <div className="flex items-center justify-between border-t bg-background px-6 py-4">
              <span className="font-display text-[16px] font-semibold text-muted-foreground">Total</span>
              <span className="font-display text-[24px] font-bold tabular-nums text-wine">
                {formatPrice(account.total)}
              </span>
            </div>
          )}
          {loading && account && <span className="sr-only" role="status">Actualizando cuenta</span>}
        </SheetContent>
      </Sheet>
    </>
  );
}
