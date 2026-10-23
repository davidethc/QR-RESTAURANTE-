import { Coins, HandCoins, Percent, Receipt, ReceiptText, Wallet } from "lucide-react";
import { StatusMetric } from "@/components/shared/status-strip";
import { formatPrice } from "@/lib/utils";
import type { SalesSummary } from "@/types/reports";

/**
 * Cifras del rango en tarjetas separadas (StatusMetric, como Caja y Hoy):
 * cada una con su icono y franja de color para que no se lean como un
 * solo bloque. La tendencia vive en el gráfico de ventas por periodo.
 */
export function KpiCards({ summary }: { summary: SalesSummary }) {
  return (
    <>
      <StatusMetric label="Venta neta" value={formatPrice(summary.net_sales)} tone="money-in" icon={Coins} />
      <StatusMetric label="Cuentas cerradas" value={String(summary.bills_count)} tone="info" icon={Receipt} />
      <StatusMetric label="Ticket promedio" value={formatPrice(summary.avg_ticket)} icon={ReceiptText} />
      <StatusMetric label="Propinas" value={formatPrice(summary.tips)} icon={HandCoins} />
      <StatusMetric
        label="Descuentos"
        value={formatPrice(summary.discounts)}
        tone={summary.discounts > 0 ? "money-out" : "neutral"}
        icon={Percent}
      />
      <StatusMetric
        label={`Por cobrar · ${summary.open_bills_count}`}
        value={formatPrice(summary.open_bills_balance)}
        tone={summary.open_bills_count > 0 ? "attention" : "neutral"}
        icon={Wallet}
      />
    </>
  );
}
