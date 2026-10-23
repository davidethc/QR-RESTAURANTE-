"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { TableStatusRow } from "@/types/staff";

/**
 * Botón para tomar un pedido en una mesa sin pasar primero por Mesas.
 *
 * Antes "Tomar pedido" solo aparecía en la tarjeta de una mesa (en Mesas)
 * o dentro de un aviso de "Llamar mesero" puntual — si el mesero ya
 * estaba en Comandas viendo la cocina o los pedidos en curso, tenía que
 * salir a Mesas primero. Este selector le deja elegir la mesa acá mismo.
 */
export function QuickTakeOrder({ tables, className }: { tables: TableStatusRow[]; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const servable = useMemo(
    () =>
      tables
        .filter((t) => t.status !== "INACTIVE")
        .sort((a, b) => a.number - b.number),
    [tables]
  );

  function goToTable(tableId: string) {
    setOpen(false);
    router.push(`/tables/${tableId}/order`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn("h-12 gap-2 rounded-button border-border bg-card px-4 text-body-sm font-semibold text-foreground hover:bg-muted", className)}
      >
        <ClipboardList aria-hidden className="size-5" /> Tomar en mesa
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿A qué mesa?</DialogTitle>
        </DialogHeader>
        {servable.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No hay mesas"
            description="Creá mesas primero desde Mesas."
          />
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto py-1 sm:grid-cols-3">
            {servable.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => goToTable(table.id)}
                className={cn(
                  "flex min-h-12 flex-col items-start gap-1.5 rounded-card border border-border bg-card p-3 text-left transition-[transform,background-color] duration-150 hover:bg-muted active:scale-[0.97] motion-reduce:transition-none",
                  table.status !== "AVAILABLE" && "border-primary/30 bg-primary-soft"
                )}
              >
                <span className="truncate text-body font-semibold text-foreground">
                  {table.name ?? `Mesa ${table.number}`}
                </span>
                <TableStatusBadge status={table.status} />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
