"use client";

import { useState, useTransition } from "react";
import { getReportsBundle, type ReportsBundleResult } from "@/lib/actions/reports";
import { notify } from "@/lib/notifications";
import type { RangePresetKey } from "@/lib/reports-dates";
import type { ReportGranularity, ReportRange } from "@/types/reports";
import { RangeSelector } from "./range-selector";
import { KpiCards } from "./kpi-cards";
import { SalesPeriodChart } from "./sales-period-chart";
import { TopProductsTable } from "./top-products-table";
import { CategoryBarChart } from "./category-bar-chart";
import { PaymentMethodsChart } from "./payment-methods-chart";
import { StaffTable } from "./staff-table";
import { PeakHoursHeatmap } from "./peak-hours-heatmap";
import { PrepTimesCards } from "./prep-times-cards";
import { DiscountsTable } from "./discounts-table";
import { ReportsExportButton } from "./reports-export-button";
import { Skeleton } from "@/components/ui/skeleton";

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

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      {isPending && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {!isPending && data.summary && <KpiCards summary={data.summary} />}

      <SalesPeriodChart
        rows={data.byPeriod}
        granularity={granularity}
        onGranularityChange={handleGranularityChange}
        disabled={isPending}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProductsTable rows={data.byProduct} />
        <CategoryBarChart rows={data.byCategory} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PaymentMethodsChart rows={data.byMethod} />
        <StaffTable rows={data.byStaff} />
      </div>

      <PeakHoursHeatmap rows={data.peakHours} />
      <PrepTimesCards rows={data.prepTimes} />
      <DiscountsTable rows={data.discounts} />
    </div>
  );
}
