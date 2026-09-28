"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice } from "@/lib/utils";
import type { SalesByCategoryRow } from "@/types/reports";
import { PieChart } from "lucide-react";

// Nominal categórico de una sola métrica: todas las barras llevan el mismo
// hue (slot 1) — el color no re-codifica lo que el largo de la barra ya
// muestra (skill dataviz, color-formula.md).
const chartConfig = {
  gross_sales: { label: "Venta bruta", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const MAX_ROWS = 7;

export function CategoryBarChart({ rows }: { rows: SalesByCategoryRow[] }) {
  const sorted = [...rows].sort((a, b) => b.gross_sales - a.gross_sales);
  const top = sorted.slice(0, MAX_ROWS);
  const rest = sorted.slice(MAX_ROWS);

  const data = top.map((row) => ({
    label: row.category_name,
    gross_sales: row.gross_sales,
  }));
  if (rest.length > 0) {
    data.push({
      label: "Otras",
      gross_sales: rest.reduce((sum, r) => sum + r.gross_sales, 0),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-body">Ventas por categoría</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState icon={PieChart} title="Sin ventas por categoría en este rango" />
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto w-full"
            style={{ height: Math.max(160, data.length * 40) }}
          >
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="0" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                width={110}
                tickMargin={8}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(value) => formatPrice(Number(value))} />}
              />
              <Bar dataKey="gross_sales" fill="var(--color-gross_sales)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
