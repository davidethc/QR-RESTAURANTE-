/**
 * Aritmética de fechas para el selector de rango de Reportes. Replica en
 * JS la fórmula del día comercial que usan las RPCs `report_*`
 * (`((ts at time zone tz) - cutoff)::date`, ver `business_date()` en
 * `20260926160000_restaurant_local_time_helpers.sql`) para que "Hoy" en el
 * selector caiga exactamente en el mismo día comercial que calcula la base,
 * sin ida y vuelta al servidor.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Hora actual del restaurante como componentes de reloj (sin días DST raros: solo lectura). */
function wallClockParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Día comercial de "ahora mismo" para `timezone`/`cutoff` (HH:MM:SS). Antes
 * del corte, el día comercial sigue siendo el anterior.
 */
export function businessToday(timezone: string, cutoff: string): string {
  const now = new Date();
  const wc = wallClockParts(now, timezone);
  const wallMillis = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second);
  const [ch = 0, cm = 0, cs = 0] = cutoff.split(":").map(Number);
  const cutoffMillis = (ch * 3600 + cm * 60 + cs) * 1000;
  return formatDate(new Date(wallMillis - cutoffMillis));
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function startOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return `${y}-${pad(m)}-01`;
}

export type RangePresetKey = "today" | "yesterday" | "last7" | "thisMonth" | "custom";

export const RANGE_PRESET_LABEL: Record<RangePresetKey, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  last7: "7 días",
  thisMonth: "Este mes",
  custom: "Personalizado",
};

export function rangeForPreset(
  preset: Exclude<RangePresetKey, "custom">,
  timezone: string,
  cutoff: string
): { from: string; to: string } {
  const today = businessToday(timezone, cutoff);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "thisMonth":
      return { from: startOfMonth(today), to: today };
  }
}
