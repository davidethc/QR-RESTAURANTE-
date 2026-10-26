"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RangeSelector } from "@/components/shared/range-selector";
import type { RangePresetKey } from "@/lib/reports-dates";
import type { ReportRange } from "@/types/reports";

/** Date filter of "Hoy": keeps the range in the URL so the page reloads its cards on the server. */
export function TodayRangeFilter({
  timezone,
  businessDayCutoff,
  range,
  preset,
}: {
  timezone: string;
  businessDayCutoff: string;
  range: ReportRange;
  preset: RangePresetKey;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function handleChange(next: ReportRange, nextPreset: RangePresetKey) {
    const params = new URLSearchParams({ preset: nextPreset });
    if (nextPreset === "custom") {
      params.set("from", next.from);
      params.set("to", next.to);
    }
    startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }));
  }

  return (
    <div aria-busy={pending} className={pending ? "opacity-70 transition-opacity" : undefined}>
      <RangeSelector
        timezone={timezone}
        businessDayCutoff={businessDayCutoff}
        value={range}
        preset={preset}
        onChange={handleChange}
        disabled={pending}
      />
    </div>
  );
}
