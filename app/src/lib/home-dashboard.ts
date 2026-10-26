import { RANGE_PRESETS, rangeForPreset, type RangePresetKey } from "@/lib/reports-dates";
import type { ReportRange } from "@/types/reports";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

/**
 * Range of the "Hoy" dashboard from the URL (`?preset=…` or
 * `?preset=custom&from=…&to=…`). Anything missing or invalid falls back to
 * today, so a bad link never breaks the page.
 */
export function parseDashboardRange(
  params: { preset?: string; from?: string; to?: string },
  timezone: string,
  cutoff: string
): { range: ReportRange; preset: RangePresetKey } {
  const preset = params.preset as RangePresetKey | undefined;
  if (preset && (RANGE_PRESETS as string[]).includes(preset)) {
    return { range: rangeForPreset(preset as Exclude<RangePresetKey, "custom">, timezone, cutoff), preset };
  }
  const { from, to } = params;
  if (
    preset === "custom" &&
    from && to && DATE.test(from) && DATE.test(to) &&
    to >= from && daysBetween(from, to) <= MAX_DAYS
  ) {
    return { range: { from, to }, preset: "custom" };
  }
  return { range: rangeForPreset("today", timezone, cutoff), preset: "today" };
}

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export const DASHBOARD_SERVICE_LABEL: Record<string, string> = {
  delivery: "Domicilio",
  takeaway: "Para llevar o recoger",
  pickup: "Para llevar o recoger",
  dine_in_no_table: "En el local",
  table: "Mesas",
};

/**
 * Sales by service option with the spec's four buckets: takeaway and pickup
 * are the same option for the customer, so they add up into one row.
 */
export function groupByServiceOption<T extends { service_type: string; total: number; pos: number; digital: number }>(
  rows: T[]
): { label: string; total: number; pos: number; digital: number }[] {
  const map = new Map<string, { label: string; total: number; pos: number; digital: number }>();
  for (const row of rows) {
    const label = DASHBOARD_SERVICE_LABEL[row.service_type] ?? row.service_type;
    const prev = map.get(label) ?? { label, total: 0, pos: 0, digital: 0 };
    map.set(label, {
      label,
      total: prev.total + Number(row.total),
      pos: prev.pos + Number(row.pos),
      digital: prev.digital + Number(row.digital),
    });
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
