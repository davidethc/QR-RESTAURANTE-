import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportCard } from "./report-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice } from "@/lib/utils";
import type { SalesByProductRow } from "@/types/reports";
import { UtensilsCrossed } from "lucide-react";

export function TopProductsTable({ rows }: { rows: SalesByProductRow[] }) {
  const top = rows.slice(0, 20);

  return (
    <ReportCard id="report-products" title="Top productos" icon={UtensilsCrossed} flush>
      <div>
        {top.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Sin productos vendidos en este rango" />
        ) : (
          <div className="overflow-x-auto [&_td]:py-3 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:bg-secondary/60 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Venta bruta</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((row, i) => (
                  <TableRow key={row.product_id ?? `${row.product_name}-${i}`}>
                    <TableCell className="font-medium">{row.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.category_name ?? "Sin categoría"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(row.gross_sales)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.orders_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {rows.length > top.length && (
          <p className="border-t border-border px-4 py-2.5 text-caption text-muted-foreground">
            Mostrando los primeros {top.length} de {rows.length}. Exporta a Excel para ver todos.
          </p>
        )}
      </div>
    </ReportCard>
  );
}
