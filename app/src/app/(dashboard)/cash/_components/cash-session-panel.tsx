"use client";

import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";
import { CashMovementDialog, REASON_LABEL } from "./cash-movement-dialog";
import { CashCutDialog } from "./cash-cut-dialog";
import type { CashSessionSummary } from "@/types/billing";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

/**
 * Estado de una caja abierta. Quien no puede ver lo esperado (CASHIER, mesero)
 * recibe solo los cobros del turno: `can_see_expected` viene del servidor y
 * manda sobre cualquier suposición por rol.
 */
export function CashSessionPanel({
  summary,
  timeZone,
}: {
  summary: CashSessionSummary;
  timeZone: string;
}) {
  const canSeeExpected = summary.can_see_expected;
  const openedAt = summary.opened_at
    ? new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", timeZone }).format(
        new Date(summary.opened_at)
      )
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lead font-semibold text-foreground">
              {summary.register_name ?? "Caja"} · abierta
            </p>
            {openedAt && <p className="text-meta text-muted-foreground">Desde las {openedAt}</p>}
          </div>
          {summary.opening_float !== undefined && (
            <div className="text-right">
              <p className="text-caption text-muted-foreground">Fondo inicial</p>
              <p className="font-display text-lead font-semibold tabular-nums text-wine">
                {formatPrice(summary.opening_float)}
              </p>
            </div>
          )}
        </div>

        {summary.by_method && summary.by_method.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="flex flex-col gap-1.5">
              {summary.by_method
                .filter((m) => m.payments_total > 0 || m.tips_total > 0 || m.method === "CASH")
                .map((m) => (
                  <div key={m.method} className="flex justify-between text-body-sm">
                    <span className="text-muted-foreground">{METHOD_LABEL[m.method]}</span>
                    <span className="tabular-nums text-foreground">
                      {formatPrice(m.payments_total)}
                      {m.tips_total > 0 && (
                        <span className="text-muted-foreground"> + {formatPrice(m.tips_total)} propina</span>
                      )}
                      {canSeeExpected && (
                        <span className="text-muted-foreground"> · esperado {formatPrice(m.expected)}</span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}

        {!canSeeExpected && (
          <p className="mt-3 text-meta text-muted-foreground">
            El corte se hace a ciegas: cuenta el efectivo real, sin mirar el sistema.
          </p>
        )}
      </div>

      {canSeeExpected && summary.movements && summary.movements.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-body font-semibold text-foreground">Movimientos de este turno</p>
          {summary.movements.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-control bg-secondary px-3 py-2.5 text-meta"
            >
              <span className="flex items-center gap-2 text-foreground">
                {m.type === "IN" ? (
                  <ArrowDownCircle className="size-4 text-success-soft-foreground" aria-hidden />
                ) : (
                  <ArrowUpCircle className="size-4 text-warning-soft-foreground" aria-hidden />
                )}
                {REASON_LABEL[m.reason] ?? m.reason}
                {m.description && <span className="text-muted-foreground"> · {m.description}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {m.type === "IN" ? "+" : "-"}
                {formatPrice(m.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <CashMovementDialog cashSessionId={summary.id} label="Entrada o retiro de efectivo" />
        <CashCutDialog cashSessionId={summary.id} registerName={summary.register_name ?? "Caja"} />
      </div>
    </div>
  );
}
