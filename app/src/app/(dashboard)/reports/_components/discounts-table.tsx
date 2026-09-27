import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice } from "@/lib/utils";
import type { DiscountRow } from "@/types/reports";
import { Tag } from "lucide-react";

export function DiscountsTable({ rows }: { rows: DiscountRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">Descuentos aplicados</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={Tag} title="Sin descuentos en este rango" />
        ) : (
          <div className="overflow-x-auto">
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
                      <Badge variant={row.bill_status === "CLOSED" ? "secondary" : "outline"}>
                        {row.bill_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
