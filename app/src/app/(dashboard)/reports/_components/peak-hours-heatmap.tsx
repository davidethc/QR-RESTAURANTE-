"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatPrice } from "@/lib/utils";
import type { PeakHoursRow } from "@/types/reports";
import { Clock } from "lucide-react";

const DAY_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Mapa de calor 7x24: magnitud (job "sequential" de la skill dataviz), un
 * solo hue de claro a oscuro. La RPC solo manda celdas con datos — el
 * front rellena el resto en cero, como pide la tarea.
 */
export function PeakHoursHeatmap({ rows }: { rows: PeakHoursRow[] }) {
  const [hovered, setHovered] = useState<{ isodow: number; hour: number } | null>(null);

  const grid = useMemo(() => {
    const map = new Map<string, PeakHoursRow>();
    for (const row of rows) map.set(`${row.isodow}-${row.hour}`, row);
    return map;
  }, [rows]);

  const max = Math.max(1, ...rows.map((r) => r.orders_count));
  const hasData = rows.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">Horas pico</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState icon={Clock} title="Sin pedidos en este rango" />
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-grid min-w-[720px] gap-[2px]" style={{ gridTemplateColumns: "40px repeat(24, 1fr)" }}>
              <div />
              {HOURS.map((h) => (
                <div
                  key={`h-${h}`}
                  className="pb-1 text-center text-[10px] text-muted-foreground"
                >
                  {h % 3 === 0 ? h : ""}
                </div>
              ))}
              {DAY_LABEL.map((label, dayIdx) => {
                const isodow = dayIdx + 1;
                return (
                  <div key={isodow} className="contents">
                    <div className="flex items-center pr-2 text-[11px] font-medium text-muted-foreground">
                      {label}
                    </div>
                    {HOURS.map((hour) => {
                      const cell = grid.get(`${isodow}-${hour}`);
                      const count = cell?.orders_count ?? 0;
                      const intensity = count === 0 ? 0 : 0.12 + 0.88 * (count / max);
                      const isHovered = hovered?.isodow === isodow && hovered?.hour === hour;
                      return (
                        <div
                          key={hour}
                          role="gridcell"
                          tabIndex={count > 0 ? 0 : -1}
                          aria-label={
                            count > 0
                              ? `${label} ${hour}:00 — ${count} pedidos, ${formatPrice(cell?.orders_total ?? 0)}`
                              : `${label} ${hour}:00 — sin pedidos`
                          }
                          title={
                            count > 0
                              ? `${label} ${hour}:00 — ${count} pedidos · ${formatPrice(cell?.orders_total ?? 0)}`
                              : undefined
                          }
                          onMouseEnter={() => setHovered({ isodow, hour })}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered({ isodow, hour })}
                          onBlur={() => setHovered(null)}
                          className="aspect-square rounded-[3px] outline-none ring-primary focus-visible:ring-2"
                          style={{
                            backgroundColor:
                              count === 0
                                ? "var(--secondary)"
                                : `color-mix(in oklch, var(--color-chart-1) ${Math.round(intensity * 100)}%, var(--card))`,
                            outline: isHovered ? "2px solid var(--primary)" : undefined,
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Día comercial × hora de reloj. Más oscuro = más pedidos (máximo {max} en una hora).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
