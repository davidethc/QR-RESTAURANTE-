"use client";

import { Clock } from "lucide-react";
import { posPressable, toneBar, toneSoft } from "@/components/shared/pos-tone";
import { formatElapsed } from "@/lib/bill-queue";
import { cn, formatPrice } from "@/lib/utils";
import type { PanelTable } from "@/lib/queries/tables-panel";
import { tableLabel, type TableStateMeta } from "./table-state";

/** Tile surface per tone: the whole card carries the state, not only the chip. */
const SURFACE = {
  neutral: "border-border bg-card",
  info: "border-info-border bg-info-soft/60",
  attention: "border-attention-border bg-attention-soft/70",
  "money-out": "border-money-out-border bg-money-out-soft/70",
  "money-in": "border-money-in-border bg-money-in-soft/70",
} as const;

/**
 * One table on the floor: name, state chip (icon + text), amount and time
 * since the oldest order still in the kitchen. Extra states show as small
 * icon badges so a table that calls the waiter AND asks for the bill shows both.
 */
export function TableTile({
  table,
  states,
  occupied,
  minutes,
  selected,
  onSelect,
  className,
  style,
}: {
  table: PanelTable;
  states: TableStateMeta[];
  occupied: boolean;
  /** Minutes since the oldest active order, or null when unknown. */
  minutes: number | null;
  selected: boolean;
  onSelect: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [main, ...extra] = states;
  const Icon = main.icon;
  const label = tableLabel(table);
  const fresh = table.orders.some((o) => o.isNew);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      aria-pressed={selected}
      aria-label={[
        label,
        states.map((s) => s.label).join(", "),
        occupied && table.total > 0 ? formatPrice(table.total) : null,
        minutes !== null ? formatElapsed(minutes) : null,
      ]
        .filter(Boolean)
        .join(", ")}
      className={cn(
        posPressable,
        "group relative flex min-h-28 w-full flex-col justify-between gap-2 overflow-hidden rounded-card border p-3 pl-4 text-left shadow-sm",
        SURFACE[main.tone],
        selected ? "ring-3 ring-foreground/80 ring-offset-2 ring-offset-background" : "hover:shadow-md",
        className
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", toneBar[main.tone])} />

      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-lead font-semibold leading-tight text-foreground">{label}</span>
        {extra.length > 0 && (
          <span className="flex shrink-0 gap-1">
            {extra.map((s) => {
              const ExtraIcon = s.icon;
              return (
                <span
                  key={s.key}
                  title={s.label}
                  className={cn("flex size-6 items-center justify-center rounded-full border", toneSoft[s.tone])}
                >
                  <ExtraIcon className="size-3.5" aria-hidden />
                </span>
              );
            })}
          </span>
        )}
      </span>

      <span
        className={cn(
          "inline-flex w-fit max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold leading-tight",
          toneSoft[main.tone],
          main.tone === "neutral" && "bg-secondary text-muted-foreground"
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span>{main.label}</span>
        {main.key === "qr" && table.pendingApproval > 1 && <span className="tabular-nums">· {table.pendingApproval}</span>}
      </span>

      {occupied ? (
        <span className="flex items-end justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-caption tabular-nums text-muted-foreground">
            {minutes !== null && (
              <>
                <Clock className="size-3.5 shrink-0" aria-hidden />
                <span suppressHydrationWarning>{formatElapsed(minutes)}</span>
              </>
            )}
            {fresh && (
              <span className="ml-1 inline-flex items-center gap-1 font-semibold text-money-in-soft-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-money-in" /> Nueva
              </span>
            )}
          </span>
          {table.total > 0 ? (
            <span className="shrink-0 text-lead font-semibold leading-none tabular-nums text-foreground">{formatPrice(table.total)}</span>
          ) : (
            <span className="shrink-0 text-caption text-muted-foreground">Sin pedidos</span>
          )}
        </span>
      ) : (
        <span className="text-caption text-muted-foreground">Sin cliente</span>
      )}
    </button>
  );
}
