"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Bell } from "lucide-react";
import { TableStatusBadge } from "@/components/shared/status-badge";
import { TableQrDialog } from "./table-qr-dialog";
import { ReleaseTableButton } from "./release-table-button";
import { TakeOrderButton } from "./take-order-button";
import { formatPrice } from "@/lib/utils";
import type { UserRole } from "@/config/constants";
import type { TableStatusRow } from "@/types/staff";

interface TablesBoardProps {
  tables: TableStatusRow[];
  canManage: boolean;
  canServeTable: boolean;
  role: UserRole;
  billingEnabled: boolean;
  maxWaiterDiscountPct: number;
  tableSessionMap: Record<string, string>;
}

/**
 * Cada mesa es una superficie blanca neutra: el color vive solo en la
 * píldora de estado (`TableStatusBadge`), no en toda la tarjeta. Las
 * mesas que necesitan atención llevan además un borde sutil del color
 * de su estado, para que se puedan detectar en la rejilla sin tener
 * que leer cada píldora una por una.
 */
function getStatusBorder(status: TableStatusRow["status"]) {
  switch (status) {
    case "BILL_REQUESTED":
      return "border-warning-border";
    case "ATTENTION":
      return "border-primary/40";
    default:
      return "border-border";
  }
}

function TableCard({
  table,
  canManage,
  canServeTable,
  role,
  billingEnabled,
  maxWaiterDiscountPct,
  tableSessionId,
}: {
  table: TableStatusRow;
  canManage: boolean;
  canServeTable: boolean;
  role: UserRole;
  billingEnabled: boolean;
  maxWaiterDiscountPct: number;
  tableSessionId?: string;
}) {
  const border = getStatusBorder(table.status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={`flex flex-col gap-3 rounded-card border bg-card p-4 ${border}`}
    >
      <Link href={`/orders?table=${table.number}`} className="flex flex-col gap-2">
        <div className="flex min-h-7 items-center">
          <p className="text-title font-semibold leading-tight text-balance text-foreground">
            {table.name ?? `Mesa ${table.number}`}
          </p>
        </div>

        <TableStatusBadge status={table.status} className="self-start" />

        {(table.active_orders > 0 || table.pending_calls > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta leading-snug text-muted-foreground">
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
          <p className="text-lg font-semibold tabular-nums text-wine">
            {formatPrice(table.active_total)}
          </p>
        )}
      </Link>

      {canServeTable && (
        <div className="border-t border-border pt-3">
          <TakeOrderButton
            tableId={table.id}
            secondary={
              billingEnabled &&
              !!tableSessionId &&
              table.status !== "AVAILABLE" &&
              (role === "OWNER" || role === "ADMIN")
            }
          />
        </div>
      )}

      {(canManage || (canServeTable && table.status !== "AVAILABLE")) && (
        // Siempre en columna: con la rejilla en 3-4 columnas, la tarjeta
        // es angosta incluso a 1440 — dos botones lado a lado se
        // truncaban antes de llegar al breakpoint que los ponía en fila.
        <div className="flex w-full flex-col gap-2">
          {canManage && (
            <div className="w-full">
              <TableQrDialog
                tableLabel={table.name ?? `Mesa ${table.number}`}
                qrToken={table.qr_token}
              />
            </div>
          )}
          {canServeTable && table.status !== "AVAILABLE" && (
            <div className="w-full">
              <ReleaseTableButton
                tableId={table.id}
                tableLabel={table.name ?? `Mesa ${table.number}`}
                role={role}
                billingEnabled={billingEnabled}
                maxWaiterDiscountPct={maxWaiterDiscountPct}
                tableSessionId={tableSessionId}
              />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function TablesBoard({
  tables,
  canManage,
  canServeTable,
  role,
  billingEnabled,
  maxWaiterDiscountPct,
  tableSessionMap,
}: TablesBoardProps) {
  const availableCount = tables.filter((t) => t.status === "AVAILABLE").length;
  const billRequested = tables.filter((t) => t.status === "BILL_REQUESTED").length;
  const totalTables = tables.length;
  const occupiedCount = totalTables - availableCount;

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-4 pb-3 lg:px-6">
        <div className="grid grid-cols-3 divide-x divide-border rounded-card border border-border bg-card">
          <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2.5 sm:px-4 sm:py-3">
            <p className="truncate text-meta text-muted-foreground">Ocupadas</p>
            <p className="text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-title">
              {occupiedCount}/{totalTables}
            </p>
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2.5 sm:px-4 sm:py-3">
            <p className="truncate text-meta text-muted-foreground">Por cobrar</p>
            <p className="text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-title">
              {billRequested}
            </p>
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2.5 sm:px-4 sm:py-3">
            <p className="truncate text-meta text-muted-foreground">Libres</p>
            <p className="text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-title">
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
                role={role}
                billingEnabled={billingEnabled}
                maxWaiterDiscountPct={maxWaiterDiscountPct}
                tableSessionId={tableSessionMap[table.id]}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
