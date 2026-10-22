"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice } from "@/lib/utils";
import type { HistoryOrder } from "@/lib/queries/tables-panel";

function dayKey(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));
}

function formatDate(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("es", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function HistoryTable({ orders, timezone }: { orders: HistoryOrder[]; timezone: string }) {
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<HistoryOrder | null>(null);

  const rows = useMemo(
    () => (date ? orders.filter((o) => dayKey(o.createdAt, timezone) === date) : orders),
    [orders, date, timezone]
  );

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="history-date" className="text-body-sm font-medium">
          Fecha
        </label>
        <Input
          id="history-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-auto"
        />
        {date && (
          <Button variant="ghost" className="h-11 rounded-control" onClick={() => setDate("")}>
            Quitar filtro
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={History} title="Sin pedidos" description="No hay pedidos de mesa para esta fecha." />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                <TableHead>Estado de pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow
                  key={o.id}
                  tabIndex={0}
                  role="button"
                  className="min-h-11 cursor-pointer"
                  onClick={() => setSelected(o)}
                  onKeyDown={(e) => e.key === "Enter" && setSelected(o)}
                >
                  <TableCell className="font-semibold tabular-nums">#{o.folio}</TableCell>
                  <TableCell className="max-w-32 truncate">{o.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{formatDate(o.createdAt, timezone)}</TableCell>
                  <TableCell>
                    <Badge variant={o.paymentState === "Pagado" ? "default" : "secondary"}>{o.paymentState}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPrice(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Pedido #{selected.folio} · {selected.shortCode}
                </DialogTitle>
                <DialogDescription>
                  {selected.name} · {formatDate(selected.createdAt, timezone)} · {selected.paymentState}
                </DialogDescription>
              </DialogHeader>
              {selected.cancelReason && (
                <p className="rounded-card bg-muted px-3 py-2 text-meta">Motivo: {selected.cancelReason}</p>
              )}
              <ul className="flex flex-col divide-y divide-border">
                {selected.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3 py-2 text-body-sm">
                    <span className="min-w-0">
                      {i.quantity} × {i.name}
                      {i.notes && <span className="block text-meta text-muted-foreground">“{i.notes}”</span>}
                    </span>
                    <span className="tabular-nums">{formatPrice(i.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(selected.total)}</span>
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
