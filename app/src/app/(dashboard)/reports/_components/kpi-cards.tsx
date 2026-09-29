import { formatPrice } from "@/lib/utils";
import type { SalesSummary } from "@/types/reports";

/**
 * Fila de KPIs (stat tiles, ver skill dataviz): un número grande por
 * celda, sin gráfico — la tendencia vive en el gráfico de ventas por
 * periodo, no aquí. Una sola superficie dividida por líneas finas.
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
    <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-card border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex flex-col gap-1.5 p-5">
          <p className="text-meta text-muted-foreground">{tile.label}</p>
          <p className="text-2xl font-semibold leading-tight tabular-nums text-foreground">
            {tile.value}
          </p>
          {tile.hint && <p className="text-caption text-muted-foreground">{tile.hint}</p>}
        </div>
      ))}
    </div>
  );
}
