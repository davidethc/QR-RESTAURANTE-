"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Bell } from "lucide-react";
import { TableStatusBadge } from "@/components/shared/status-badge";
import { TableQrDialog } from "./table-qr-dialog";
import { ReleaseTableButton } from "./release-table-button";
import { TakeOrderButton } from "./take-order-button";
import { formatPrice } from "@/lib/utils";
import type { TableStatusRow } from "@/types/staff";

interface TablesBoardV2Props {
  tables: TableStatusRow[];
  canManage: boolean;
  canServeTable: boolean;
}

function getStatusColors(status: TableStatusRow["status"]) {
  switch (status) {
    case "AVAILABLE":
      return {
        bg: "bg-emerald-50 dark:bg-emerald-950/20",
        border: "border-emerald-200 dark:border-emerald-900/50",
      };
    case "BILL_REQUESTED":
      return {
        bg: "bg-amber-50 dark:bg-amber-950/20",
        border: "border-amber-200 dark:border-amber-900/50",
      };
    case "ATTENTION":
      return {
        bg: "bg-primary/5",
        border: "border-primary/30",
      };
    case "INACTIVE":
      return {
        bg: "bg-muted/40",
        border: "border-border",
      };
    case "OCCUPIED":
    default:
      return {
        bg: "bg-blue-50 dark:bg-blue-950/20",
        border: "border-blue-200 dark:border-blue-900/50",
      };
  }
}

function TableCard({
  table,
  canManage,
  canServeTable,
}: {
  table: TableStatusRow;
  canManage: boolean;
  canServeTable: boolean;
}) {
  const { bg, border } = getStatusColors(table.status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={`flex flex-col gap-3 rounded-2xl border-2 ${border} ${bg} p-4`}
    >
      <Link href={`/orders?table=${table.number}`} className="flex flex-col gap-2">
        <div className="flex min-h-7 items-center">
          <p className="font-display text-lg font-bold leading-tight text-balance text-foreground">
            {table.name ?? `Mesa ${table.number}`}
          </p>
        </div>

        <TableStatusBadge status={table.status} className="self-start" />

        {(table.active_orders > 0 || table.pending_calls > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-snug text-muted-foreground">
            {table.active_orders > 0 && (
              <span className="flex items-center gap-1">
                <ClipboardList className="size-3.5" />
                {table.active_orders} activo{table.active_orders > 1 ? "s" : ""}
              </span>
            )}
            {table.pending_calls > 0 && (
              <span className="flex items-center gap-1 font-medium text-primary">
                <Bell className="size-3.5" />
                {table.pending_calls} pendiente{table.pending_calls > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {table.active_total > 0 && (
          <p className="font-display text-lg font-semibold tabular-nums text-wine">
            {formatPrice(table.active_total)}
          </p>
        )}
      </Link>

      {canServeTable && (
        <div className="border-t border-border/60 pt-3">
          <TakeOrderButton tableId={table.id} />
        </div>
      )}

      {(canManage || (canServeTable && table.status !== "AVAILABLE")) && (
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          {canManage && (
            <div className="w-full sm:flex-1">
              <TableQrDialog
                tableLabel={table.name ?? `Mesa ${table.number}`}
                qrToken={table.qr_token}
              />
            </div>
          )}
          {canServeTable && table.status !== "AVAILABLE" && (
            <div className="w-full sm:flex-1">
              <ReleaseTableButton
                tableId={table.id}
                tableLabel={table.name ?? `Mesa ${table.number}`}
              />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function TablesBoardV2({ tables, canManage, canServeTable }: TablesBoardV2Props) {
  const availableCount = tables.filter((t) => t.status === "AVAILABLE").length;
  const billRequested = tables.filter((t) => t.status === "BILL_REQUESTED").length;
  const totalTables = tables.length;
  const occupiedCount = totalTables - availableCount;

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-4 pb-3 lg:px-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-col justify-center rounded-xl bg-blue-50 px-2.5 py-2 dark:bg-blue-950/20 sm:px-3 sm:py-2.5">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Ocupadas
            </p>
            <p className="font-display text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-[20px]">
              {occupiedCount}/{totalTables}
            </p>
          </div>
          <div className="flex min-w-0 flex-col justify-center rounded-xl bg-amber-50 px-2.5 py-2 dark:bg-amber-950/20 sm:px-3 sm:py-2.5">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Por cobrar
            </p>
            <p className="font-display text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-[20px]">
              {billRequested}
            </p>
          </div>
          <div className="flex min-w-0 flex-col justify-center rounded-xl bg-emerald-50 px-2.5 py-2 dark:bg-emerald-950/20 sm:px-3 sm:py-2.5">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Libres
            </p>
            <p className="font-display text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-[20px]">
              {availableCount}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pb-6 lg:px-6">
        <div className="grid auto-rows-max grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                canManage={canManage}
                canServeTable={canServeTable}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
