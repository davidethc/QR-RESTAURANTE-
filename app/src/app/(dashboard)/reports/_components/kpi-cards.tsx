import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import type { SalesSummary } from "@/types/reports";

/**
 * Fila de KPIs (stat tiles, ver skill dataviz): un número grande por
 * tarjeta, sin gráfico — la tendencia vive en el gráfico de ventas por
 * periodo, no aquí.
 */
export function KpiCards({ summary }: { summary: SalesSummary }) {
  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: "Venta neta", value: formatPrice(summary.net_sales) },
    { label: "Cuentas cerradas", value: String(summary.bills_count) },
    { label: "Ticket promedio", value: formatPrice(summary.avg_ticket) },
    { label: "Propinas", value: formatPrice(summary.tips) },
    { label: "Descuentos", value: formatPrice(summary.discounts) },
    {
      label: "Pendiente por cobrar",
      value: formatPrice(summary.open_bills_balance),
      hint: `${summary.open_bills_count} cuenta(s) abierta(s)`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <Card key={tile.label} className="gap-1.5 py-4">
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-caption font-medium text-muted-foreground">
              {tile.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <p className="font-display text-title-lg font-semibold leading-tight text-foreground">
              {tile.value}
            </p>
            {tile.hint && (
              <p className="mt-0.5 text-tiny text-muted-foreground">{tile.hint}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
