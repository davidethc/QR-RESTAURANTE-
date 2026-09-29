import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice } from "@/lib/utils";
import type { SalesByStaffRow } from "@/types/reports";
import { Users } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  WAITER: "Mesero",
  KITCHEN: "Cocina",
};

export function StaffTable({ rows }: { rows: SalesByStaffRow[] }) {
  return (
    <div className="rounded-card border border-border bg-card p-5">
      <h3 className="mb-3 text-body font-semibold text-foreground">Ventas por mesero</h3>
      <div>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Sin actividad de personal en este rango" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">Pedidos aceptados</TableHead>
                  <TableHead className="text-right">Entregado</TableHead>
                  <TableHead className="text-right">Pagos cobrados</TableHead>
                  <TableHead className="text-right">Propinas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.user_id}>
                    <TableCell className="font-medium">{row.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.member_role ? ROLE_LABEL[row.member_role] : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.orders_accepted}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(row.orders_accepted_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(row.payments_amount)} ({row.payments_count})
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(row.tips_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
