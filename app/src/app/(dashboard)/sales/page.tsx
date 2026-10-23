import { requireRouteAccess } from "@/lib/auth/require-route-access";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { BarChart3, Coins, HandCoins, Receipt, ReceiptText, TrendingUp } from "lucide-react";
import { StatusMetric, StatusPill } from "@/components/shared/status-strip";
import { posPressable } from "@/components/shared/pos-tone";
import { getMyRestaurant, getSalesReport } from "@/lib/queries/staff";
import { canAccessRoute } from "@/lib/permissions";
import { cn, formatPrice } from "@/lib/utils";
import { RangeTabs, type SalesRange } from "./_components/range-tabs";
import { SalesSummary } from "./_components/sales-summary";

// Ver la nota en (dashboard)/layout.tsx.
export const instant = false;

export const metadata: Metadata = { title: "Ventas" };

const RANGE_DAYS: Record<SalesRange, 1 | 7 | 30> = { hoy: 1, "7d": 7, "30d": 30 };
const RANGE_DETAIL: Record<SalesRange, string> = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
};

/**
 * Ventas con la identidad de Caja: franja arriba con las cifras del periodo
 * en tarjetas separadas, el filtro de fechas en un control segmentado y
 * debajo cada bloque en su propia tarjeta con cabecera.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await connection();
  const session = await getMyRestaurant();
  requireRouteAccess(session, "/sales");

  const { range: rawRange } = await searchParams;
  const range: SalesRange = rawRange === "7d" || rawRange === "30d" ? rawRange : "hoy";
  const report = await getSalesReport(session.restaurant.id, RANGE_DAYS[range]);
  const { summary } = report;
  const byOrders = report.source === "orders";
  const openBills = report.open_bills && report.open_bills.count > 0 ? report.open_bills : null;

  return (
    <main data-caja className="min-h-full bg-background">
      <h1 className="sr-only">Ventas</h1>
      <section
        aria-label="Cifras del periodo"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5"
      >
        <StatusPill
          tone={Number(summary.total_sold) > 0 ? "money-in" : "neutral"}
          icon={TrendingUp}
          title="Ventas"
          detail={RANGE_DETAIL[range]}
        />
        <div className="flex flex-wrap items-stretch gap-2">
          <StatusMetric label="Vendido" value={formatPrice(Number(summary.total_sold))} tone="money-in" icon={Coins} />
          <StatusMetric label={byOrders ? "Pedidos entregados" : "Cuentas cobradas"} value={String(summary.tickets)} tone="info" icon={Receipt} />
          <StatusMetric label="Ticket promedio" value={formatPrice(Number(summary.avg_ticket))} icon={ReceiptText} />
          {!byOrders && (
            <StatusMetric label="Propinas" value={formatPrice(Number(summary.tips))} icon={HandCoins} />
          )}
          {openBills && (
            <StatusMetric
              label={`Por cobrar · ${openBills.count}`}
              value={formatPrice(Number(openBills.total))}
              tone="attention"
              icon={Receipt}
            />
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-5">
        <RangeTabs active={range} />
        <Link
          href="/reports"
          className={cn(
            posPressable,
            "inline-flex h-11 items-center gap-2 rounded-button border border-border bg-card px-4 text-body-sm font-semibold text-foreground hover:border-border-strong"
          )}
        >
          <BarChart3 className="size-4" aria-hidden />
          Reporte completo
        </Link>
      </div>

      <div className="px-4 pb-12 pt-4 md:px-5">
        <SalesSummary report={report} canOpenSettings={canAccessRoute(session, "/settings")} />
      </div>
    </main>
  );
}
