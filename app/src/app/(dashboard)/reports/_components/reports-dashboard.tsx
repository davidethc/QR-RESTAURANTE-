"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { getReportsBundle, type ReportsBundleResult } from "@/lib/actions/reports";
import { notify } from "@/lib/notifications";
import { RANGE_PRESET_LABEL, type RangePresetKey } from "@/lib/reports-dates";
import { BarChart3 } from "lucide-react";
import { StatusPill } from "@/components/shared/status-strip";
import type { ReportGranularity, ReportRange } from "@/types/reports";
import { RangeSelector } from "@/components/shared/range-selector";
import { KpiCards } from "./kpi-cards";
import { TopProductsTable } from "./top-products-table";
import { StaffTable } from "./staff-table";
import { PeakHoursHeatmap } from "./peak-hours-heatmap";
import { PrepTimesCards } from "./prep-times-cards";
import { DiscountsTable } from "./discounts-table";
import { ReportsExportButton } from "./reports-export-button";
import { Skeleton } from "@/components/ui/skeleton";

// recharts pesa bastante y solo se usa aquí: se baja aparte (sin SSR, los
// gráficos miden el contenedor en el navegador) mientras se ve el esqueleto.
const chartFallback = () => <Skeleton className="h-64 w-full" />;
const SalesPeriodChart = dynamic(
  () => import("./sales-period-chart").then((m) => m.SalesPeriodChart),
  { ssr: false, loading: chartFallback }
);
const CategoryBarChart = dynamic(
  () => import("./category-bar-chart").then((m) => m.CategoryBarChart),
  { ssr: false, loading: chartFallback }
);
const PaymentMethodsChart = dynamic(
  () => import("./payment-methods-chart").then((m) => m.PaymentMethodsChart),
  { ssr: false, loading: chartFallback }
);

const DAY = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });
function formatDay(iso: string) {
  return DAY.format(new Date(`${iso}T00:00:00Z`));
}

function unwrapBundle(bundle: ReportsBundleResult) {
  return {
    summary: bundle.summary.ok ? bundle.summary.data : null,
    byPeriod: bundle.byPeriod.ok ? bundle.byPeriod.data : [],
    byProduct: bundle.byProduct.ok ? bundle.byProduct.data : [],
    byCategory: bundle.byCategory.ok ? bundle.byCategory.data : [],
    byStaff: bundle.byStaff.ok ? bundle.byStaff.data : [],
    byMethod: bundle.byMethod.ok ? bundle.byMethod.data : [],
    peakHours: bundle.peakHours.ok ? bundle.peakHours.data : [],
    prepTimes: bundle.prepTimes.ok ? bundle.prepTimes.data : [],
    discounts: bundle.discounts.ok ? bundle.discounts.data : [],
  };
}

function firstError(bundle: ReportsBundleResult): string | null {
  for (const result of Object.values(bundle)) {
    if (!result.ok) return result.error;
  }
  return null;
}

export function ReportsDashboard({
  restaurantId,
  restaurantName,
  timezone,
  businessDayCutoff,
  initialRange,
  initialBundle,
}: {
  restaurantId: string;
  restaurantName: string;
  timezone: string;
  businessDayCutoff: string;
  initialRange: ReportRange;
  initialBundle: ReportsBundleResult;
}) {
  const [range, setRange] = useState<ReportRange>(initialRange);
  const [preset, setPreset] = useState<RangePresetKey>("last7");
  const [granularity, setGranularity] = useState<ReportGranularity>("day");
  const [data, setData] = useState(() => unwrapBundle(initialBundle));
  const [isPending, startTransition] = useTransition();

  function reload(nextRange: ReportRange, nextGranularity: ReportGranularity) {
    startTransition(async () => {
      const bundle = await getReportsBundle({
        restaurantId,
        from: nextRange.from,
        to: nextRange.to,
        granularity: nextGranularity,
      });
      const error = firstError(bundle);
      if (error) {
        notify.error(error);
        return;
      }
      setData(unwrapBundle(bundle));
    });
  }

  function handleRangeChange(nextRange: ReportRange, nextPreset: RangePresetKey) {
    setRange(nextRange);
    setPreset(nextPreset);
    reload(nextRange, granularity);
  }

  function handleGranularityChange(nextGranularity: ReportGranularity) {
    setGranularity(nextGranularity);
    reload(range, nextGranularity);
  }

  const rangeLabel =
    preset === "custom" ? `${formatDay(range.from)} – ${formatDay(range.to)}` : RANGE_PRESET_LABEL[preset];

  return (
    <div className="flex flex-col">
      <section
        aria-label="Cifras del rango"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-3 md:px-5"
      >
        <StatusPill
          tone={data.summary && data.summary.net_sales > 0 ? "money-in" : "neutral"}
          icon={BarChart3}
          title="Reportes"
          detail={rangeLabel}
        />
        <div aria-busy={isPending} className="flex flex-wrap items-stretch gap-2">
          {isPending ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-[9.5rem] rounded-card" />)
          ) : data.summary ? (
            <KpiCards summary={data.summary} />
          ) : (
            <p className="self-center text-meta text-muted-foreground">No se pudieron cargar las cifras de este rango.</p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-5">
        <RangeSelector
          timezone={timezone}
          businessDayCutoff={businessDayCutoff}
          value={range}
          preset={preset}
          onChange={handleRangeChange}
          disabled={isPending}
        />
        <ReportsExportButton
          disabled={isPending || !data.summary}
          data={{
            restaurantName,
            from: range.from,
            to: range.to,
            summary: data.summary ?? {
              from: range.from,
              to: range.to,
              timezone,
              bills_count: 0,
              gross_sales: 0,
              discounts: 0,
              net_sales: 0,
              avg_ticket: 0,
              tips: 0,
              payments_count: 0,
              collected: 0,
              open_bills_count: 0,
              open_bills_total: 0,
              open_bills_balance: 0,
              delivered_orders_count: 0,
              delivered_orders_total: 0,
            },
            byPeriod: data.byPeriod,
            byProduct: data.byProduct,
            byCategory: data.byCategory,
            byStaff: data.byStaff,
            byMethod: data.byMethod,
            peakHours: data.peakHours,
            prepTimes: data.prepTimes,
            discounts: data.discounts,
          }}
        />
      </div>

      <div className="flex flex-col gap-4 px-4 pb-12 pt-4 md:px-5">
        <SalesPeriodChart
          rows={data.byPeriod}
          granularity={granularity}
          onGranularityChange={handleGranularityChange}
          disabled={isPending}
        />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <CategoryBarChart rows={data.byCategory} />
          <PaymentMethodsChart rows={data.byMethod} />
        </div>

        <TopProductsTable rows={data.byProduct} />
        <StaffTable rows={data.byStaff} />
        <PrepTimesCards rows={data.prepTimes} />
        <PeakHoursHeatmap rows={data.peakHours} />
        <DiscountsTable rows={data.discounts} />
      </div>
    </div>
  );
}
