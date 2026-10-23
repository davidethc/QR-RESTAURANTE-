"use client";

import { useEffect, useId, useState } from "react";
import { ChefHat, CircleCheck, Clock, ListFilter, Search, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { posPressable } from "@/components/shared/pos-tone";
import { cn, formatPrice, normalizeText } from "@/lib/utils";
import { formatElapsed, minutesOpen, placeKind, queueStatus, sortQueue, type PlaceKind } from "@/lib/bill-queue";
import { toneSoft } from "@/components/shared/pos-tone";
import type { OpenBillSummary } from "@/types/billing";
import { PlaceIcon } from "./place-icon";

/** Reloj de minuto: los "12 min" de las tarjetas avanzan sin recargar. */
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Fondo y borde de la tarjeta elegida, según su estado. */
const SELECTED = {
  attention: "border-attention-border bg-attention-soft shadow-md",
  "money-in": "border-money-in-border bg-money-in-soft shadow-md",
  info: "border-info-border bg-info-soft shadow-md",
} as const;

const RAIL = {
  attention: "bg-attention",
  "money-in": "bg-money-in",
  info: "bg-info",
} as const;

const KIND_FILTERS: { value: PlaceKind | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "TABLE", label: "Mesas" },
  { value: "TAKEAWAY", label: "Para llevar" },
  { value: "DINE_IN", label: "Para comer aquí" },
  { value: "DELIVERY", label: "Domicilio" },
];

/**
 * Cuentas vivas en dos pestañas: "Por cobrar" (con saldo) y "Pagadas" (sin
 * saldo, esperando cocina), con búsqueda y filtro por tipo de lugar sobre
 * lo que ya está cargado. Cada tarjeta: lugar con su icono,
 * estado (color + icono + texto), tiempo abierta, lo que sigue en cocina y
 * el monto. Un toque la selecciona; la elegida toma el color de su estado.
 */
export function BillQueue({
  bills,
  selectedId,
  onSelect,
  empty,
}: {
  bills: OpenBillSummary[];
  selectedId: string | null;
  onSelect: (bill: OpenBillSummary) => void;
  empty: React.ReactNode;
}) {
  const now = useNow();
  const ids = useId();
  const [tab, setTab] = useState<"owed" | "paid">("owed");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<PlaceKind | "ALL">("ALL");
  if (bills.length === 0) return <>{empty}</>;

  const term = normalizeText(query.trim());
  const sorted = sortQueue(bills).filter(
    (b) => (kind === "ALL" || placeKind(b) === kind) && (!term || normalizeText(b.place_label).includes(term))
  );
  const owed = sorted.filter((b) => queueStatus(b).tone !== "money-in");
  const paid = sorted.filter((b) => queueStatus(b).tone === "money-in");
  const shown = tab === "owed" ? owed : paid;
  const filtering = kind !== "ALL" || term !== "";

  const card = (bill: OpenBillSummary) => {
    const status = queueStatus(bill);
    const kind = placeKind(bill);
    const selected = bill.table_session_id === selectedId;
    const minutes = minutesOpen(bill.opened_at, now);
    const isPaid = status.tone === "money-in";
    return (
      <li key={bill.table_session_id}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => onSelect(bill)}
          className={cn(
            "group relative flex w-full items-center gap-2.5 overflow-hidden rounded-card border bg-card py-3 pr-3 pl-3.5 text-left",
            "touch-manipulation transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:active:scale-100",
            selected ? SELECTED[status.tone] : "border-border hover:border-border-strong hover:shadow-sm"
          )}
        >
          <span
            aria-hidden
            className={cn("absolute inset-y-0 left-0 w-1 transition-opacity duration-150", RAIL[status.tone], selected ? "opacity-100" : "opacity-0")}
          />
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-control border",
              selected ? "border-transparent bg-card text-foreground" : "border-border bg-secondary text-foreground"
            )}
          >
            <PlaceIcon kind={kind} className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-body font-semibold leading-tight text-foreground">{bill.place_label}</span>
            <span className={cn("inline-flex w-fit max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-caption leading-tight font-semibold", toneSoft[status.tone])}>
              {isPaid ? <CircleCheck className="size-3.5 shrink-0" aria-hidden /> : <Clock className="size-3.5 shrink-0" aria-hidden />}
              <span>{status.label}</span>
            </span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
              <span suppressHydrationWarning className="tabular-nums">{formatElapsed(minutes)}</span>
              {bill.active_orders > 0 && (
                <span className="inline-flex items-center gap-1">
                  · <ChefHat className="size-3.5" aria-hidden /> {bill.active_orders} en cocina
                </span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-lead font-semibold leading-tight tabular-nums text-foreground">
              {formatPrice(isPaid ? bill.total : bill.balance)}
            </span>
            {bill.paid_total > 0 && !isPaid && (
              <span className="text-caption tabular-nums text-money-in-soft-foreground">Pagado {formatPrice(bill.paid_total)}</span>
            )}
          </span>
        </button>
      </li>
    );
  };

  const tabs = [
    { id: "owed" as const, label: "Por cobrar", count: owed.length, tone: "attention" as const },
    { id: "paid" as const, label: "Pagadas", count: paid.length, tone: "money-in" as const },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 border-b border-border">
        <div role="tablist" aria-label="Cuentas" className="flex min-w-0 flex-1">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${ids}-${t.id}-tab`}
                aria-selected={active}
                aria-controls={`${ids}-panel`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative -mb-px flex min-h-12 items-center gap-1.5 border-b-2 px-2.5 text-body-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none",
                  active ? "border-money-in text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-caption leading-none tabular-nums",
                    t.count > 0 ? toneSoft[t.tone] : "bg-secondary text-muted-foreground"
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label={searching ? "Cerrar búsqueda" : "Buscar cuenta"}
          aria-pressed={searching}
          onClick={() => {
            if (searching) setQuery("");
            setSearching(!searching);
          }}
          className={cn(
            posPressable,
            "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
            searching && "bg-secondary text-foreground"
          )}
        >
          <Search className="size-5" aria-hidden />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={kind === "ALL" ? "Filtrar por tipo" : `Filtro: ${KIND_FILTERS.find((k) => k.value === kind)?.label}`}
              className={cn(
                posPressable,
                "relative flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
                kind !== "ALL" && "bg-secondary text-foreground"
              )}
            >
              <ListFilter className="size-5" aria-hidden />
              {kind !== "ALL" && <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-money-in" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Tipo de cuenta</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={kind} onValueChange={(v) => setKind(v as PlaceKind | "ALL")}>
              {KIND_FILTERS.map((k) => (
                <DropdownMenuRadioItem key={k.value} value={k.value} className="min-h-11">
                  {k.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {searching && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mesa, número o cliente"
            aria-label="Buscar cuenta"
            className="h-12 w-full rounded-control border border-input bg-card pr-3 pl-9 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          />
        </div>
      )}

      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-${tab}-tab`}>
        {shown.length > 0 ? (
          <ul className="flex flex-col gap-2">{shown.map(card)}</ul>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-5 text-center">
            <p className="text-meta text-muted-foreground">
              {filtering ? "Ninguna cuenta coincide." : tab === "owed" ? "Nada por cobrar ahora." : "No hay cuentas pagadas esperando cocina."}
            </p>
            {filtering && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setKind("ALL");
                }}
                className={cn(posPressable, "flex min-h-11 items-center gap-1.5 rounded-button px-3 text-body-sm font-semibold text-foreground hover:bg-muted")}
              >
                <X className="size-4" aria-hidden /> Quitar filtros
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
