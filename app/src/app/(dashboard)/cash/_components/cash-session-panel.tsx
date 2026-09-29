"use client";

import { ArrowDownCircle, ArrowUpCircle, Lock } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";
import { CashMovementDialog, REASON_LABEL } from "./cash-movement-dialog";
import { CloseCashDialog } from "./close-cash-dialog";
import type { UserRole } from "@/config/constants";
import type { CashSessionSummary } from "@/types/billing";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

/**
 * Estado de la caja abierta. El mesero ve cobros por método y el total,
 * pero nunca "esperado" — ese campo directamente no viene en la
 * respuesta cuando `can_see_expected` es false (cierre ciego, M9).
 */
export function CashSessionPanel({
  summary,
  role,
  timeZone,
  onClosed,
}: {
  summary: CashSessionSummary;
  role: UserRole;
  timeZone: string;
  /** Solo OWNER/ADMIN: recibe el resumen completo tras un cierre exitoso. */
  onClosed?: (result: CashSessionSummary) => void;
}) {
  const isAdmin = role === "OWNER" || role === "ADMIN";
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
            {openedAt && (
              <p className="text-meta text-muted-foreground">Desde las {openedAt}</p>
            )}
          </div>
          {summary.opening_float !== undefined && (
            <div className="text-right">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Fondo</p>
              <p className="text-lead font-semibold tabular-nums text-foreground">
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
                      {isAdmin && (
                        <span className="text-muted-foreground"> · esperado {formatPrice(m.expected)}</span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}

        {!isAdmin && (
          <p className="mt-3 text-meta text-muted-foreground">
            Cobros de hoy por método. El cierre se hace a ciegas: cuenta el efectivo real, sin
            mirar el sistema.
          </p>
        )}
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-body font-semibold text-foreground">Movimientos de caja</p>
            <CashMovementDialog cashSessionId={summary.id} />
          </div>
          {!summary.movements || summary.movements.length === 0 ? (
            <p className="text-meta text-muted-foreground">Sin movimientos todavía.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {summary.movements.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-control bg-secondary px-3 py-2.5 text-meta">
                  <span className="flex items-center gap-2 text-foreground">
                    {m.type === "IN" ? (
                      <ArrowDownCircle className="h-4 w-4 text-success-soft-foreground" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4 text-warning-soft-foreground" />
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
        </div>
      )}

      <CloseCashDialog
        cashSessionId={summary.id}
        canSeeExpected={isAdmin}
        byMethod={summary.by_method}
        onClosed={onClosed}
      />
      <p className="flex items-center gap-1.5 text-center text-caption text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        Cerrar caja pide contar cada método antes de terminar el turno.
      </p>
    </div>
  );
}
