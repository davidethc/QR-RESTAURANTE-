import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { PrepStage, PrepTimesRow } from "@/types/reports";
import { Timer } from "lucide-react";

const STAGE_LABEL: Record<PrepStage, string> = {
  accept: "Aceptar pedido",
  prep: "Cocina (aceptado → listo)",
  delivery: "Entrega (listo → entregado)",
  total: "Total (creado → entregado)",
};

function minutes(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1)} min`;
}

export function PrepTimesCards({ rows }: { rows: PrepTimesRow[] }) {
  const hasData = rows.some((r) => r.orders_count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-body">Tiempos de cocina</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState icon={Timer} title="Sin pedidos con tiempos registrados" />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {rows.map((row) => (
              <div key={row.stage} className="rounded-lg border border-border/60 p-3">
                <p className="text-caption font-medium text-muted-foreground">
                  {STAGE_LABEL[row.stage]}
                </p>
                <p className="font-display mt-1 text-title font-semibold text-foreground">
                  {minutes(row.p50_minutes)}
                </p>
                <p className="text-tiny text-muted-foreground">
                  p50 · p90 {minutes(row.p90_minutes)} · prom. {minutes(row.avg_minutes)}
                </p>
                <p className="mt-1 text-tiny text-muted-foreground">
                  {row.orders_count} pedido(s)
                  {row.discarded_count > 0 && `, ${row.discarded_count} descartado(s)`}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
