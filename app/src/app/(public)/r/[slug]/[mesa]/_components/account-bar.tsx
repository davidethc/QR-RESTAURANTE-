"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Hourglass, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-secondary/60 active:bg-secondary"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <ReceiptText aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-lg text-foreground">
            {customerLabel ? (
              <>
                Hola, <span className="font-semibold">{customerLabel}</span>
              </>
            ) : (
              `Mesa ${tableNumber}`
            )}
          </span>
          <span className="text-meta text-muted-foreground">Tu cuenta de la mesa</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-body-sm font-semibold text-primary">
          Ver cuenta
          <ChevronRight aria-hidden className="size-4" />
        </span>
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="flex data-[side=bottom]:h-[94dvh] max-h-[94dvh] flex-col gap-0 rounded-t-3xl bg-background p-0 sm:mx-auto sm:max-w-xl sm:border-x"
        >
          <div className="border-b border-border bg-card px-5 pb-4 pt-5 pr-16">
            <SheetTitle className="font-display text-title-lg font-bold leading-tight">
              Cuenta · Mesa {tableNumber}
            </SheetTitle>
            <SheetDescription className="mt-1 text-body-sm text-muted-foreground">
              Lo que han pedido en tu mesa. El pago se hace con el mesero.
            </SheetDescription>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {!account ? (
              <div className="flex flex-col gap-3" aria-busy="true">
                <p className="sr-only" role="status">Cargando cuenta…</p>
                {[0, 1].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
                ))}
              </div>
            ) : account.rounds.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <ReceiptText aria-hidden className="size-6" />
                </span>
                <p className="text-body font-semibold text-foreground">Todavía no has pedido nada.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="h-11 rounded-xl px-5 text-body"
                >
                  Ver la carta
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {account.rounds.map((round) => (
                  <section
                    key={round.order_number}
                    aria-label={`Pedido ${round.order_number}`}
                    className="overflow-hidden rounded-2xl border border-border bg-card"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
                      <h3 className="text-body-sm font-bold text-foreground">
                        Pedido #{round.order_number}
                      </h3>
                      {round.awaiting_approval && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-info-border bg-info-soft px-2.5 py-0.5 text-caption font-semibold text-info-soft-foreground">
                          <Hourglass aria-hidden className="size-3.5" />
                          Esperando aprobación del mesero
                        </span>
                      )}
                    </div>
                    <ul className="flex flex-col divide-y divide-border">
                      {round.lines.map((line, i) => (
                        <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-body text-foreground">
                              <span className="font-semibold tabular-nums text-primary">{line.quantity}×</span>{" "}
                              <span className="font-medium">{line.name}</span>
                              {line.variant && (
                                <span className="text-muted-foreground"> · {line.variant}</span>
                              )}
                            </p>
                            {line.options.map((o, j) => (
                              <p key={j} className="text-meta text-muted-foreground">
                                + {o.qty > 1 ? `${o.qty}× ` : ""}
                                {o.name}
                                {o.price > 0 && ` (${formatPrice(o.price * o.qty)})`}
                              </p>
                            ))}
                          </div>
                          <span className="shrink-0 text-body font-semibold tabular-nums">
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
            <div
              className="flex items-baseline justify-between border-t border-border bg-card px-5 pt-4"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <span className="text-body font-semibold text-muted-foreground">Total de la mesa</span>
              <span className="font-display text-display font-bold tabular-nums text-foreground">
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
