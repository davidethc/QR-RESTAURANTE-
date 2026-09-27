"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice, cn } from "@/lib/utils";
import { useChargeSheet } from "./charge-sheet-host";
import type { OpenBillSummary } from "@/types/billing";

/**
 * Cuentas abiertas del restaurante (list_open_bills): la mesa que ya
 * abrió cuenta pero aún no paga todo. Cada fila abre la misma hoja de
 * cobro que "Cobrar y liberar" en Mesas — la RPC es idempotente, así
 * que no importa desde dónde se entre.
 */
export function OpenBillsList({
  bills,
  maxWaiterDiscountPct,
}: {
  bills: OpenBillSummary[];
  maxWaiterDiscountPct: number;
}) {
  const { openCharge } = useChargeSheet();

  if (bills.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-2">
        <EmptyState title="No hay cuentas abiertas" description="Todas las mesas están al día." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {bills.map((bill) => (
        <div
          key={bill.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3"
        >
          <div className="min-w-0">
            <p className="font-display truncate text-[15px] font-semibold text-foreground">
              {bill.table_name ?? `Mesa ${bill.table_number}`}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
              <Badge
                className={cn(
                  "h-5 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide",
                  bill.status === "PAID" ? "bg-success text-success-foreground" : "bg-wine text-wine-foreground"
                )}
              >
                {bill.status === "PAID" ? "Pagada" : "Por cobrar"}
              </Badge>
              {bill.active_orders > 0 && <span>{bill.active_orders} pedido(s) activo(s)</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Saldo</p>
              <p className="font-display tabular-nums text-wine">{formatPrice(bill.balance)}</p>
            </div>
            <Button
              size="icon-lg"
              className="clay clay-primary h-11 w-11 rounded-full"
              aria-label="Cobrar"
              onClick={() =>
                openCharge({
                  tableSessionId: bill.table_session_id,
                  tableLabel: bill.table_name ?? `Mesa ${bill.table_number}`,
                  maxWaiterDiscountPct,
                })
              }
            >
              <Wallet className="h-5 w-5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
