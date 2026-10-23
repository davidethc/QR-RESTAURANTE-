import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BillStatus } from "@/config/constants";
import { toneSoft, type PosTone } from "@/components/shared/pos-tone";
import { ReportCard } from "./report-card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn, formatPrice } from "@/lib/utils";
import type { DiscountRow } from "@/types/reports";
import { CheckCircle2, CircleDot, Clock3, Tag, XCircle, type LucideIcon } from "lucide-react";

export function DiscountsTable({ rows }: { rows: DiscountRow[] }) {
  return (
    <ReportCard id="report-discounts" title="Descuentos aplicados" icon={Tag} flush>
      <div>
        {rows.length === 0 ? (
          <EmptyState icon={Tag} title="Sin descuentos en este rango" />
        ) : (
          <div className="overflow-x-auto [&_td]:py-3 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:bg-secondary/60 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Mesa</TableHead>
                  <TableHead>Alcance</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Aplicado por</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.discount_id}>
                    <TableCell className="whitespace-nowrap">{row.business_date}</TableCell>
                    <TableCell>#{row.bill_number}</TableCell>
                    <TableCell>
                      {row.place_label ?? row.table_name ?? (row.table_number ? `Mesa ${row.table_number}` : "—")}
                    </TableCell>
                    <TableCell>
                      {row.product_name ?? "Toda la cuenta"}
                      <span className="ml-1 text-muted-foreground">
                        ({row.kind === "PERCENT" ? `${row.value}%` : formatPrice(row.value)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(row.amount)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {row.reason ?? "—"}
                    </TableCell>
                    <TableCell>{row.applied_by_name}</TableCell>
                    <TableCell>
                      <BillStatusChip status={row.bill_status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </ReportCard>
  );
}

const BILL_STATUS_CHIP: Record<BillStatus, { label: string; tone: PosTone; icon: LucideIcon }> = {
  OPEN: { label: "Abierta", tone: "attention", icon: Clock3 },
  PAID: { label: "Pagada", tone: "money-in", icon: CheckCircle2 },
  CLOSED: { label: "Cerrada", tone: "neutral", icon: CircleDot },
  VOID: { label: "Anulada", tone: "money-out", icon: XCircle },
};

function BillStatusChip({ status }: { status: BillStatus }) {
  const chip = BILL_STATUS_CHIP[status];
  const Icon = chip.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-caption font-semibold", toneSoft[chip.tone])}>
      <Icon className="size-3.5" aria-hidden />
      {chip.label}
    </span>
  );
}
