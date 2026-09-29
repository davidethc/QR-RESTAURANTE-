"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice } from "@/lib/utils";
import type { ReportGranularity, SalesByPeriodRow } from "@/types/reports";
import { BarChart3 } from "lucide-react";

const GRANULARITY_LABEL: Record<ReportGranularity, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
};

// Orden categórico fijo (slot 1 = neto, slot 2 = bruto) — nunca se ciclan
// ni se reasignan por el filtro activo (skill dataviz, color-formula.md).
const chartConfig = {
  net_sales: { label: "Venta neta", color: "var(--color-chart-1)" },
  gross_sales: { label: "Venta bruta", color: "var(--color-chart-2)" },
} satisfies ChartConfig;

function formatPeriodLabel(row: SalesByPeriodRow, granularity: ReportGranularity): string {
  const start = new Date(`${row.period_start}T00:00:00Z`);
  if (granularity === "month") {
    return start.toLocaleDateString("es-EC", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  if (granularity === "week") {
    return start.toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: "UTC" });
  }
  return start.toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function SalesPeriodChart({
  rows,
  granularity,
  onGranularityChange,
  disabled,
}: {
  rows: SalesByPeriodRow[];
  granularity: ReportGranularity;
  onGranularityChange: (g: ReportGranularity) => void;
  disabled?: boolean;
}) {
  const data = rows.map((row) => ({
    label: formatPeriodLabel(row, granularity),
    net_sales: row.net_sales,
    gross_sales: row.gross_sales,
  }));

  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="mb-3 flex flex-row items-center justify-between gap-3">
        <h3 className="text-body font-semibold text-foreground">Ventas por periodo</h3>
        <ToggleGroup
          type="single"
          variant="default"
          spacing={1}
          size="sm"
          value={granularity}
          disabled={disabled}
          onValueChange={(v) => v && onGranularityChange(v as ReportGranularity)}
          className="rounded-control border border-border bg-secondary p-1"
        >
          {(["day", "week", "month"] as ReportGranularity[]).map((g) => (
            <ToggleGroupItem
              key={g}
              value={g}
              className="rounded-control px-2.5 text-caption font-medium text-muted-foreground transition-colors duration-150 hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {GRANULARITY_LABEL[g]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div>
        {data.length === 0 ? (
          <EmptyState icon={BarChart3} title="Sin ventas en este rango" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <BarChart data={data} barGap={2}>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={56}
                tickFormatter={(v: number) => formatPrice(v)}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(value) => formatPrice(Number(value))} />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="net_sales" fill="var(--color-net_sales)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gross_sales" fill="var(--color-gross_sales)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
