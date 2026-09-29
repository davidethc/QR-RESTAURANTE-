import { formatPrice } from "@/lib/utils";

const WEEKDAY = new Intl.DateTimeFormat("es-EC", { weekday: "short", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });

/** Todos los días del rango, con 0 donde no hubo ventas. */
function fillDays(from: string, to: string, rows: { date: string; total: number }[]) {
  const byDate = new Map(rows.map((r) => [r.date, Number(r.total)]));
  const days: { date: Date; key: string; total: number }[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({ date: new Date(d), key, total: byDate.get(key) ?? 0 });
  }
  return days;
}

/**
 * Una sola serie (venta por día): barras finas desde la base, sin leyenda;
 * el título nombra la serie. Cada barra tiene su tooltip nativo y etiqueta
 * accesible; el mejor día lleva su monto escrito.
 */
export function DailyBars({
  from,
  to,
  rows,
}: {
  from: string;
  to: string;
  rows: { date: string; total: number }[];
}) {
  const days = fillDays(from, to, rows);
  const max = Math.max(...days.map((d) => d.total), 0);
  const best = days.reduce((a, b) => (b.total > a.total ? b : a), days[0]);
  const showEvery = days.length > 10 ? 5 : 1;

  return (
    <figure className="flex flex-col gap-3 rounded-card border border-border bg-card p-5">
      <figcaption className="text-body font-semibold text-foreground">Venta por día</figcaption>
      <div className="flex h-40 items-end gap-[2px]" role="list">
        {days.map((d) => {
          const pct = max > 0 ? (d.total / max) * 100 : 0;
          const label = `${DAY_MONTH.format(d.date)}: ${formatPrice(d.total)}`;
          return (
            <div
              key={d.key}
              role="listitem"
              aria-label={label}
              title={label}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              {d === best && d.total > 0 && (
                <span className="mb-1 self-center whitespace-nowrap text-tiny font-semibold tabular-nums text-foreground">
                  {formatPrice(d.total)}
                </span>
              )}
              <div
                className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(pct, d.total > 0 ? 2 : 0)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px] border-t border-border pt-1">
        {days.map((d, i) => (
          <span key={d.key} className="flex-1 text-center text-micro text-muted-foreground">
            {i % showEvery === 0 ? (days.length > 10 ? DAY_MONTH.format(d.date) : WEEKDAY.format(d.date)) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}
