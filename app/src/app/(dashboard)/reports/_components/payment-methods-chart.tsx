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
import type { PaymentsByMethodRow } from "@/types/reports";
import { CreditCard } from "lucide-react";

const METHOD_LABEL: Record<PaymentsByMethodRow["method"], string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

const chartConfig = {
  amount: { label: "Cobrado", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

export function PaymentMethodsChart({ rows }: { rows: PaymentsByMethodRow[] }) {
  const hasData = rows.some((r) => r.payments_count > 0 || r.voided_count > 0);
  const data = rows.map((row) => ({
    label: METHOD_LABEL[row.method],
    amount: row.amount,
    tips: row.tips,
    count: row.payments_count,
    voided_count: row.voided_count,
    voided_amount: row.voided_amount,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-body">Formas de pago</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState icon={CreditCard} title="Sin pagos registrados en este rango" />
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
            <BarChart data={data} barGap={2}>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => formatPrice(v)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) =>
                      name === "amount" ? formatPrice(Number(value)) : value
                    }
                  />
                }
              />
              <Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
