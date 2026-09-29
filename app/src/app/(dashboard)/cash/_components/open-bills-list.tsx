"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice, cn } from "@/lib/utils";
import { useChargeSheet } from "./charge-sheet-host";
import { CancelCounterSaleDialog } from "./cancel-counter-sale-dialog";
import type { OpenBillSummary } from "@/types/billing";

/**
 * Cuentas abiertas del restaurante (list_open_bills): mesas que ya
 * abrieron cuenta pero aún no pagan todo, y ventas de mostrador (para
 * llevar) sin cobrar o pagadas esperando entrega. Cada fila abre la misma
 * hoja de cobro que "Cobrar y liberar" en Mesas — la RPC es idempotente,
 * así que no importa desde dónde se entre. Se agrupan por `table_kind`:
 * el mostrador tiene además "Cancelar venta" (mesas no se cancelan así,
 * se liberan).
 */
export function OpenBillsList({
  bills,
  maxWaiterDiscountPct,
}: {
  bills: OpenBillSummary[];
  maxWaiterDiscountPct: number;
}) {
  const tableBills = bills.filter((b) => b.table_kind !== "COUNTER");
  const counterBills = bills.filter((b) => b.table_kind === "COUNTER");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-body font-semibold text-foreground">Cuentas abiertas</p>
        {tableBills.length === 0 ? (
          <div className="rounded-card border border-border bg-card p-2">
            <EmptyState title="No hay cuentas abiertas" description="Todas las mesas están al día." />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tableBills.map((bill) => (
              <BillRow key={bill.id ?? bill.table_session_id} bill={bill} maxWaiterDiscountPct={maxWaiterDiscountPct} />
            ))}
          </div>
        )}
      </div>

      {counterBills.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-body font-semibold text-foreground">Ventas de mostrador abiertas</p>
          <div className="flex flex-col gap-2">
            {counterBills.map((bill) => (
              <BillRow
                key={bill.id ?? bill.table_session_id}
                bill={bill}
                maxWaiterDiscountPct={maxWaiterDiscountPct}
                cancelable={bill.paid_total === 0}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BillRow({
  bill,
  maxWaiterDiscountPct,
  cancelable = false,
}: {
  bill: OpenBillSummary;
  maxWaiterDiscountPct: number;
  cancelable?: boolean;
}) {
  const { openCharge } = useChargeSheet();
  const isCounter = bill.table_kind === "COUNTER";
  // Mostrador: "Pendiente" (nada pagado aún) o "Pagado · esperando
  // entrega" (ya se cobró, la cuenta se cierra sola al entregar el
  // último pedido, C4). Mesas mantienen el rótulo de siempre.
  const statusLabel = isCounter
    ? bill.status === "PAID"
      ? "Pagado · esperando entrega"
      : "Pendiente"
    : bill.status === "PAID"
      ? "Pagada"
      : "Por cobrar";

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-foreground">{bill.place_label}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-muted-foreground">
            <Badge
              className={cn(
                "h-5 px-2 text-caption font-semibold",
                bill.status === "PAID"
                  ? "bg-success-soft text-success-soft-foreground"
                  : "bg-warning-soft text-warning-soft-foreground"
              )}
            >
              {statusLabel}
            </Badge>
            {bill.active_orders > 0 && <span>{bill.active_orders} pedido(s) activo(s)</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-caption uppercase tracking-wide text-muted-foreground">Saldo</p>
            <p className="text-lead font-semibold tabular-nums text-foreground">{formatPrice(bill.balance)}</p>
          </div>
          <Button
            size="icon-lg"
            className="h-11 w-11"
            aria-label="Cobrar"
            onClick={() =>
              openCharge({
                tableSessionId: bill.table_session_id,
                tableLabel: bill.place_label,
                maxWaiterDiscountPct,
              })
            }
          >
            <Wallet className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {cancelable && bill.id && (
        <div className="flex justify-end border-t border-border pt-1">
          <CancelCounterSaleDialog billId={bill.id} placeLabel={bill.place_label} />
        </div>
      )}
    </div>
  );
}
